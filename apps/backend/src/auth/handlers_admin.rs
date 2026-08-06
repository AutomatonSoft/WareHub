use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use sqlx::{Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{internal_error, validation_error, AppState, ErrorResponse};

use super::{
    dto::{
        AdminUserDto, PendingCountResponse, PendingUserDto, RegisterResponse, UpdateUserRoleRequest,
    },
    guards::require_admin_user,
};

#[derive(Debug, Deserialize, Default)]
pub(crate) struct AdminUsersQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub search: Option<String>,
    pub role: Option<String>,
    pub status: Option<String>,
    pub sort: Option<String>,
}

pub(crate) async fn admin_list_pending_registrations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<PendingUserDto>>, (StatusCode, Json<ErrorResponse>)> {
    require_admin_user(&state, &headers).await?;

    let users = sqlx::query_as::<_, PendingUserDto>(
        r#"
        SELECT id, username, login, email, role, status, created_at
        FROM users
        WHERE status = 'pending'
        ORDER BY created_at ASC
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to list pending registrations: {error}")))?;

    Ok(Json(users))
}

pub(crate) async fn admin_list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AdminUsersQuery>,
) -> Result<Json<Vec<AdminUserDto>>, (StatusCode, Json<ErrorResponse>)> {
    require_admin_user(&state, &headers).await?;

    let limit = normalize_admin_users_limit(query.limit)?;
    let offset = normalize_admin_users_offset(query.offset)?;
    let role_filter = normalize_user_role_filter(query.role.as_deref())?;
    let status_filter = normalize_user_status_filter(query.status.as_deref())?;
    let sort_order = normalize_admin_users_sort(query.sort.as_deref())?;
    let search_query = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let mut qb =
        QueryBuilder::<Postgres>::new(admin_users_select_clause("u"));
    qb.push(" FROM users u");
    qb.push(" LEFT JOIN users approver ON approver.id = u.approved_by");
    let mut has_where = false;

    if let Some(role) = role_filter {
        qb.push(" WHERE u.role = ");
        qb.push_bind(role);
        has_where = true;
    }

    if let Some(status) = status_filter {
        if has_where {
            qb.push(" AND u.status = ");
        } else {
            qb.push(" WHERE u.status = ");
            has_where = true;
        }
        qb.push_bind(status);
    }

    if let Some(search) = search_query {
        let pattern = format!("%{}%", search.to_ascii_lowercase());
        if has_where {
            qb.push(" AND ");
        } else {
            qb.push(" WHERE ");
        }
        qb.push("(LOWER(u.username) LIKE ");
        qb.push_bind(pattern.clone());
        qb.push(" OR LOWER(u.login) LIKE ");
        qb.push_bind(pattern.clone());
        qb.push(" OR LOWER(COALESCE(u.email, '')) LIKE ");
        qb.push_bind(pattern.clone());
        qb.push(" OR LOWER(COALESCE(u.first_name, '')) LIKE ");
        qb.push_bind(pattern.clone());
        qb.push(" OR LOWER(COALESCE(u.last_name, '')) LIKE ");
        qb.push_bind(pattern.clone());
        qb.push(" OR LOWER(u.role) LIKE ");
        qb.push_bind(pattern.clone());
        qb.push(" OR LOWER(u.status) LIKE ");
        qb.push_bind(pattern);
        qb.push(")");
    }

    qb.push(" ORDER BY u.created_at ");
    qb.push(sort_order);
    qb.push(", u.id ");
    qb.push(sort_order);
    qb.push(" LIMIT ");
    qb.push_bind(limit);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let users = qb
        .build_query_as::<AdminUserDto>()
        .fetch_all(&state.db)
        .await
        .map_err(|error| internal_error(format!("failed to list users: {error}")))?;

    Ok(Json(users))
}

