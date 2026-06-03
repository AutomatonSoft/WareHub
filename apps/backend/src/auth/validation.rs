use axum::http::StatusCode;
use axum::Json;

use crate::{validation_error, ErrorResponse};

pub(crate) fn normalize_login(value: &str) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let normalized = value.trim().to_lowercase();
    if normalized.len() < 3 || normalized.len() > 64 {
        return Err(validation_error(
            "invalid_login",
            "login must be between 3 and 64 chars",
        ));
    }
    if !normalized
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err(validation_error(
            "invalid_login",
            "login contains unsupported characters",
        ));
    }
    Ok(normalized)
}

pub(crate) fn normalize_email(value: &str) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let normalized = value.trim().to_lowercase();
    if normalized.is_empty() || normalized.len() > 254 {
        return Err(validation_error(
            "invalid_email",
            "email must be non-empty and up to 254 chars",
        ));
    }
    if normalized.chars().any(|c| c.is_whitespace()) {
        return Err(validation_error(
            "invalid_email",
            "email must not contain spaces",
        ));
    }
    if normalized.matches('@').count() != 1 {
        return Err(validation_error(
            "invalid_email",
            "email must contain a single @",
        ));
    }
    let Some((local, domain)) = normalized.split_once('@') else {
        return Err(validation_error("invalid_email", "email must contain @"));
    };
    if local.is_empty() || domain.is_empty() {
        return Err(validation_error(
            "invalid_email",
            "email must include local and domain parts",
        ));
    }
    if domain.starts_with('.') || domain.ends_with('.') {
        return Err(validation_error(
            "invalid_email",
            "email domain must not start or end with dot",
        ));
    }
    if domain.split('.').any(|part| part.is_empty()) {
        return Err(validation_error(
            "invalid_email",
            "email domain must not contain empty labels",
        ));
    }
    if !domain.contains('.') {
        return Err(validation_error(
            "invalid_email",
            "email domain must contain a dot",
        ));
    }
    Ok(normalized)
}

pub(crate) fn validate_password(value: &str) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    if value.len() < 8 || value.len() > 128 {
        return Err(validation_error(
            "invalid_password",
            "password must be between 8 and 128 chars",
        ));
    }
    if !value.chars().any(|c| c.is_ascii_uppercase())
        || !value.chars().any(|c| c.is_ascii_lowercase())
        || !value.chars().any(|c| c.is_ascii_digit())
    {
        return Err(validation_error(
            "invalid_password",
            "password must include at least 1 uppercase, 1 lowercase, and 1 number",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{normalize_email, validate_password};

    #[test]
    fn normalize_email_rejects_multiple_at() {
        let result = normalize_email("user@invalid@domain.com");
        assert!(result.is_err());
    }

    #[test]
    fn normalize_email_rejects_empty_domain_labels() {
        let result = normalize_email("user@.com");
        assert!(result.is_err());
        let result = normalize_email("user@example..com");
        assert!(result.is_err());
    }

    #[test]
    fn normalize_email_accepts_valid_address() {
        let result = normalize_email("User.Name+tag@example.com");
        assert!(result.is_ok());
    }

    #[test]
    fn validate_password_requires_uppercase_lowercase_and_digit() {
        assert!(validate_password("lowercase1").is_err());
        assert!(validate_password("NOLOWERCASE1").is_err());
        assert!(validate_password("NoDigitsHere").is_err());
        assert!(validate_password("ValidPass1").is_ok());
    }
}
