use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::OnceLock;
use validator::{Validate, ValidationError};

static USERNAME_REGEX: OnceLock<Regex> = OnceLock::new();
static LOGIN_REGEX: OnceLock<Regex> = OnceLock::new();

fn init_regexes() {
    USERNAME_REGEX.get_or_init(|| Regex::new(r"^[a-zA-Z0-9_]+$").expect("username regex"));
    LOGIN_REGEX.get_or_init(|| Regex::new(r"^[a-zA-Z0-9._-]+$").expect("login regex"));
}

#[derive(Debug, Deserialize, Validate)]
pub(crate) struct RegisterRequest {
    #[validate(length(max = 254), email)]
    pub email: String,
    #[validate(length(min = 3, max = 32), regex(path = "USERNAME_REGEX"))]
    pub username: Option<String>,
    #[validate(length(min = 3, max = 64), regex(path = "LOGIN_REGEX"))]
    pub login: String,
    #[validate(length(min = 1, max = 64))]
    pub first_name: String,
    #[validate(length(min = 1, max = 64))]
    pub last_name: String,
    #[validate(length(min = 7, max = 24))]
    pub phone_number: String,
    #[validate(
        length(min = 8, max = 128),
        custom(function = "validate_password_strength")
    )]
    pub password: String,
}

impl RegisterRequest {
    pub(crate) fn validate_all(&self) -> Result<(), validator::ValidationErrors> {
        init_regexes();
        self.validate()
    }
}

pub(crate) fn validate_password_strength(value: &str) -> Result<(), ValidationError> {
    let mut missing = Vec::new();
    if !value.chars().any(|c| c.is_ascii_uppercase()) {
        missing.push("missing_uppercase");
    }
    if !value.chars().any(|c| c.is_ascii_lowercase()) {
        missing.push("missing_lowercase");
    }
    if !value.chars().any(|c| c.is_ascii_digit()) {
        missing.push("missing_digit");
    }

    if missing.is_empty() {
        return Ok(());
    }

    let mut error = ValidationError::new("password_strength");
    error.params.insert("reasons".into(), json!(missing));
    Err(error)
}

#[derive(Debug, Serialize)]
pub(crate) struct RegisterResponse {
    pub message: String,
    pub status: &'static str,
}

#[derive(Debug, Deserialize)]
pub(crate) struct LoginRequest {
    pub login: String,
    pub password: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub(crate) struct AuthUserResponse {
    pub id: uuid::Uuid,
    pub username: String,
    pub login: String,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub phone_number: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct LoginResponse {
    pub access_token: String,
    pub token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    pub user: AuthUserResponse,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RefreshTokenRequest {
    pub refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PasswordResetRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PasswordResetConfirmRequest {
    pub email: String,
    pub code: String,
    pub password: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub(crate) struct PendingUserDto {
    pub id: uuid::Uuid,
    pub username: String,
    pub login: String,
    pub email: Option<String>,
    pub role: String,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub(crate) struct PendingCountResponse {
    pub pending_count: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub(crate) struct AdminUserDto {
    pub id: uuid::Uuid,
    pub username: String,
    pub login: String,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub approved_at: Option<chrono::DateTime<chrono::Utc>>,
    pub approved_by: Option<uuid::Uuid>,
    pub approved_by_login: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateUserRoleRequest {
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateProfileRequest {
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub phone_number: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ChangePasswordCodeConfirmRequest {
    pub current_password: String,
    pub new_password: String,
    pub code: String,
}

#[cfg(test)]
mod tests {
    use super::RegisterRequest;

    fn base_request() -> RegisterRequest {
        RegisterRequest {
            email: "user@example.com".to_string(),
            username: Some("valid_user".to_string()),
            login: "valid_user".to_string(),
            first_name: "Ravil".to_string(),
            last_name: "Khanov".to_string(),
            phone_number: "+77771234567".to_string(),
            password: "ValidPass1".to_string(),
        }
    }

    #[test]
    fn register_rejects_invalid_email() {
        let mut req = base_request();
        req.email = "user@invalid@domain.com".to_string();
        let result = req.validate_all();
        assert!(result.is_err());
    }

    #[test]
    fn register_rejects_short_username() {
        let mut req = base_request();
        req.username = Some("ab".to_string());
        let result = req.validate_all();
        assert!(result.is_err());
    }

    #[test]
    fn register_rejects_bad_username_chars() {
        let mut req = base_request();
        req.username = Some("bad-name".to_string());
        let result = req.validate_all();
        assert!(result.is_err());
    }

    #[test]
    fn register_rejects_weak_password() {
        let mut req = base_request();
        req.password = "weakpass".to_string();
        let result = req.validate_all();
        assert!(result.is_err());
    }

    #[test]
    fn register_accepts_valid_payload() {
        let req = base_request();
        let result = req.validate_all();
        assert!(result.is_ok());
    }
}
