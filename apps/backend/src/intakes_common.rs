use axum::{http::StatusCode, Json};

use crate::{validation_error, ErrorResponse};

pub(crate) fn normalize_qr_code(value: &str) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let normalized = value.trim().to_string();
    if normalized.is_empty() || normalized.len() > 512 {
        return Err(validation_error(
            "invalid_qr_code",
            "qr_code must be 1..512 chars",
        ));
    }
    if normalized
        .chars()
        .any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
    {
        return Err(validation_error(
            "invalid_qr_code",
            "qr_code contains unsupported control characters",
        ));
    }
    Ok(normalized)
}

pub(crate) fn normalize_warehouse_location(
    value: &str,
) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let normalized = value.trim().to_uppercase();
    if normalized.is_empty() || normalized.len() > 64 {
        return Err(validation_error(
            "invalid_warehouse_location",
            "warehouse_location must be 1..64 chars",
        ));
    }
    Ok(normalized)
}

pub(crate) fn normalize_optional_product_key(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim().to_uppercase();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

pub(crate) fn normalize_box_total(value: i32) -> Result<i32, (StatusCode, Json<ErrorResponse>)> {
    if !(1..=20).contains(&value) {
        return Err(validation_error(
            "invalid_box_total",
            "box_total must be between 1 and 20",
        ));
    }
    Ok(value)
}

pub(crate) fn normalize_section(value: &str) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let section = value.trim().to_uppercase();
    if section.len() != 1 {
        return Err(validation_error(
            "invalid_section",
            "section must be one letter [A,B,C,D,E,F,G,H,I,J,K,M]",
        ));
    }
    let allowed = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"];
    if !allowed.contains(&section.as_str()) {
        return Err(validation_error(
            "invalid_section",
            "section must be one of A,B,C,D,E,F,G,H,I,J,K,M",
        ));
    }
    Ok(section)
}

pub(crate) fn normalize_kid_number(
    value: &str,
) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let normalized = value.trim().to_uppercase();
    if normalized.is_empty() || normalized.len() > 64 {
        return Err(validation_error(
            "invalid_kid_number",
            "kid_number must be 1..64 chars",
        ));
    }
    Ok(normalized)
}

pub(crate) fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}
