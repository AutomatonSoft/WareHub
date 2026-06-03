use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use std::collections::HashMap;

use crate::{auth::require_approved_user, validation_error, AppState, ErrorResponse};
use crate::intakes_placement_repository as placement_repo;

#[derive(Debug, Deserialize)]
pub(crate) struct SuggestPlacementRequest {
    product_key: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct PlacementLocationDto {
    section: String,
    slot_number: i32,
    warehouse_location: String,
}

#[derive(Debug, Serialize, FromRow)]
pub(crate) struct ExistingPlacementDto {
    section: String,
    slot_number: i32,
    warehouse_location: String,
    units: i64,
}

#[derive(Debug, Serialize)]
pub(crate) struct SuggestPlacementResponse {
    product_key: String,
    has_existing: bool,
    existing_location: Option<ExistingPlacementDto>,
    suggested_new_location: PlacementLocationDto,
    next_unit_index: i32,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum PlacementStrategy {
    SameIfExists,
    AlwaysNew,
    Manual,
    PoolAuto,
}

pub(crate) async fn suggest_placement(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SuggestPlacementRequest>,
) -> Result<Json<SuggestPlacementResponse>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let product_key = normalize_required_product_key(&payload.product_key)?;
    let existing_location = fetch_existing_product_location(&state.db, &product_key).await?;
    let next_unit_index =
        fetch_next_unit_index(&state.db, Some(product_key.as_str()), None, None).await?;
    let suggested_new_location = suggest_new_location(&state.db).await?;

    Ok(Json(SuggestPlacementResponse {
        product_key,
        has_existing: existing_location.is_some(),
        existing_location,
        suggested_new_location,
        next_unit_index,
    }))
}

pub(crate) fn normalize_placement_strategy(raw: Option<String>) -> PlacementStrategy {
    match raw.unwrap_or_default().trim().to_ascii_lowercase().as_str() {
        "always_new" => PlacementStrategy::AlwaysNew,
        "manual" => PlacementStrategy::Manual,
        "pool_auto" => PlacementStrategy::PoolAuto,
        _ => PlacementStrategy::SameIfExists,
    }
}

pub(crate) async fn decide_placement(
    db: &PgPool,
    product_key: Option<&str>,
    manual_location: Option<String>,
    strategy: PlacementStrategy,
) -> Result<(String, i32, String), (StatusCode, Json<ErrorResponse>)> {
    if matches!(strategy, PlacementStrategy::Manual) {
        let location = manual_location.ok_or_else(|| {
            validation_error(
                "invalid_warehouse_location",
                "warehouse_location is required for manual placement",
            )
        })?;
        let (slot, section, normalized_location) = parse_warehouse_location(&location)?;
        return Ok((section, slot, normalized_location));
    }

    if let Some(key) = product_key {
        if matches!(strategy, PlacementStrategy::SameIfExists) {
            if let Some(existing) = fetch_existing_product_location(db, key).await? {
                return Ok((
                    existing.section,
                    existing.slot_number,
                    existing.warehouse_location,
                ));
            }
        }
    }

    let suggested = suggest_new_location(db).await?;
    Ok((
        suggested.section,
        suggested.slot_number,
        suggested.warehouse_location,
    ))
}

async fn fetch_existing_product_location(
    db: &PgPool,
    product_key: &str,
) -> Result<Option<ExistingPlacementDto>, (StatusCode, Json<ErrorResponse>)> {
    let result = placement_repo::fetch_existing_product_location_row(db, product_key).await;

    match result {
        Ok(value) => Ok(value),
        Err(_) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "placement_lookup_failed",
                message: "failed to resolve placement".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )),
    }
}

pub(crate) async fn fetch_next_unit_index(
    db: &PgPool,
    product_key: Option<&str>,
    qr_code: Option<&str>,
    kid_number: Option<&str>,
) -> Result<i32, (StatusCode, Json<ErrorResponse>)> {
    if let Some(key) = product_key {
        let row = placement_repo::fetch_max_unit_index_by_product_key(db, key).await;

        return match row {
            Ok(Some(max_unit)) => Ok(max_unit + 1),
            Ok(None) => Ok(1),
            Err(_) => Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "placement_lookup_failed",
                    message: "failed to resolve placement".to_string(),
                    details: None,
                    request_id: crate::new_request_id(),
                }),
            )),
        };
    }

    if let (Some(qr), Some(kid)) = (qr_code, kid_number) {
        let row = placement_repo::fetch_max_unit_index_by_qr_and_kid(db, qr, kid).await;

        return match row {
            Ok(Some(max_unit)) => Ok(max_unit + 1),
            Ok(None) => Ok(1),
            Err(_) => Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "placement_lookup_failed",
                    message: "failed to resolve placement".to_string(),
                    details: None,
                    request_id: crate::new_request_id(),
                }),
            )),
        };
    }

    Ok(1)
}

pub(crate) async fn reserve_pool_slot_number(
    tx: &mut Transaction<'_, Postgres>,
    section: &str,
    internal_index: &str,
) -> Result<i32, (StatusCode, Json<ErrorResponse>)> {
    placement_repo::ensure_pool_section_row(tx, section)
        .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "pool_lookup_failed",
                message: "failed to reserve pool slot".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    let all_pool_rows = placement_repo::lock_all_pool_slots(tx)
        .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "pool_lookup_failed",
                message: "failed to reserve pool slot".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;
    let used_slots = collect_used_pool_slots(&all_pool_rows);
    let mut section_slots = all_pool_rows
        .iter()
        .find(|(row_section, _)| row_section == section)
        .and_then(|(_, slots)| slots.as_object().cloned())
        .unwrap_or_default();

    let Some(slot) = find_first_free_pool_location(&used_slots) else {
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                code: "pool_exhausted",
                message: "no free slot numbers left in pool 1..10000".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    };

    section_slots.insert(
        slot.to_string(),
        Value::Array(vec![
            Value::String(section.to_string()),
            Value::String(internal_index.to_string()),
        ]),
    );
    let slots_value = Value::Object(section_slots);
    placement_repo::update_pool_slots_for_section(tx, section, slots_value)
        .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "pool_update_failed",
                message: "failed to reserve pool slot".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    Ok(slot)
}

