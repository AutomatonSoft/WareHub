use axum::{
    body::Body,
    extract::State,
    http::{HeaderValue, StatusCode},
    middleware::Next,
    Json,
};
use std::env;
use uuid::Uuid;

use crate::{append_service_log, capture_internal_error, AppState, ErrorResponse};

tokio::task_local! {
    pub(crate) static CURRENT_REQUEST_ID: String;
}

pub(crate) async fn backend_request_log_middleware(
    State(state): State<AppState>,
    mut request: axum::http::Request<Body>,
    next: Next,
) -> axum::response::Response {
    let request_id = request
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    if !request.headers().contains_key("x-request-id") {
        if let Ok(value) = HeaderValue::from_str(&request_id) {
            request.headers_mut().insert("x-request-id", value);
        }
    }

    let method = request.method().to_string();
    let path = request.uri().path().to_string();
    let started = std::time::Instant::now();
    let mut response = CURRENT_REQUEST_ID
        .scope(request_id.clone(), async move { next.run(request).await })
        .await;
    if !response.headers().contains_key("x-request-id") {
        if let Ok(value) = HeaderValue::from_str(&request_id) {
            response.headers_mut().insert("x-request-id", value);
        }
    }
    let status = response.status();
    let elapsed_ms = started.elapsed().as_millis();
    let level = if status.is_server_error() {
        "error"
    } else if status.is_client_error() {
        "warn"
    } else {
        "info"
    };
    let message = format!("{method} {path} -> {} ({elapsed_ms} ms)", status.as_u16());
    append_service_log(&state, "backend", level, message, None).await;
    response
}

pub(crate) fn env_flag(name: &str, default: bool) -> bool {
    match env::var(name) {
        Ok(value) => matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        ),
        Err(_) => default,
    }
}

pub(crate) fn validation_error(
    code: &'static str,
    message: &str,
) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            code,
            message: message.to_string(),
            request_id: new_request_id(),
            details: None,
        }),
    )
}

pub(crate) fn internal_error(message: String) -> (StatusCode, Json<ErrorResponse>) {
    let request_id = new_request_id();
    tracing::error!(error = %message, request_id = %request_id, "internal server error");
    capture_internal_error(&message, &request_id);
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            code: "internal_error",
            message: "internal server error".to_string(),
            request_id,
            details: None,
        }),
    )
}

pub(crate) fn new_request_id() -> String {
    CURRENT_REQUEST_ID
        .try_with(Clone::clone)
        .unwrap_or_else(|_| Uuid::new_v4().to_string())
}
