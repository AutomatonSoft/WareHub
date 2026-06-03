use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Html,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

use crate::{auth::require_approved_user, validation_error, AppState, ErrorResponse};

pub(crate) const MAX_LOGS_PER_CHANNEL: usize = 1000;
pub(crate) const MAX_LOG_MESSAGE_LEN: usize = 1024;
pub(crate) const MAX_LOG_CONTEXT_LEN: usize = 8192;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ServiceLogEntry {
    pub(crate) timestamp: DateTime<Utc>,
    pub(crate) channel: String,
    pub(crate) level: String,
    pub(crate) message: String,
    pub(crate) context: Option<String>,
}

#[derive(Debug, Default)]
pub(crate) struct InMemoryLogs {
    backend: VecDeque<ServiceLogEntry>,
    frontend: VecDeque<ServiceLogEntry>,
    mobile: VecDeque<ServiceLogEntry>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ServiceLogsQuery {
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateServiceLogRequest {
    level: Option<String>,
    message: String,
    context: Option<String>,
}

pub(crate) async fn service_logs_page(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Html<&'static str>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    Ok(Html(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SofortBOT Logs</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        padding: 20px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        background: #0b1220;
        color: #d8dee9;
      }
      .row { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
      button {
        border: 1px solid #3a475f;
        background: #1a2437;
        color: #d8dee9;
        padding: 8px 12px;
        border-radius: 8px;
        cursor: pointer;
      }
      button.active {
        background: #2563eb;
        border-color: #2563eb;
      }
      #status { margin: 0 0 8px 0; font-size: 12px; opacity: .8; }
      #logs {
        border: 1px solid #2b374f;
        border-radius: 8px;
        background: #111a2b;
        padding: 12px;
        white-space: pre-wrap;
        max-height: calc(100vh - 170px);
        overflow: auto;
        font-size: 12px;
        line-height: 1.4;
      }
    </style>
  </head>
  <body>
    <h2 style="margin-top:0">SofortBOT Logs</h2>
    <div class="row">
      <button id="frontendBtn" onclick="switchChannel('frontend')">frontend</button>
      <button id="backendBtn" onclick="switchChannel('backend')">backend</button>
      <button id="mobileBtn" onclick="switchChannel('mobile')">mobile</button>
    </div>
    <p id="status">loading...</p>
    <div id="logs"></div>
    <script>
      let current = 'backend';
      let timer = null;
      const statusEl = document.getElementById('status');
      const logsEl = document.getElementById('logs');
      const buttons = {
        frontend: document.getElementById('frontendBtn'),
        backend: document.getElementById('backendBtn'),
        mobile: document.getElementById('mobileBtn'),
      };
      function renderButtons() {
        for (const key of Object.keys(buttons)) {
          buttons[key].classList.toggle('active', key === current);
        }
      }
      async function loadLogs() {
        try {
          const resp = await fetch(`/api/v1/logs/${current}?limit=300`, { cache: 'no-store' });
          if (!resp.ok) {
            statusEl.textContent = `HTTP ${resp.status}`;
            return;
          }
          const rows = await resp.json();
          statusEl.textContent = `${current}: ${rows.length} entries`;
          if (!Array.isArray(rows) || rows.length === 0) {
            logsEl.textContent = `No logs for ${current}.`;
            return;
          }
          logsEl.textContent = rows
            .map((r) => {
              const ts = r.timestamp || '';
              const level = (r.level || '').toUpperCase();
              const msg = r.message || '';
              const ctx = r.context ? `\n  ${r.context}` : '';
              return `[${ts}] [${level}] ${msg}${ctx}`;
            })
            .join('\n\n');
        } catch (e) {
          statusEl.textContent = `Error: ${e}`;
        }
      }
      function switchChannel(next) {
        current = next;
        renderButtons();
        loadLogs();
      }
      renderButtons();
      loadLogs();
      timer = setInterval(loadLogs, 3000);
      window.addEventListener('beforeunload', () => clearInterval(timer));
    </script>
  </body>
</html>
"#,
    ))
}

fn normalize_log_channel(raw: &str) -> Option<&'static str> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "backend" => Some("backend"),
        "frontend" => Some("frontend"),
        "mobile" => Some("mobile"),
        _ => None,
    }
}

pub(crate) fn normalize_log_level(raw: Option<String>) -> String {
    match raw
        .unwrap_or_else(|| "info".to_string())
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "debug" => "debug".to_string(),
        "warn" | "warning" => "warn".to_string(),
        "error" => "error".to_string(),
        _ => "info".to_string(),
    }
}

fn trim_and_limit(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect::<String>()
}

pub(crate) fn normalize_log_message(
    raw: &str,
) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(validation_error(
            "invalid_log_message",
            "message is required",
        ));
    }
    Ok(trim_and_limit(trimmed, MAX_LOG_MESSAGE_LEN))
}

pub(crate) fn normalize_log_context(raw: Option<String>) -> Option<String> {
    let value = raw?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trim_and_limit(trimmed, MAX_LOG_CONTEXT_LEN))
}

pub(crate) async fn append_service_log(
    state: &AppState,
    channel: &str,
    level: impl Into<String>,
    message: impl Into<String>,
    context: Option<String>,
) {
    let entry = ServiceLogEntry {
        timestamp: Utc::now(),
        channel: channel.to_string(),
        level: level.into(),
        message: message.into(),
        context,
    };
    let mut store = state.logs.write().await;
    let queue = match channel {
        "backend" => &mut store.backend,
        "frontend" => &mut store.frontend,
        "mobile" => &mut store.mobile,
        _ => return,
    };
    queue.push_front(entry);
    while queue.len() > MAX_LOGS_PER_CHANNEL {
        let _ = queue.pop_back();
    }
}

pub(crate) async fn create_service_log(
    Path(channel): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateServiceLogRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let channel = normalize_log_channel(&channel).ok_or_else(|| {
        validation_error(
            "invalid_log_channel",
            "channel must be one of: frontend, backend, mobile",
        )
    })?;

    let message = normalize_log_message(&payload.message)?;
    let context = normalize_log_context(payload.context);

    append_service_log(
        &state,
        channel,
        normalize_log_level(payload.level),
        message,
        context,
    )
    .await;
    Ok(StatusCode::ACCEPTED)
}

pub(crate) async fn list_service_logs(
    Path(channel): Path<String>,
    Query(query): Query<ServiceLogsQuery>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<ServiceLogEntry>>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let channel = normalize_log_channel(&channel).ok_or_else(|| {
        validation_error(
            "invalid_log_channel",
            "channel must be one of: frontend, backend, mobile",
        )
    })?;
    let limit = query.limit.unwrap_or(200).clamp(1, MAX_LOGS_PER_CHANNEL);

    let data = list_service_logs_by_channel(&state, channel, limit).await;
    Ok(Json(data))
}

pub(crate) async fn list_service_logs_by_channel(
    state: &AppState,
    channel: &str,
    limit: usize,
) -> Vec<ServiceLogEntry> {
    let safe_limit = limit.clamp(1, MAX_LOGS_PER_CHANNEL);
    let store = state.logs.read().await;
    let source = match channel {
        "backend" => &store.backend,
        "frontend" => &store.frontend,
        "mobile" => &store.mobile,
        _ => return Vec::new(),
    };
    source.iter().take(safe_limit).cloned().collect()
}
