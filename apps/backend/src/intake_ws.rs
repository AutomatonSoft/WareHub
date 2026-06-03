use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use tokio::sync::broadcast;

use crate::{auth::require_approved_user, AppState, ErrorResponse, IntakeEventMessage};

#[derive(Debug, Deserialize)]
pub(crate) struct IntakeWsQuery {
    token: Option<String>,
}

pub(crate) async fn intakes_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<IntakeWsQuery>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let auth_headers = build_ws_auth_headers(&headers, query.token)?;
    let _user = require_approved_user(&state, &auth_headers).await?;
    Ok(ws.on_upgrade(move |socket| intakes_ws_connection(socket, state.intake_events.subscribe())))
}

pub(crate) fn build_ws_auth_headers(
    headers: &HeaderMap,
    query_token: Option<String>,
) -> Result<HeaderMap, (StatusCode, Json<ErrorResponse>)> {
    if headers.contains_key(axum::http::header::AUTHORIZATION) {
        return Ok(headers.clone());
    }
    let token = extract_ws_auth_token(headers, query_token);
    let token = token.trim();
    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                code: "unauthorized",
                message: "missing authorization token".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    }
    let mut next = headers.clone();
    let bearer = format!("Bearer {token}");
    let value = HeaderValue::from_str(&bearer).map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                code: "invalid_token",
                message: "invalid authorization token".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;
    next.insert(axum::http::header::AUTHORIZATION, value);
    Ok(next)
}

fn extract_ws_auth_token(headers: &HeaderMap, query_token: Option<String>) -> String {
    if let Some(value) = headers.get(axum::http::header::SEC_WEBSOCKET_PROTOCOL) {
        if let Ok(raw) = value.to_str() {
            for candidate in raw.split(',').map(str::trim) {
                if let Some(token) = candidate.strip_prefix("auth.") {
                    if !token.trim().is_empty() {
                        return token.trim().to_string();
                    }
                }
            }
        }
    }
    query_token.unwrap_or_default()
}

async fn intakes_ws_connection(
    mut socket: WebSocket,
    mut rx: broadcast::Receiver<IntakeEventMessage>,
) {
    loop {
        tokio::select! {
            maybe_event = rx.recv() => {
                match maybe_event {
                    Ok(event) => {
                        if let Ok(payload) = serde_json::to_string(&event) {
                            if socket.send(Message::Text(payload)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                }
            }
            maybe_msg = socket.recv() => {
                match maybe_msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }
}
