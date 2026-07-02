use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;

use crate::{delete_uploaded_photo_by_url, internal_error, validation_error, AppState, ErrorResponse};

use super::{
    dto::{AuthUserResponse, ChangePasswordRequest, UpdateProfileRequest},
    guards::require_auth_user,
    password::{hash_password, verify_password},
    service::derive_username_from_profile,
    validation::{normalize_email, validate_password},
};

#[derive(Debug, Deserialize, sqlx::FromRow)]
struct UserPasswordHashRow {
    password_hash: String,
}

pub(crate) async fn auth_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AuthUserResponse>, (StatusCode, Json<ErrorResponse>)> {
    let auth_user = require_auth_user(&state, &headers).await?;
    let user = load_auth_user_response(&state, auth_user.id).await?;
    Ok(Json(user))
}

pub(crate) async fn auth_update_me(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<AuthUserResponse>, (StatusCode, Json<ErrorResponse>)> {
    let auth_user = require_auth_user(&state, &headers).await?;
    if payload.email.is_none()
        && payload.first_name.is_none()
        && payload.last_name.is_none()
        && payload.phone_number.is_none()
        && payload.avatar_url.is_none()
    {
        return Err(validation_error(
            "invalid_payload",
            "at least one profile field must be provided",
        ));
    }

    let current = load_auth_user_response(&state, auth_user.id).await?;
    let next_email = match payload.email.as_deref() {
        Some(value) => Some(normalize_email(value)?),
        None => current.email,
    };
    let next_first_name = match payload.first_name.as_deref() {
        Some(value) => Some(normalize_profile_text(value, "first_name", 64)?),
        None => current.first_name,
    };
    let next_last_name = match payload.last_name.as_deref() {
        Some(value) => Some(normalize_profile_text(value, "last_name", 64)?),
        None => current.last_name,
    };
    let next_phone_number = match payload.phone_number.as_deref() {
        Some(value) => Some(normalize_phone_number(value)?),
        None => current.phone_number,
    };
    let current_avatar_url = current.avatar_url.clone();
    let next_avatar_url = if let Some(value) = payload.avatar_url.as_deref() {
        normalize_avatar_url(value)?
    } else {
        current_avatar_url.clone()
    };
<<<<<<< HEAD
    let avatar_to_remove = match (&current_avatar_url, &next_avatar_url) {
        (Some(current_url), Some(next_url)) if current_url.trim() == next_url.trim() => None,
        (Some(current_url), _) if !current_url.trim().is_empty() => Some(current_url.clone()),
        _ => None,
    };
=======
>>>>>>> origin/main
    let next_username = resolve_profile_username(
        next_first_name.as_deref(),
        next_last_name.as_deref(),
        &current.login,
    );
<<<<<<< HEAD

    if let Some(current_avatar_url) = avatar_to_remove {
        delete_uploaded_photo_by_url(&current_avatar_url)
            .await
            .map_err(|error| internal_error(format!("failed to delete previous avatar: {error}")))?;
    }
=======
>>>>>>> origin/main

    let updated = sqlx::query_as::<_, AuthUserResponse>(
        r#"
        UPDATE users
        SET email = $1,
            first_name = $2,
            last_name = $3,
            phone_number = $4,
            avatar_url = $5,
            username = $6
        WHERE id = $7
        RETURNING id, username, login, email, first_name, last_name, phone_number, avatar_url, role, status
        "#,
    )
    .bind(next_email)
    .bind(next_first_name)
    .bind(next_last_name)
    .bind(next_phone_number)
    .bind(next_avatar_url)
    .bind(next_username)
    .bind(auth_user.id)
    .fetch_one(&state.db)
    .await
    .map_err(map_update_profile_error)?;

    Ok(Json(updated))
}

pub(crate) async fn auth_change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let auth_user = require_auth_user(&state, &headers).await?;
    validate_password(&payload.new_password)?;

    let current = sqlx::query_as::<_, UserPasswordHashRow>(
        r#"
        SELECT password_hash
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(auth_user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to load password hash: {error}")))?;

    let Some(current) = current else {
        return Err(validation_error("user_not_found", "user not found"));
    };

    if !verify_password(&payload.current_password, &current.password_hash) {
        return Err(validation_error(
            "invalid_current_password",
            "current password is invalid",
        ));
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
    .execute(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to update password: {error}")))?;

    sqlx::query(
        r#"
        DELETE FROM auth_tokens
        WHERE user_id = $1
        "#,
    )
    .bind(auth_user.id)
    .execute(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to revoke sessions: {error}")))?;

    sqlx::query(
        r#"
        UPDATE auth_refresh_sessions
        SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL
        "#,
    )
    .bind(auth_user.id)
    .execute(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to revoke refresh sessions: {error}")))?;

    Ok(StatusCode::NO_CONTENT)
}

async fn load_auth_user_response(
    state: &AppState,
    user_id: uuid::Uuid,
) -> Result<AuthUserResponse, (StatusCode, Json<ErrorResponse>)> {
    sqlx::query_as::<_, AuthUserResponse>(
        r#"
        SELECT id, username, login, email, first_name, last_name, phone_number, avatar_url, role, status
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| internal_error(format!("failed to load user profile: {error}")))?
    .ok_or_else(|| validation_error("user_not_found", "user not found"))
}

fn resolve_profile_username(
    first_name: Option<&str>,
    last_name: Option<&str>,
    login: &str,
) -> String {
    derive_username_from_profile(first_name.unwrap_or_default(), last_name.unwrap_or_default(), login)
        .unwrap_or_else(|| login.to_string())
}

fn normalize_avatar_url(value: &str) -> Result<Option<String>, (StatusCode, Json<ErrorResponse>)> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Ok(None);
    }
    if normalized.len() > 1024 {
        return Err(validation_error(
            "invalid_avatar_url",
            "avatar_url must be shorter than 1025 characters",
        ));
    }
    if normalized.starts_with("/uploads/")
        || normalized.starts_with("http://")
        || normalized.starts_with("https://")
    {
        return Ok(Some(normalized.to_string()));
    }
    Err(validation_error(
        "invalid_avatar_url",
        "avatar_url must start with /uploads/, http:// or https://",
    ))
}

fn normalize_profile_text(
    value: &str,
    field_name: &str,
    max_len: usize,
) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err(validation_error(
            "invalid_profile_field",
            &format!("{field_name} must not be empty"),
        ));
    }
    if normalized.len() > max_len {
        return Err(validation_error(
            "invalid_profile_field",
            &format!("{field_name} must be shorter than {}", max_len + 1),
        ));
    }
    Ok(normalized.to_string())
}

fn normalize_phone_number(value: &str) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let normalized = value.trim();
    if normalized.len() < 7 || normalized.len() > 24 {
        return Err(validation_error(
            "invalid_phone_number",
            "phone_number must be between 7 and 24 characters",
        ));
    }
    if !normalized
        .chars()
        .all(|ch| ch.is_ascii_digit() || matches!(ch, '+' | ' ' | '-' | '(' | ')'))
    {
        return Err(validation_error(
            "invalid_phone_number",
            "phone_number contains unsupported characters",
        ));
    }
    Ok(normalized.to_string())
}

fn map_update_profile_error(error: sqlx::Error) -> (StatusCode, Json<ErrorResponse>) {
    if let sqlx::Error::Database(db_error) = &error {
        if db_error.code().as_deref() == Some("23505") {
            return validation_error("email_taken", "email is already used");
        }
    }
    internal_error(format!("failed to update profile: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{normalize_avatar_url, normalize_phone_number, resolve_profile_username};

    #[test]
    fn avatar_url_accepts_uploads_path() {
        let result = normalize_avatar_url("/uploads/file.jpg");
        assert!(matches!(result, Ok(Some(_))));
    }

    #[test]
    fn avatar_url_accepts_empty_as_clear() {
        let result = normalize_avatar_url("   ");
        assert!(matches!(result, Ok(None)));
    }

    #[test]
    fn avatar_url_rejects_relative_non_upload_path() {
        let result = normalize_avatar_url("/tmp/file.jpg");
        assert!(result.is_err());
    }

    #[test]
    fn phone_number_accepts_common_format() {
        let result = normalize_phone_number("+7 (777) 123-45-67");
        assert!(result.is_ok());
    }

    #[test]
    fn phone_number_rejects_symbols() {
        let result = normalize_phone_number("777-123-45-67#");
        assert!(result.is_err());
    }

    #[test]
    fn profile_username_prefers_full_name_after_profile_update() {
        let result = resolve_profile_username(Some("Ravil"), Some("Raykhanov"), "ravilkadev0");
        assert_eq!(result, "Ravil Raykhanov");
    }

    #[test]
    fn profile_username_falls_back_to_login_when_name_is_invalid() {
        let result = resolve_profile_username(Some(""), Some(""), "ravilkadev0");
        assert_eq!(result, "ravilkadev0");
    }
}
