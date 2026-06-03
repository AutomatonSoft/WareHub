use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{internal_error, validation_error, AppState, ErrorResponse};

use super::guards::require_admin_user;

#[derive(Debug, FromRow)]
struct UserRoleRow {
    id: Uuid,
    role: String,
}

pub(crate) async fn admin_delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let admin = require_admin_user(&state, &headers).await?;

    let target = sqlx::query_as::<_, UserRoleRow>(
        r#"
        SELECT id, role
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to read user before delete: {error}")))?;

    let Some(target) = target else {
        return Err(validation_error("user_not_found", "user not found"));
    };

    assert_delete_allowed(admin.id, target.id, &target.role, &state).await?;

    let affected = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(target.id)
        .execute(&state.db)
        .await
        .map_err(|error| internal_error(format!("failed to delete user: {error}")))?;

    if affected.rows_affected() == 0 {
        return Err(validation_error("user_not_found", "user not found"));
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn assert_delete_allowed(
    admin_id: Uuid,
    target_id: Uuid,
    target_role: &str,
    state: &AppState,
) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    if target_id == admin_id {
        return Err(validation_error(
            "self_delete_forbidden",
            "admin cannot delete own account",
        ));
    }

    if target_role == "admin" {
        let admin_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'approved'",
        )
        .fetch_one(&state.db)
        .await
        .map_err(|error| internal_error(format!("failed to count admins: {error}")))?;

        if is_last_admin_deletion_forbidden(target_role, admin_count) {
            return Err(validation_error(
                "last_admin_forbidden",
                "cannot delete the last admin",
            ));
        }
    }

    Ok(())
}

fn is_last_admin_deletion_forbidden(target_role: &str, admin_count: i64) -> bool {
    target_role == "admin" && admin_count <= 1
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_self_delete_allowed(admin_id: Uuid, target_id: Uuid) -> bool {
        admin_id != target_id
    }

    #[test]
    fn cannot_delete_self() {
        let id = Uuid::new_v4();
        assert!(!assert_self_delete_allowed(id, id));
    }

    #[test]
    fn can_delete_other_user() {
        let admin_id = Uuid::new_v4();
        let target_id = Uuid::new_v4();
        assert!(assert_self_delete_allowed(admin_id, target_id));
    }

    #[test]
    fn cannot_delete_last_admin() {
        assert!(is_last_admin_deletion_forbidden("admin", 1));
    }

    #[test]
    fn can_delete_admin_when_more_than_one_exists() {
        assert!(!is_last_admin_deletion_forbidden("admin", 2));
    }

    #[test]
    fn user_deletion_is_never_blocked_by_admin_count() {
        assert!(!is_last_admin_deletion_forbidden("user", 1));
    }
}
