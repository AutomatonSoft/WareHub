use axum::{
    body::Bytes,
    extract::State,
    http::{header::COOKIE, header::SET_COOKIE, HeaderMap, HeaderValue, StatusCode},
    Json,
};
use chrono::{Duration, Utc};
use sqlx::PgPool;
use std::env;
use uuid::Uuid;

use crate::{internal_error, validation_error, AppState, ErrorResponse};

use super::{
    dto::{
        AuthUserResponse, LoginRequest, LoginResponse, RefreshTokenRequest, RegisterRequest,
        RegisterResponse,
    },
    guards::parse_bearer_uuid_token,
    models::{RefreshSessionRow, UserWithPasswordRow},
    password::verify_password,
    registration_errors::{map_registration_error, validation_error_response},
    repository::PgAuthRepository,
    service::RegistrationService,
    validation::normalize_login,
};

const REFRESH_COOKIE_NAME: &str = "sofortbot_refresh_token";
const MOBILE_AUTH_CLIENT_HEADER: &str = "x-warehub-client";
const MOBILE_AUTH_CLIENT_VALUE: &str = "mobile";

pub(crate) use super::handlers_admin::{
    admin_approve_registration, admin_list_pending_registrations, admin_list_users,
    admin_pending_registration_count, admin_reject_registration, admin_update_user_role,
};

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
    request_headers: HeaderMap,
    Json(payload): Json<LoginRequest>,
) -> Result<(HeaderMap, Json<LoginResponse>), (StatusCode, Json<ErrorResponse>)> {
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

    ensure_user_can_authenticate(&user.status)?;

    let issued = issue_auth_session(&state.db, build_auth_user_response(&user)).await?;
    let include_refresh_token = is_mobile_auth_client(&request_headers);
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        SET_COOKIE,
        build_refresh_cookie_header(&state, &issued.refresh_token, auth_refresh_session_ttl_days())?,
    );

    Ok((
        response_headers,
        Json(build_login_response(issued, include_refresh_token)),
    ))
}

pub(crate) async fn refresh_user(
    State(state): State<AppState>,
    request_headers: HeaderMap,
    body: Bytes,
) -> Result<(HeaderMap, Json<LoginResponse>), (StatusCode, Json<ErrorResponse>)> {
    let refresh_token = parse_refresh_token(&request_headers, &body)?;

    let session = sqlx::query_as::<_, RefreshSessionRow>(
        r#"
        SELECT s.id, s.user_id, u.status
        FROM auth_refresh_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
        "#,
    )
    .bind(refresh_token)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to load refresh session: {error}")))?;

    let Some(session) = session else {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                code: "unauthorized",
                message: "refresh session is invalid or expired".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    };

    ensure_user_can_authenticate(&session.status)?;
    let user = load_auth_user_response(&state.db, session.user_id).await?;
    let rotated = rotate_refresh_session(&state.db, &session, user).await?;
    let include_refresh_token =
        is_mobile_auth_client(&request_headers) || has_json_refresh_payload(&body);

    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        SET_COOKIE,
        build_refresh_cookie_header(&state, &rotated.refresh_token, auth_refresh_session_ttl_days())?,
    );

    Ok((
        response_headers,
        Json(build_login_response(rotated, include_refresh_token)),
    ))
}

pub(crate) async fn logout_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(HeaderMap, StatusCode), (StatusCode, Json<ErrorResponse>)> {
    if let Ok(token) = parse_bearer_uuid_token(&headers) {
        sqlx::query("DELETE FROM auth_tokens WHERE token = $1")
            .bind(token)
            .execute(&state.db)
            .await
            .map_err(|error| internal_error(format!("failed to delete auth token: {error}")))?;
    }

    if let Ok(refresh_token) = parse_refresh_token(&headers, &body) {
        sqlx::query(
            r#"
            UPDATE auth_refresh_sessions
            SET revoked_at = NOW()
            WHERE token = $1 AND revoked_at IS NULL
            "#,
        )
        .bind(refresh_token)
        .execute(&state.db)
        .await
        .map_err(|error| internal_error(format!("failed to revoke refresh session: {error}")))?;
    }

    let mut headers = HeaderMap::new();
    headers.insert(SET_COOKIE, expired_refresh_cookie_header(&state)?);
    Ok((headers, StatusCode::NO_CONTENT))
}

