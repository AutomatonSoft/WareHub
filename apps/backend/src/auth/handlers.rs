use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{Duration, Utc};
use std::env;
use uuid::Uuid;

use crate::{internal_error, validation_error, AppState, ErrorResponse};

use super::{
    dto::{AuthUserResponse, LoginRequest, LoginResponse, RegisterRequest, RegisterResponse},
    guards::parse_bearer_uuid_token,
    models::UserWithPasswordRow,
    password::verify_password,
    registration_errors::{map_registration_error, validation_error_response},
    repository::PgAuthRepository,
    service::RegistrationService,
    validation::normalize_login,
};

pub(crate) use super::handlers_admin::{
    admin_approve_registration, admin_list_pending_registrations, admin_list_users,
    admin_pending_registration_count, admin_reject_registration, admin_update_user_role,
};
pub(crate) use super::handlers_password_reset::{confirm_password_reset, request_password_reset};

pub(crate) async fn register_user(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<RegisterResponse>), (StatusCode, Json<ErrorResponse>)> {
    if let Err(errors) = payload.validate_all() {
        return Err(validation_error_response(errors));
    }

    let service = RegistrationService::new(PgAuthRepository::new(&state.db));
    match service.register(&payload).await {
        Ok(response) => Ok((StatusCode::CREATED, Json(response))),
        Err(error) => Err(map_registration_error(error)),
    }
}

pub(crate) async fn login_user(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, Json<ErrorResponse>)> {
    let login = normalize_login(&payload.login)?;

    let user = sqlx::query_as::<_, UserWithPasswordRow>(
        r#"
        SELECT id, username, login, email, first_name, last_name, phone_number, avatar_url, role, status, password_hash
        FROM users
        WHERE login = $1
        "#,
    )
    .bind(login)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to query user: {error}")))?;

    let Some(user) = user else {
        return Err(validation_error(
            "invalid_credentials",
            "invalid login or password",
        ));
    };

    if !verify_password(&payload.password, &user.password_hash) {
        return Err(validation_error(
            "invalid_credentials",
            "invalid login or password",
        ));
    }

    if user.status == "pending" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                code: "account_pending",
                message: "account is waiting for admin approval".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    }

    if user.status == "rejected" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                code: "account_rejected",
                message: "account was rejected by admin".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    }

    let token = Uuid::new_v4();
    let expires_at = Utc::now() + Duration::hours(auth_token_ttl_hours());

    sqlx::query(
        r#"
        INSERT INTO auth_tokens (token, user_id, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(token)
    .bind(user.id)
    .bind(expires_at)
    .execute(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to create auth token: {error}")))?;

    Ok(Json(LoginResponse {
        token: token.to_string(),
        user: AuthUserResponse {
            id: user.id,
            username: user.username,
            login: user.login,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            phone_number: user.phone_number,
            avatar_url: user.avatar_url,
            role: user.role,
            status: user.status,
        },
    }))
}

pub(crate) async fn logout_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let token = parse_bearer_uuid_token(&headers)?;
    sqlx::query("DELETE FROM auth_tokens WHERE token = $1")
        .bind(token)
        .execute(&state.db)
        .await
        .map_err(|error| internal_error(format!("failed to delete auth token: {error}")))?;
    Ok(StatusCode::NO_CONTENT)
}

fn auth_token_ttl_hours() -> i64 {
    const DEFAULT_HOURS: i64 = 24;
    const MAX_HOURS: i64 = 24 * 14;
    env::var("AUTH_TOKEN_TTL_HOURS")
        .ok()
        .and_then(|raw| raw.trim().parse::<i64>().ok())
        .filter(|hours| *hours > 0 && *hours <= MAX_HOURS)
        .unwrap_or(DEFAULT_HOURS)
}
