use axum::{extract::State, http::{HeaderMap, StatusCode}, Json};
use chrono::{Duration, Utc};
use rand_core::{OsRng, RngCore};
use uuid::Uuid;

use crate::{
    email::send_password_reset_email, internal_error, validation_error, AppState, ErrorResponse,
};

use super::{
    dto::{ChangePasswordCodeConfirmRequest, ChangePasswordRequest, PasswordResetConfirmRequest, PasswordResetRequest},
    guards::require_auth_user,
    models::{PasswordResetCodeRow, UserWithPasswordRow},
    password::{hash_password, verify_password},
    validation::{normalize_email, validate_password},
};

pub(crate) async fn request_password_reset(
    State(state): State<AppState>,
    Json(payload): Json<PasswordResetRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let email = normalize_email(&payload.email)?;

    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE email = $1")
        .bind(&email)
        .fetch_one(&state.db)
        .await
        .map_err(|error| internal_error(format!("failed to check email: {error}")))?;

    if exists == 0 {
        return Ok(StatusCode::NO_CONTENT);
    }

    issue_password_reset_code(&state, &email).await?;

    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn request_authenticated_password_change_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let auth_user = require_auth_user(&state, &headers).await?;
    let user = load_user_with_password(&state, auth_user.id).await?;
    let email = user
        .email
        .as_deref()
        .ok_or_else(|| validation_error("email_required", "email is required to change password"))?;

    validate_current_and_new_password(&user.password_hash, &payload.current_password, &payload.new_password)?;
    issue_password_reset_code(&state, email).await?;

    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn confirm_password_reset(
    State(state): State<AppState>,
    Json(payload): Json<PasswordResetConfirmRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let email = normalize_email(&payload.email)?;
    let code = payload.code.trim().to_string();
    if code.len() != 6 || !code.chars().all(|c| c.is_ascii_digit()) {
        return Err(validation_error("invalid_code", "code must be 6 digits"));
    }
    validate_password(&payload.password)?;

    const MAX_ATTEMPTS: i32 = 5;

    let mut tx = state
        .db
        .begin()
        .await
        .map_err(|error| internal_error(format!("failed to start tx: {error}")))?;

    let reset = sqlx::query_as::<_, PasswordResetCodeRow>(
        r#"
        SELECT id, code_hash, expires_at, attempts
        FROM password_reset_codes
        WHERE email = $1 AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(&email)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| internal_error(format!("failed to load reset code: {error}")))?;

    let Some(reset) = reset else {
        return Err(validation_error("invalid_code", "reset code is invalid"));
    };

    if reset.expires_at < Utc::now() {
        return Err(validation_error("code_expired", "reset code expired"));
    }

    if reset.attempts >= MAX_ATTEMPTS {
        return Err(validation_error("code_locked", "too many invalid attempts"));
    }

    if !verify_password(&code, &reset.code_hash) {
        let _ = sqlx::query(
            r#"
            UPDATE password_reset_codes
            SET attempts = attempts + 1
            WHERE id = $1
            "#,
        )
        .bind(reset.id)
        .execute(&mut *tx)
        .await;
        return Err(validation_error("invalid_code", "reset code is invalid"));
    }

    let new_hash = hash_password(&payload.password).map_err(internal_error)?;

    let updated = sqlx::query(
        r#"
        UPDATE users
        SET password_hash = $1
        WHERE email = $2
        "#,
    )
    .bind(new_hash)
    .bind(&email)
    .execute(&mut *tx)
    .await
    .map_err(|error| internal_error(format!("failed to update password: {error}")))?;

    if updated.rows_affected() == 0 {
        return Err(validation_error(
            "email_not_found",
            "email is not registered",
        ));
    }

    sqlx::query(
        r#"
        UPDATE password_reset_codes
        SET used_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(reset.id)
    .execute(&mut *tx)
    .await
    .map_err(|error| internal_error(format!("failed to mark reset code as used: {error}")))?;

    tx.commit()
        .await
        .map_err(|error| internal_error(format!("failed to commit tx: {error}")))?;

    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn confirm_authenticated_password_change(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ChangePasswordCodeConfirmRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let auth_user = require_auth_user(&state, &headers).await?;
    let user = load_user_with_password(&state, auth_user.id).await?;
    let email = user
        .email
        .as_deref()
        .ok_or_else(|| validation_error("email_required", "email is required to change password"))?;

    validate_current_and_new_password(&user.password_hash, &payload.current_password, &payload.new_password)?;
    validate_reset_code_format(&payload.code)?;

    const MAX_ATTEMPTS: i32 = 5;

    let mut tx = state
        .db
        .begin()
        .await
        .map_err(|error| internal_error(format!("failed to start tx: {error}")))?;

    let reset = load_active_reset_code(&mut tx, email).await?;
    let Some(reset) = reset else {
        return Err(validation_error("invalid_code", "reset code is invalid"));
    };

    if reset.expires_at < Utc::now() {
        return Err(validation_error("code_expired", "reset code expired"));
    }

    if reset.attempts >= MAX_ATTEMPTS {
        return Err(validation_error("code_locked", "too many invalid attempts"));
    }

    let code = payload.code.trim();
    if !verify_password(code, &reset.code_hash) {
        let _ = sqlx::query(
            r#"
            UPDATE password_reset_codes
            SET attempts = attempts + 1
            WHERE id = $1
            "#,
        )
        .bind(reset.id)
        .execute(&mut *tx)
        .await;
        return Err(validation_error("invalid_code", "reset code is invalid"));
    }

    let new_hash = hash_password(&payload.new_password).map_err(internal_error)?;

    sqlx::query(
        r#"
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
        "#,
    )
    .bind(new_hash)
    .bind(auth_user.id)
    .execute(&mut *tx)
    .await
    .map_err(|error| internal_error(format!("failed to update password: {error}")))?;

    sqlx::query(
        r#"
        UPDATE password_reset_codes
        SET used_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(reset.id)
    .execute(&mut *tx)
    .await
    .map_err(|error| internal_error(format!("failed to mark reset code as used: {error}")))?;

    revoke_user_sessions_in_tx(&mut tx, auth_user.id).await?;

    tx.commit()
        .await
        .map_err(|error| internal_error(format!("failed to commit tx: {error}")))?;

    Ok(StatusCode::NO_CONTENT)
}

async fn issue_password_reset_code(
    state: &AppState,
    email: &str,
) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    sqlx::query(
        r#"
        UPDATE password_reset_codes
        SET used_at = NOW()
        WHERE email = $1 AND used_at IS NULL
        "#,
    )
    .bind(email)
    .execute(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to clear reset codes: {error}")))?;

    let code = generate_reset_code();
    let code_hash = hash_password(&code).map_err(internal_error)?;
    let expires_at = Utc::now() + Duration::minutes(password_reset_ttl_minutes());

    sqlx::query(
        r#"
        INSERT INTO password_reset_codes (id, email, code_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(email)
    .bind(code_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to store reset code: {error}")))?;

    if password_reset_log_codes_enabled() {
        tracing::warn!(
            email = %email,
            code = %code,
            "local password reset code generated"
        );
    } else {
        send_password_reset_email(email, &code, password_reset_ttl_minutes())
            .await
            .map_err(internal_error)?;
    }

    Ok(())
}

async fn load_user_with_password(
    state: &AppState,
    user_id: Uuid,
) -> Result<UserWithPasswordRow, (StatusCode, Json<ErrorResponse>)> {
    sqlx::query_as::<_, UserWithPasswordRow>(
        r#"
        SELECT id, username, login, email, first_name, last_name, phone_number, avatar_url, role, status, password_hash
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to load auth user: {error}")))?
    .ok_or_else(|| validation_error("user_not_found", "user not found"))
}

fn validate_current_and_new_password(
    current_hash: &str,
    current_password: &str,
    new_password: &str,
) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    validate_password(new_password)?;
    if !verify_password(current_password, current_hash) {
        return Err(validation_error(
            "invalid_current_password",
            "current password is invalid",
        ));
    }
    if current_password == new_password {
        return Err(validation_error(
            "password_unchanged",
            "new password must be different from current password",
        ));
    }
    Ok(())
}

fn validate_reset_code_format(code: &str) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    let normalized = code.trim();
    if normalized.len() != 6 || !normalized.chars().all(|c| c.is_ascii_digit()) {
        return Err(validation_error("invalid_code", "code must be 6 digits"));
    }
    Ok(())
}

async fn load_active_reset_code(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    email: &str,
) -> Result<Option<PasswordResetCodeRow>, (StatusCode, Json<ErrorResponse>)> {
    sqlx::query_as::<_, PasswordResetCodeRow>(
        r#"
        SELECT id, code_hash, expires_at, attempts
        FROM password_reset_codes
        WHERE email = $1 AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(email)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| internal_error(format!("failed to load reset code: {error}")))
}

async fn revoke_user_sessions_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    sqlx::query(
        r#"
        DELETE FROM auth_tokens
        WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .execute(&mut **tx)
    .await
    .map_err(|error| internal_error(format!("failed to revoke sessions: {error}")))?;

    sqlx::query(
        r#"
        UPDATE auth_refresh_sessions
        SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL
        "#,
    )
    .bind(user_id)
    .execute(&mut **tx)
    .await
    .map_err(|error| internal_error(format!("failed to revoke refresh sessions: {error}")))?;

    Ok(())
}

fn password_reset_ttl_minutes() -> i64 {
    password_reset_ttl_minutes_with(|key| std::env::var(key).ok())
}

fn password_reset_ttl_minutes_with<F>(get_var: F) -> i64
where
    F: Fn(&str) -> Option<String>,
{
    const DEFAULT_MINUTES: i64 = 10;
    const MAX_MINUTES: i64 = 60;
    get_var("PASSWORD_RESET_CODE_TTL_MINUTES")
        .and_then(|raw| raw.trim().parse::<i64>().ok())
        .filter(|minutes| *minutes > 0 && *minutes <= MAX_MINUTES)
        .unwrap_or(DEFAULT_MINUTES)
}

fn generate_reset_code() -> String {
    let mut bytes = [0u8; 4];
    let mut rng = OsRng;
    rng.fill_bytes(&mut bytes);
    let value = u32::from_le_bytes(bytes) % 1_000_000;
    format!("{:06}", value)
}
fn password_reset_log_codes_enabled() -> bool {
    password_reset_log_codes_enabled_with(|key| std::env::var(key).ok())
}

fn password_reset_log_codes_enabled_with<F>(get_var: F) -> bool
where
    F: Fn(&str) -> Option<String>,
{
    get_var("PASSWORD_RESET_LOG_CODES")
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes"
            )
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::{
        password_reset_log_codes_enabled_with, password_reset_ttl_minutes_with,
    };

    #[test]
    fn password_reset_ttl_defaults_to_ten_minutes() {
        assert_eq!(password_reset_ttl_minutes_with(|_| None), 10);
    }

    #[test]
    fn password_reset_ttl_rejects_out_of_range_values() {
        assert_eq!(
            password_reset_ttl_minutes_with(|_| Some("120".to_string())),
            10
        );

        assert_eq!(
            password_reset_ttl_minutes_with(|_| Some("15".to_string())),
            15
        );
    }

    #[test]
    fn password_reset_log_codes_defaults_to_false() {
        assert!(!password_reset_log_codes_enabled_with(|_| None));
    }

    #[test]
    fn password_reset_log_codes_parses_truthy_values() {
        assert!(password_reset_log_codes_enabled_with(|_| {
            Some("true".to_string())
        }));

        assert!(!password_reset_log_codes_enabled_with(|_| {
            Some("0".to_string())
        }));
    }
}