fn build_login_response(issued: IssuedAuthSession, include_refresh_token: bool) -> LoginResponse {
    let access_token = issued.access_token.to_string();
    LoginResponse {
        access_token: access_token.clone(),
        token: access_token,
        refresh_token: include_refresh_token.then(|| issued.refresh_token.to_string()),
        user: issued.user,
    }
}

fn is_mobile_auth_client(headers: &HeaderMap) -> bool {
    headers
        .get(MOBILE_AUTH_CLIENT_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().eq_ignore_ascii_case(MOBILE_AUTH_CLIENT_VALUE))
        .unwrap_or(false)
}

struct IssuedAuthSession {
    access_token: Uuid,
    refresh_token: Uuid,
    user: AuthUserResponse,
}

async fn issue_auth_session(
    db: &PgPool,
    user: AuthUserResponse,
) -> Result<IssuedAuthSession, (StatusCode, Json<ErrorResponse>)> {
    let mut tx = db
        .begin()
        .await
        .map_err(|error| internal_error(format!("failed to start auth session tx: {error}")))?;

    let access_token = Uuid::new_v4();
    let refresh_session_id = Uuid::new_v4();
    let refresh_token = Uuid::new_v4();
    let access_expires_at = Utc::now() + Duration::minutes(auth_access_token_ttl_minutes());
    let refresh_expires_at = Utc::now() + Duration::days(auth_refresh_session_ttl_days());

    sqlx::query(
        r#"
        INSERT INTO auth_tokens (token, user_id, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(access_token)
    .bind(user.id)
    .bind(access_expires_at)
    .execute(&mut *tx)
    .await
    .map_err(|error| internal_error(format!("failed to create auth token: {error}")))?;

    sqlx::query(
        r#"
        INSERT INTO auth_refresh_sessions (id, token, user_id, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(refresh_session_id)
    .bind(refresh_token)
    .bind(user.id)
    .bind(refresh_expires_at)
    .execute(&mut *tx)
    .await
    .map_err(|error| internal_error(format!("failed to create refresh session: {error}")))?;

    tx.commit()
        .await
        .map_err(|error| internal_error(format!("failed to commit auth session tx: {error}")))?;

    Ok(IssuedAuthSession {
        access_token,
        refresh_token,
        user,
    })
}

async fn rotate_refresh_session(
    db: &PgPool,
    current_session: &RefreshSessionRow,
    user: AuthUserResponse,
) -> Result<IssuedAuthSession, (StatusCode, Json<ErrorResponse>)> {
    let mut tx = db.begin().await.map_err(|error| {
        internal_error(format!("failed to start refresh rotation tx: {error}"))
    })?;

    let next_session_id = Uuid::new_v4();
    let next_refresh_token = Uuid::new_v4();
    let next_access_token = Uuid::new_v4();
    let next_access_expires_at = Utc::now() + Duration::minutes(auth_access_token_ttl_minutes());
    let next_refresh_expires_at = Utc::now() + Duration::days(auth_refresh_session_ttl_days());

    sqlx::query(
        r#"
        INSERT INTO auth_refresh_sessions (id, token, user_id, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(next_session_id)
    .bind(next_refresh_token)
    .bind(current_session.user_id)
    .bind(next_refresh_expires_at)
    .execute(&mut *tx)
    .await
    .map_err(|error| internal_error(format!("failed to create next refresh session: {error}")))?;

    sqlx::query(
        r#"
        UPDATE auth_refresh_sessions
        SET revoked_at = NOW(),
            last_used_at = NOW(),
            replaced_by_session_id = $2
        WHERE id = $1
        "#,
    )
    .bind(current_session.id)
    .bind(next_session_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| internal_error(format!("failed to rotate refresh session: {error}")))?;

    sqlx::query(
        r#"
        INSERT INTO auth_tokens (token, user_id, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(next_access_token)
    .bind(current_session.user_id)
    .bind(next_access_expires_at)
    .execute(&mut *tx)
    .await
    .map_err(|error| internal_error(format!("failed to create refreshed access token: {error}")))?;

    tx.commit()
        .await
        .map_err(|error| internal_error(format!("failed to commit refresh rotation tx: {error}")))?;

    Ok(IssuedAuthSession {
        access_token: next_access_token,
        refresh_token: next_refresh_token,
        user,
    })
}

async fn load_auth_user_response(
    db: &PgPool,
    user_id: Uuid,
) -> Result<AuthUserResponse, (StatusCode, Json<ErrorResponse>)> {
    sqlx::query_as::<_, AuthUserResponse>(
        r#"
        SELECT id, username, login, email, first_name, last_name, phone_number, avatar_url, role, status
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|error| internal_error(format!("failed to load auth user response: {error}")))?
    .ok_or_else(|| validation_error("user_not_found", "user not found"))
}

fn build_auth_user_response(user: &UserWithPasswordRow) -> AuthUserResponse {
    AuthUserResponse {
        id: user.id,
        username: user.username.clone(),
        login: user.login.clone(),
        email: user.email.clone(),
        first_name: user.first_name.clone(),
        last_name: user.last_name.clone(),
        phone_number: user.phone_number.clone(),
        avatar_url: user.avatar_url.clone(),
        role: user.role.clone(),
        status: user.status.clone(),
    }
}

fn ensure_user_can_authenticate(
    status: &str,
) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    if status == "pending" {
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

    if status == "rejected" {
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

    Ok(())
}

fn parse_refresh_cookie_token(
    headers: &HeaderMap,
) -> Result<Uuid, (StatusCode, Json<ErrorResponse>)> {
    let raw = headers
        .get(COOKIE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();

    for pair in raw.split(';') {
        let trimmed = pair.trim();
        if let Some(value) = trimmed.strip_prefix(&format!("{REFRESH_COOKIE_NAME}=")) {
            return Uuid::parse_str(value.trim()).map_err(|_| {
                (
                    StatusCode::UNAUTHORIZED,
                    Json(ErrorResponse {
                        code: "invalid_refresh_token",
                        message: "refresh cookie is invalid".to_string(),
                        details: None,
                        request_id: crate::new_request_id(),
                    }),
                )
            });
        }
    }

    Err((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse {
            code: "unauthorized",
            message: "missing refresh cookie".to_string(),
            details: None,
            request_id: crate::new_request_id(),
        }),
    ))
}

fn parse_refresh_token(
    headers: &HeaderMap,
    body: &[u8],
) -> Result<Uuid, (StatusCode, Json<ErrorResponse>)> {
    if let Some(token) = parse_refresh_json_token(body)? {
        return Ok(token);
    }
    parse_refresh_cookie_token(headers)
}

fn parse_refresh_json_token(
    body: &[u8],
) -> Result<Option<Uuid>, (StatusCode, Json<ErrorResponse>)> {
    if !has_json_refresh_payload(body) {
        return Ok(None);
    }
    let payload = serde_json::from_slice::<RefreshTokenRequest>(body).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                code: "invalid_refresh_payload",
                message: "refresh payload is invalid".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;
    let Some(raw) = payload.refresh_token.map(|value| value.trim().to_string()) else {
        return Ok(None);
    };
    if raw.is_empty() {
        return Ok(None);
    }
    Uuid::parse_str(&raw).map(Some).map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                code: "invalid_refresh_token",
                message: "refresh token is invalid".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })
}

fn has_json_refresh_payload(body: &[u8]) -> bool {
    !body.iter().all(u8::is_ascii_whitespace)
}

fn build_refresh_cookie_header(
    state: &AppState,
    token: &Uuid,
    max_age_days: i64,
) -> Result<HeaderValue, (StatusCode, Json<ErrorResponse>)> {
    let max_age_seconds = max_age_days * 24 * 60 * 60;
    let secure = should_set_secure_cookie(&state.app_env);
    let cookie = format!(
        "{REFRESH_COOKIE_NAME}={token}; Path=/; Max-Age={max_age_seconds}; HttpOnly; SameSite=Lax{}",
        if secure { "; Secure" } else { "" }
    );
    HeaderValue::from_str(&cookie)
        .map_err(|error| internal_error(format!("failed to build refresh cookie header: {error}")))
}

fn expired_refresh_cookie_header(
    state: &AppState,
) -> Result<HeaderValue, (StatusCode, Json<ErrorResponse>)> {
    let secure = should_set_secure_cookie(&state.app_env);
    let cookie = format!(
        "{REFRESH_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{}",
        if secure { "; Secure" } else { "" }
    );
    HeaderValue::from_str(&cookie)
        .map_err(|error| internal_error(format!("failed to build expired refresh cookie header: {error}")))
}

fn should_set_secure_cookie(app_env: &str) -> bool {
    !matches!(app_env.trim().to_ascii_lowercase().as_str(), "dev" | "local" | "test")
}

fn auth_access_token_ttl_minutes() -> i64 {
    const DEFAULT_MINUTES: i64 = 15;
    const MAX_MINUTES: i64 = 60 * 24;
    env::var("AUTH_ACCESS_TOKEN_TTL_MINUTES")
        .ok()
        .and_then(|raw| raw.trim().parse::<i64>().ok())
        .filter(|minutes| *minutes > 0 && *minutes <= MAX_MINUTES)
        .unwrap_or(DEFAULT_MINUTES)
}

fn auth_refresh_session_ttl_days() -> i64 {
    const DEFAULT_DAYS: i64 = 30;
    const MAX_DAYS: i64 = 90;
    env::var("AUTH_REFRESH_TOKEN_TTL_DAYS")
        .ok()
        .and_then(|raw| raw.trim().parse::<i64>().ok())
        .filter(|days| *days > 0 && *days <= MAX_DAYS)
        .unwrap_or(DEFAULT_DAYS)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_refresh_json_token_accepts_mobile_payload() {
        let token = Uuid::new_v4();
        let body = format!(r#"{{"refresh_token":"{token}"}}"#);

        let parsed = parse_refresh_json_token(body.as_bytes()).expect("valid refresh payload");

        assert_eq!(parsed, Some(token));
    }

    #[test]
    fn parse_refresh_json_token_ignores_empty_body_for_cookie_clients() {
        let parsed = parse_refresh_json_token(b"  \n").expect("empty payload");

        assert_eq!(parsed, None);
    }

    #[test]
    fn parse_refresh_json_token_rejects_bad_uuid() {
        let error = parse_refresh_json_token(br#"{"refresh_token":"bad-token"}"#)
            .expect_err("invalid token should be rejected");

        assert_eq!(error.0, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn login_response_omits_refresh_token_for_cookie_clients() {
        let response = build_login_response(
            IssuedAuthSession {
                access_token: Uuid::new_v4(),
                refresh_token: Uuid::new_v4(),
                user: AuthUserResponse {
                    id: Uuid::new_v4(),
                    username: "user".to_string(),
                    login: "user".to_string(),
                    email: None,
                    first_name: None,
                    last_name: None,
                    phone_number: None,
                    avatar_url: None,
                    role: "user".to_string(),
                    status: "approved".to_string(),
                },
            },
            false,
        );

        let serialized = serde_json::to_value(response).expect("serialize login response");

        assert!(serialized.get("refresh_token").is_none());
    }
}