pub(crate) async fn admin_pending_registration_count(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<PendingCountResponse>, (StatusCode, Json<ErrorResponse>)> {
    require_admin_user(&state, &headers).await?;
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE status = 'pending'")
        .fetch_one(&state.db)
        .await
        .map_err(|error| {
            internal_error(format!("failed to count pending registrations: {error}"))
        })?;

    Ok(Json(PendingCountResponse {
        pending_count: count,
    }))
}

pub(crate) async fn admin_approve_registration(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<AdminUserDto>, (StatusCode, Json<ErrorResponse>)> {
    let admin = require_admin_user(&state, &headers).await?;

    let affected = sqlx::query(
        r#"
        UPDATE users
        SET status = 'approved', approved_at = NOW(), approved_by = $1
        WHERE id = $2 AND status = 'pending'
        "#,
    )
    .bind(admin.id)
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to approve registration: {error}")))?;

    if affected.rows_affected() > 0 {
        let user = load_admin_user(&state, user_id)
            .await?
            .ok_or_else(|| internal_error("approved user disappeared after update".to_string()))?;
        return Ok(Json(user));
    }

    let current = load_admin_user(&state, user_id).await?;

    if let Some(user) = current {
        if user.status == "approved" {
            return Ok(Json(user));
        }
        return Err(validation_error(
            "registration_not_pending",
            "registration is not pending",
        ));
    }

    Err(validation_error(
        "registration_not_found",
        "pending registration not found",
    ))
}

pub(crate) async fn admin_reject_registration(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<RegisterResponse>, (StatusCode, Json<ErrorResponse>)> {
    require_admin_user(&state, &headers).await?;

    let affected = sqlx::query(
        r#"
        UPDATE users
        SET status = 'rejected', approved_at = NULL, approved_by = NULL
        WHERE id = $1 AND status = 'pending'
        "#,
    )
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to reject registration: {error}")))?;

    if affected.rows_affected() == 0 {
        return Err(validation_error(
            "registration_not_found",
            "pending registration not found",
        ));
    }

    Ok(Json(RegisterResponse {
        message: "registration rejected".to_string(),
        status: "rejected",
    }))
}

pub(crate) async fn admin_update_user_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
    Json(payload): Json<UpdateUserRoleRequest>,
) -> Result<Json<AdminUserDto>, (StatusCode, Json<ErrorResponse>)> {
    let admin = require_admin_user(&state, &headers).await?;
    let next_role = normalize_user_role(&payload.role)?;

    let current = sqlx::query_as::<_, AdminUserDto>(
        &format!("{} FROM users u LEFT JOIN users approver ON approver.id = u.approved_by WHERE u.id = $1", admin_users_select_clause("u")),
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to read user for role update: {error}")))?;

    let Some(current) = current else {
        return Err(validation_error("user_not_found", "user not found"));
    };

    if current.role == next_role {
        return Ok(Json(current));
    }

    if current.id == admin.id && next_role != "admin" {
        return Err(validation_error(
            "self_demote_forbidden",
            "admin cannot change own role",
        ));
    }

    if current.role == "admin" && next_role != "admin" {
        let admin_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'approved'",
        )
        .fetch_one(&state.db)
        .await
        .map_err(|error| internal_error(format!("failed to count admins: {error}")))?;

        if admin_count <= 1 {
            return Err(validation_error(
                "last_admin_forbidden",
                "cannot remove the last admin",
            ));
        }
    }

    sqlx::query(
        r#"
        UPDATE users
        SET role = $1
        WHERE id = $2
        "#,
    )
    .bind(next_role)
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to update user role: {error}")))?;

    let updated = load_admin_user(&state, user_id)
        .await?
        .ok_or_else(|| internal_error("updated user disappeared after role change".to_string()))?;

    Ok(Json(updated))
}

fn normalize_user_role(value: &str) -> Result<&'static str, (StatusCode, Json<ErrorResponse>)> {
    match value.trim().to_ascii_lowercase().as_str() {
        "admin" => Ok("admin"),
        "user" => Ok("user"),
        _ => Err(validation_error(
            "invalid_role",
            "role must be either 'admin' or 'user'",
        )),
    }
}

fn normalize_user_role_filter(
    value: Option<&str>,
) -> Result<Option<&'static str>, (StatusCode, Json<ErrorResponse>)> {
    match value.map(str::trim).filter(|raw| !raw.is_empty()) {
        None => Ok(None),
        Some(raw) => {
            if raw.eq_ignore_ascii_case("all") {
                Ok(None)
            } else {
                normalize_user_role(raw).map(Some)
            }
        }
    }
}

fn normalize_user_status_filter(
    value: Option<&str>,
) -> Result<Option<&'static str>, (StatusCode, Json<ErrorResponse>)> {
    match value.map(str::trim).filter(|raw| !raw.is_empty()) {
        None => Ok(None),
        Some(raw) => match raw.to_ascii_lowercase().as_str() {
            "all" => Ok(None),
            "pending" => Ok(Some("pending")),
            "approved" => Ok(Some("approved")),
            "rejected" => Ok(Some("rejected")),
            _ => Err(validation_error(
                "invalid_status",
                "status must be one of: pending, approved, rejected",
            )),
        },
    }
}

