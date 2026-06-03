use std::collections::HashMap;

use axum::http::StatusCode;
use axum::Json;
use validator::ValidationErrors;

use crate::{internal_error, ErrorResponse};

use super::service::RegistrationError;

pub(crate) fn map_registration_error(
    error: RegistrationError,
) -> (StatusCode, Json<ErrorResponse>) {
    match error {
        RegistrationError::EmailTaken => validation_error_with_details(
            "validation_error",
            "email is already in use",
            single_detail("email", "already_taken"),
        ),
        RegistrationError::LoginTaken => validation_error_with_details(
            "validation_error",
            "login is already in use",
            single_detail("login", "already_taken"),
        ),
        RegistrationError::InvalidUsername => validation_error_with_details(
            "validation_error",
            "username is invalid",
            single_detail("username", "invalid"),
        ),
        RegistrationError::Hashing(message) => internal_error(message),
        RegistrationError::Repository(error) => {
            internal_error(format!("failed to register user: {error}"))
        }
    }
}

pub(crate) fn validation_error_response(
    errors: ValidationErrors,
) -> (StatusCode, Json<ErrorResponse>) {
    let mut details = HashMap::<String, Vec<String>>::new();

    for (field, field_errors) in errors.field_errors() {
        for error in field_errors {
            match field {
                "email" => match error.code.as_ref() {
                    "email" => push_detail(&mut details, "email", "invalid_format"),
                    "length" => push_detail(&mut details, "email", "invalid_length"),
                    _ => push_detail(&mut details, "email", "invalid"),
                },
                "username" => match error.code.as_ref() {
                    "length" => push_detail(&mut details, "username", "invalid_length"),
                    "regex" => push_detail(&mut details, "username", "invalid_format"),
                    _ => push_detail(&mut details, "username", "invalid"),
                },
                "login" => match error.code.as_ref() {
                    "length" => push_detail(&mut details, "login", "invalid_length"),
                    "regex" => push_detail(&mut details, "login", "invalid_format"),
                    _ => push_detail(&mut details, "login", "invalid"),
                },
                "password" => match error.code.as_ref() {
                    "length" => push_detail(&mut details, "password", "invalid_length"),
                    "password_strength" => append_password_reasons(&mut details, error),
                    _ => push_detail(&mut details, "password", "invalid"),
                },
                _ => {}
            }
        }
    }

    validation_error_with_details("validation_error", "validation failed", details)
}

fn append_password_reasons(
    details: &mut HashMap<String, Vec<String>>,
    error: &validator::ValidationError,
) {
    let Some(reasons) = error.params.get("reasons") else {
        push_detail(details, "password", "weak_password");
        return;
    };
    let Some(items) = reasons.as_array() else {
        push_detail(details, "password", "weak_password");
        return;
    };
    for item in items {
        if let Some(code) = item.as_str() {
            push_detail(details, "password", code);
        }
    }
}

fn push_detail(details: &mut HashMap<String, Vec<String>>, field: &str, code: &str) {
    let entry = details.entry(field.to_string()).or_default();
    if !entry.iter().any(|existing| existing == code) {
        entry.push(code.to_string());
    }
}

fn single_detail(field: &str, code: &str) -> HashMap<String, Vec<String>> {
    let mut mapped = HashMap::new();
    mapped.insert(field.to_string(), vec![code.to_string()]);
    mapped
}

fn validation_error_with_details(
    code: &'static str,
    message: &str,
    details: HashMap<String, Vec<String>>,
) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            code,
            message: message.to_string(),
            details: Some(details),
            request_id: crate::new_request_id(),
        }),
    )
}
