use axum::{
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    Json,
};
use uuid::Uuid;

use crate::{internal_error, AppState, ErrorResponse};

use super::models::AuthUser;

pub(crate) async fn require_approved_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthUser, (StatusCode, Json<ErrorResponse>)> {
    let user = require_auth_user(state, headers).await?;
    if user.status != "approved" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                code: "account_not_approved",
                message: "account is not approved".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    }
    Ok(user)
}

pub(crate) async fn require_admin_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthUser, (StatusCode, Json<ErrorResponse>)> {
    let user = require_approved_user(state, headers).await?;
    if user.role != "admin" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                code: "admin_required",
                message: "admin role is required".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    }
    Ok(user)
}

pub(crate) async fn require_auth_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthUser, (StatusCode, Json<ErrorResponse>)> {
    let token = parse_bearer_uuid_token(headers)?;

    let user = sqlx::query_as::<_, AuthUser>(
        r#"
        SELECT u.id, u.username, u.login, u.role, u.status
        FROM auth_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = $1 AND t.expires_at > NOW()
        "#,
    )
    .bind(token)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to validate token: {error}")))?;

    match user {
        Some(user) => Ok(user),
        None => Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                code: "unauthorized",
                message: "authorization required".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )),
    }
}

fn extract_bearer_token(headers: &HeaderMap) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let value = headers.get(AUTHORIZATION).ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                code: "unauthorized",
                message: "missing authorization header".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    let value = value.to_str().map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                code: "unauthorized",
                message: "invalid authorization header".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    if let Some(token) = value.strip_prefix("Bearer ") {
        return Ok(token.trim().to_string());
    }

    Err((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse {
            code: "unauthorized",
            message: "authorization header must be Bearer token".to_string(),
            details: None,
            request_id: crate::new_request_id(),
        }),
    ))
}

pub(crate) fn parse_bearer_uuid_token(
    headers: &HeaderMap,
) -> Result<Uuid, (StatusCode, Json<ErrorResponse>)> {
    let token_str = extract_bearer_token(headers)?;
    Uuid::parse_str(&token_str).map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                code: "invalid_token",
                message: "invalid authorization token".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })
}