pub(crate) fn collect_used_pool_slots(rows: &[(String, Value)]) -> Map<String, Value> {
    let mut used = Map::new();
    for (_, slots) in rows {
        if let Some(obj) = slots.as_object() {
            for (slot_key, slot_value) in obj {
                used.entry(slot_key.clone()).or_insert_with(|| slot_value.clone());
            }
        }
    }
    used
}

pub(crate) fn find_first_free_pool_location(slots: &serde_json::Map<String, Value>) -> Option<i32> {
    (1..=10000).find(|&slot| !slots.contains_key(&slot.to_string()))
}

async fn suggest_new_location(
    db: &PgPool,
) -> Result<PlacementLocationDto, (StatusCode, Json<ErrorResponse>)> {
    const SECTION_PRIORITY: [&str; 11] = ["D", "E", "F", "G", "H", "I", "J", "C", "B", "K", "M"];

    let section_max_rows = placement_repo::fetch_section_max_rows(db)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "placement_lookup_failed",
                message: "failed to resolve placement".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;
    let mut section_max: HashMap<String, i32> = HashMap::new();
    for (section, max_slot) in section_max_rows {
        section_max.insert(section, max_slot.unwrap_or(0));
    }

    let mut best_section = SECTION_PRIORITY[0].to_string();
    let mut best_next_slot = i32::MAX;
    for section in SECTION_PRIORITY {
        let current_max = *section_max.get(section).unwrap_or(&0);
        let next_slot = current_max.saturating_add(1);
        if next_slot < best_next_slot {
            best_next_slot = next_slot;
            best_section = section.to_string();
        }
    }

    Ok(PlacementLocationDto {
        section: best_section.clone(),
        slot_number: best_next_slot,
        warehouse_location: compose_warehouse_location(best_next_slot, &best_section),
    })
}

pub(crate) fn compose_warehouse_location(slot_number: i32, section: &str) -> String {
    format!("{section}{slot_number}")
}

fn parse_warehouse_location(
    value: &str,
) -> Result<(i32, String, String), (StatusCode, Json<ErrorResponse>)> {
    fn parse_slot(slot_raw: &str) -> Result<(i32, String), (StatusCode, Json<ErrorResponse>)> {
        let normalized = slot_raw.trim().to_uppercase();
        let mut digits = String::new();
        let mut suffix = String::new();
        let mut seen_suffix = false;
        for ch in normalized.chars() {
            if ch.is_ascii_digit() && !seen_suffix {
                digits.push(ch);
            } else if ch.is_ascii_alphabetic() {
                seen_suffix = true;
                suffix.push(ch);
            } else {
                return Err(validation_error(
                    "invalid_warehouse_location",
                    "warehouse slot must be number with optional letters suffix (e.g. 88A)",
                ));
            }
        }
        if digits.is_empty() {
            return Err(validation_error(
                "invalid_warehouse_location",
                "warehouse slot must start with number",
            ));
        }
        let slot = digits.parse::<i32>().map_err(|_| {
            validation_error(
                "invalid_warehouse_location",
                "warehouse slot must be a number",
            )
        })?;
        if slot < 1 {
            return Err(validation_error(
                "invalid_warehouse_location",
                "warehouse slot must be >= 1",
            ));
        }
        let normalized_slot = if suffix.is_empty() {
            digits
        } else {
            format!("{digits}{suffix}")
        };
        Ok((slot, normalized_slot))
    }

    let normalized = value.trim().to_uppercase();
    if normalized.is_empty() || normalized.len() > 64 {
        return Err(validation_error(
            "invalid_warehouse_location",
            "warehouse_location must be 1..64 chars",
        ));
    }

    let mut chars = normalized.chars();
    let Some(section) = chars.next() else {
        return Err(validation_error(
            "invalid_warehouse_location",
            "warehouse_location must start with section letter",
        ));
    };
    if !section.is_ascii_alphabetic() {
        return Err(validation_error(
            "invalid_warehouse_location",
            "warehouse_location must start with section letter",
        ));
    }
    let section = section.to_string();
    let allowed = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"];
    if !allowed.contains(&section.as_str()) {
        return Err(validation_error(
            "invalid_warehouse_location",
            "section must be one of A,B,C,D,E,F,G,H,I,J,K,M",
        ));
    }

    let tail: String = chars.collect();
    let tail = tail.trim();
    if tail.is_empty() {
        return Err(validation_error(
            "invalid_warehouse_location",
            "warehouse slot is required after section",
        ));
    }
    let (slot_number, normalized_slot) = parse_slot(tail)?;
    let normalized_location = format!("{section}{normalized_slot}");
    Ok((slot_number, section, normalized_location))
}

fn normalize_required_product_key(
    value: &str,
) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let normalized = value.trim().to_uppercase();
    if normalized.is_empty() || normalized.len() > 128 {
        return Err(validation_error(
            "invalid_product_key",
            "product_key must be 1..128 chars",
        ));
    }
    Ok(normalized)
}
