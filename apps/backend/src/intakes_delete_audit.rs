use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    auth::require_admin_user, list_service_logs_by_channel, validation_error, AppState,
    ErrorResponse, ServiceLogEntry,
};

#[derive(Debug, Deserialize)]
pub(crate) struct ListIntakeDeleteAuditQuery {
    limit: Option<usize>,
    actor_login: Option<String>,
    request_id: Option<String>,
    section: Option<String>,
    from: Option<String>,
    to: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct IntakeDeleteAuditEntry {
    timestamp: DateTime<Utc>,
    event: String,
    request_id: String,
    actor_login: String,
    section: Option<String>,
    slot_number: Option<i32>,
    warehouse_location: Option<String>,
    intake_id: Option<String>,
    mode: Option<String>,
    removed_count: Option<i64>,
}

pub(crate) async fn list_intake_delete_audit_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListIntakeDeleteAuditQuery>,
) -> Result<Json<Vec<IntakeDeleteAuditEntry>>, (StatusCode, Json<ErrorResponse>)> {
    let _admin = require_admin_user(&state, &headers).await?;
    let filters = normalize_filters(query)?;
    let fetch_limit = filters.limit.saturating_mul(8).clamp(1, 2000);
    let logs = list_service_logs_by_channel(&state, "backend", fetch_limit).await;

    let mut entries = Vec::new();
    for log in logs {
        if let Some(entry) = to_audit_entry(&log) {
            if matches_filters(&entry, &filters) {
                entries.push(entry);
            }
        }
        if entries.len() >= filters.limit {
            break;
        }
    }
    Ok(Json(entries))
}

#[derive(Debug)]
struct AuditFilters {
    limit: usize,
    actor_login: Option<String>,
    request_id: Option<String>,
    section: Option<String>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
}

fn normalize_filters(
    query: ListIntakeDeleteAuditQuery,
) -> Result<AuditFilters, (StatusCode, Json<ErrorResponse>)> {
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let actor_login = query
        .actor_login
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.to_ascii_lowercase());
    let request_id = query
        .request_id
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    let section = query
        .section
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.to_ascii_uppercase());

    let from = parse_optional_datetime(query.from.as_deref(), "from")?;
    let to = parse_optional_datetime(query.to.as_deref(), "to")?;
    if let (Some(from), Some(to)) = (from, to) {
        if from > to {
            return Err(validation_error(
                "invalid_time_range",
                "from must be <= to (RFC3339)",
            ));
        }
    }
    Ok(AuditFilters {
        limit,
        actor_login,
        request_id,
        section,
        from,
        to,
    })
}

fn parse_optional_datetime(
    raw: Option<&str>,
    field_name: &str,
) -> Result<Option<DateTime<Utc>>, (StatusCode, Json<ErrorResponse>)> {
    let Some(raw) = raw.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    DateTime::parse_from_rfc3339(raw)
        .map(|v| Some(v.with_timezone(&Utc)))
        .map_err(|_| {
            validation_error(
                "invalid_datetime",
                &format!("{field_name} must be RFC3339 datetime"),
            )
        })
}

fn to_audit_entry(log: &ServiceLogEntry) -> Option<IntakeDeleteAuditEntry> {
    let context = log.context.as_deref()?;
    let json: Value = serde_json::from_str(context).ok()?;
    let event = json.get("event")?.as_str()?.to_string();
    if event != "intake_delete_by_id" && event != "intake_delete_by_location" {
        return None;
    }
    let request_id = json
        .get("request_id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let actor_login = json
        .get("actor_login")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let section = json
        .get("section")
        .and_then(Value::as_str)
        .map(|v| v.to_string());
    let slot_number = json
        .get("slot_number")
        .and_then(Value::as_i64)
        .and_then(|v| i32::try_from(v).ok());
    let warehouse_location = json
        .get("warehouse_location")
        .and_then(Value::as_str)
        .map(|v| v.to_string());
    let intake_id = json
        .get("intake_id")
        .and_then(Value::as_str)
        .map(|v| v.to_string());
    let mode = json
        .get("mode")
        .and_then(Value::as_str)
        .map(|v| v.to_string());
    let removed_count = json.get("removed_count").and_then(Value::as_i64);

    Some(IntakeDeleteAuditEntry {
        timestamp: log.timestamp,
        event,
        request_id,
        actor_login,
        section,
        slot_number,
        warehouse_location,
        intake_id,
        mode,
        removed_count,
    })
}

fn matches_filters(entry: &IntakeDeleteAuditEntry, filters: &AuditFilters) -> bool {
    if let Some(actor) = filters.actor_login.as_deref() {
        if entry.actor_login.to_ascii_lowercase() != actor {
            return false;
        }
    }
    if let Some(request_id) = filters.request_id.as_deref() {
        if entry.request_id != request_id {
            return false;
        }
    }
    if let Some(section) = filters.section.as_deref() {
        if entry.section.as_deref().unwrap_or_default() != section {
            return false;
        }
    }
    if let Some(from) = filters.from {
        if entry.timestamp < from {
            return false;
        }
    }
    if let Some(to) = filters.to {
        if entry.timestamp > to {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::{matches_filters, AuditFilters, IntakeDeleteAuditEntry};
    use chrono::{TimeZone, Utc};

    #[test]
    fn matches_filters_checks_actor_section_and_time_bounds() {
        let entry = IntakeDeleteAuditEntry {
            timestamp: Utc
                .with_ymd_and_hms(2026, 3, 20, 10, 0, 0)
                .single()
                .expect("valid dt"),
            event: "intake_delete_by_location".to_string(),
            request_id: "r1".to_string(),
            actor_login: "admin".to_string(),
            section: Some("C".to_string()),
            slot_number: Some(20),
            warehouse_location: Some("C20".to_string()),
            intake_id: None,
            mode: None,
            removed_count: Some(2),
        };
        let filters = AuditFilters {
            limit: 10,
            actor_login: Some("admin".to_string()),
            request_id: Some("r1".to_string()),
            section: Some("C".to_string()),
            from: Some(Utc.with_ymd_and_hms(2026, 3, 20, 9, 0, 0).single().expect("valid dt")),
            to: Some(Utc.with_ymd_and_hms(2026, 3, 20, 11, 0, 0).single().expect("valid dt")),
        };
        assert!(matches_filters(&entry, &filters));
    }
}