fn normalize_admin_users_sort(
    value: Option<&str>,
) -> Result<&'static str, (StatusCode, Json<ErrorResponse>)> {
    match value.map(str::trim).filter(|raw| !raw.is_empty()) {
        None => Ok("DESC"),
        Some(raw) => match raw.to_ascii_lowercase().as_str() {
            "newest" | "desc" => Ok("DESC"),
            "oldest" | "asc" => Ok("ASC"),
            _ => Err(validation_error(
                "invalid_sort",
                "sort must be either 'newest' or 'oldest'",
            )),
        },
    }
}

fn normalize_admin_users_limit(
    value: Option<i64>,
) -> Result<i64, (StatusCode, Json<ErrorResponse>)> {
    const DEFAULT_LIMIT: i64 = 100;
    const MAX_LIMIT: i64 = 500;
    let limit = value.unwrap_or(DEFAULT_LIMIT);
    if (1..=MAX_LIMIT).contains(&limit) {
        Ok(limit)
    } else {
        Err(validation_error(
            "invalid_limit",
            "limit must be between 1 and 500",
        ))
    }
}

fn normalize_admin_users_offset(
    value: Option<i64>,
) -> Result<i64, (StatusCode, Json<ErrorResponse>)> {
    let offset = value.unwrap_or(0);
    if offset >= 0 {
        Ok(offset)
    } else {
        Err(validation_error("invalid_offset", "offset must be >= 0"))
    }
}

async fn load_admin_user(
    state: &AppState,
    user_id: Uuid,
) -> Result<Option<AdminUserDto>, (StatusCode, Json<ErrorResponse>)> {
    sqlx::query_as::<_, AdminUserDto>(&format!(
        "{} FROM users u LEFT JOIN users approver ON approver.id = u.approved_by WHERE u.id = $1",
        admin_users_select_clause("u")
    ))
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to load admin user: {error}")))
}

fn admin_users_select_clause(alias: &str) -> String {
    format!(
        "SELECT {alias}.id, {alias}.username, {alias}.login, {alias}.email, {alias}.first_name, {alias}.last_name, {alias}.avatar_url, {alias}.role, {alias}.status, {alias}.created_at, {alias}.approved_at, {alias}.approved_by, approver.login AS approved_by_login"
    )
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_admin_users_limit, normalize_admin_users_offset, normalize_admin_users_sort,
        normalize_user_role, normalize_user_role_filter, normalize_user_status_filter,
    };

    #[test]
    fn normalize_user_role_accepts_admin() {
        let result = normalize_user_role("admin");
        assert!(matches!(result, Ok("admin")));
    }

    #[test]
    fn normalize_user_role_accepts_user_case_insensitive() {
        let result = normalize_user_role("UsEr");
        assert!(matches!(result, Ok("user")));
    }

    #[test]
    fn normalize_user_role_rejects_worker() {
        let result = normalize_user_role("worker");
        assert!(result.is_err());
    }

    #[test]
    fn normalize_user_role_filter_accepts_all() {
        let result = normalize_user_role_filter(Some("all"));
        assert!(matches!(result, Ok(None)));
    }

    #[test]
    fn normalize_user_status_filter_accepts_approved() {
        let result = normalize_user_status_filter(Some("approved"));
        assert!(matches!(result, Ok(Some("approved"))));
    }

    #[test]
    fn normalize_user_status_filter_rejects_unknown() {
        let result = normalize_user_status_filter(Some("active"));
        assert!(result.is_err());
    }

    #[test]
    fn normalize_admin_users_sort_accepts_oldest() {
        let result = normalize_admin_users_sort(Some("oldest"));
        assert!(matches!(result, Ok("ASC")));
    }

    #[test]
    fn normalize_admin_users_limit_uses_default() {
        let result = normalize_admin_users_limit(None);
        assert!(matches!(result, Ok(100)));
    }

    #[test]
    fn normalize_admin_users_limit_rejects_too_large() {
        let result = normalize_admin_users_limit(Some(501));
        assert!(result.is_err());
    }

    #[test]
    fn normalize_admin_users_offset_rejects_negative() {
        let result = normalize_admin_users_offset(Some(-1));
        assert!(result.is_err());
    }
}
