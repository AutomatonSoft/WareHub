use axum::{extract::State, http::StatusCode, Json};
use chrono::{Duration, Utc};
use rand_core::{OsRng, RngCore};
use uuid::Uuid;

use crate::{
    email::send_password_reset_email, internal_error, validation_error, AppState, ErrorResponse,
};

use super::{
    dto::{PasswordResetConfirmRequest, PasswordResetRequest},
    models::PasswordResetCodeRow,
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

    sqlx::query(
        r#"
        UPDATE password_reset_codes
        SET used_at = NOW()
        WHERE email = $1 AND used_at IS NULL
        "#,
    )
    .bind(&email)
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
    .bind(&email)
    .bind(code_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to store reset code: {error}")))?;

    send_password_reset_email(&email, &code)
        .await
        .map_err(internal_error)?;

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

fn password_reset_ttl_minutes() -> i64 {
    const DEFAULT_MINUTES: i64 = 10;
    const MAX_MINUTES: i64 = 60;
    std::env::var("PASSWORD_RESET_CODE_TTL_MINUTES")
        .ok()
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
