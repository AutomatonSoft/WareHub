use axum::{
    http::StatusCode,
    Json,
};
use uuid::Uuid;
use crate::intakes_create_repository::{self as create_repo, InsertIntakeRowInput};

use crate::intakes_common::{
    normalize_box_total, normalize_kid_number, normalize_optional_product_key,
    normalize_optional_text, normalize_qr_code, normalize_section, normalize_warehouse_location,
};
use crate::intakes_categories::{
    normalize_optional_category_main, normalize_optional_category_sub,
};
use crate::intakes_placement::{
    compose_warehouse_location, decide_placement, fetch_next_unit_index,
    normalize_placement_strategy, reserve_pool_slot_number, PlacementStrategy,
};
use crate::{
    append_service_log, enrich_intake_rows_by_internal_index, extract_order_id_from_qr,
    hydrate_intake_activity, purge_expired_inactive_intakes, validation_error, AppState,
    CreateIntakeRequest, ErrorResponse, IntakeDto, IntakeEventMessage, IntakeProductSnapshot,
};

pub(crate) async fn create_intake_service(
    state: &AppState,
    payload: CreateIntakeRequest,
) -> Result<(StatusCode, Json<IntakeDto>), (StatusCode, Json<ErrorResponse>)> {
    let _ = purge_expired_inactive_intakes(&state.db).await;
    let qr_code = normalize_qr_code(&payload.qr_code)?;
    let kid_number = normalize_kid_number(&payload.kid_number)?;
    let photo_url = normalize_optional_text(payload.photo_url);
    let product_key = normalize_optional_product_key(payload.product_key);
    let category_main = normalize_optional_category_main(payload.category_main)?;
    let category_sub =
        normalize_optional_category_sub(category_main.as_deref(), payload.category_sub)?;
    let is_b_ware = payload.is_b_ware.unwrap_or(false);
    let b_ware_comment = normalize_optional_text(payload.b_ware_comment);
    let box_total = normalize_box_total(payload.box_total.unwrap_or(1))?;
    let placement_strategy = normalize_placement_strategy(payload.placement_strategy);
    let placement_section = payload
        .placement_section
        .as_deref()
        .map(normalize_section)
        .transpose()?;
    let mut snapshot = IntakeProductSnapshot {
        order_id: extract_order_id_from_qr(&qr_code),
        ..IntakeProductSnapshot::default()
    };
    let order_id_for_index = snapshot
        .order_id
        .clone()
        .or_else(|| extract_order_id_from_qr(&qr_code))
        .unwrap_or_else(|| "NOORDER".to_string());
    let unit_index = fetch_next_unit_index(
        &state.db,
        product_key.as_deref(),
        Some(&qr_code),
        Some(&kid_number),
    )
    .await?;

    let manual_location = payload
        .warehouse_location
        .as_deref()
        .map(normalize_warehouse_location)
        .transpose()?;
    if let Some(color) = payload.product_color.as_deref().and_then(|value| {
        let normalized = value.trim();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized.to_string())
        }
    }) {
        snapshot.product_color = Some(color);
    }

    let kid_compact = kid_number
        .trim()
        .trim_start_matches("KID-")
        .trim_start_matches("kid-")
        .trim();
    let internal_index = format!("{unit_index}-{kid_compact}-{order_id_for_index}");

    let mut tx = state.db.begin().await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "create_intake_failed",
                message: "failed to create intake".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    let (section, slot_number, warehouse_location) =
        if matches!(placement_strategy, PlacementStrategy::PoolAuto) {
            let section = placement_section.ok_or_else(|| {
                validation_error(
                    "invalid_section",
                    "placement_section is required for pool_auto placement",
                )
            })?;
            let slot = reserve_pool_slot_number(&mut tx, &section, &internal_index).await?;
            let location = compose_warehouse_location(slot, &section);
            (section, slot, location)
        } else {
            decide_placement(
                &state.db,
                product_key.as_deref(),
                manual_location.clone(),
                placement_strategy,
            )
            .await?
        };

    let mut first_created: Option<IntakeDto> = None;
    for box_index in 1..=box_total {
        let intake_id = Uuid::new_v4();
        let result = create_repo::insert_intake_row(
            &mut tx,
            InsertIntakeRowInput {
                intake_id,
                qr_code: &qr_code,
                warehouse_location: &warehouse_location,
                kid_number: &kid_number,
                photo_url: &photo_url,
                product_key: &product_key,
                category_main: &category_main,
                category_sub: &category_sub,
                is_b_ware,
                b_ware_comment: &b_ware_comment,
                section: &section,
                slot_number,
                box_index,
                box_total,
                unit_index,
                internal_index: &internal_index,
                snapshot: &snapshot,
            },
        )
        .await;

        match result {
            Ok(mut intake) => {
                hydrate_intake_activity(&mut intake);
                if first_created.is_none() {
                    first_created = Some(intake.clone());
                }
                let _ = state.intake_events.send(IntakeEventMessage {
                    kind: "intake_created".to_string(),
                    intake: Some(intake.clone()),
                    intake_id: Some(intake.id),
                });
            }
            Err(sqlx::Error::Database(db_error)) if db_error.code().as_deref() == Some("23505") => {
                return Err((
                    StatusCode::CONFLICT,
                    Json(ErrorResponse {
                        code: "duplicate_intake",
                        message:
                            "intake with same qr_code, kid_number, unit_index and box_index already exists"
                                .to_string(),
                        details: None,
                        request_id: crate::new_request_id(),
                    }),
                ));
            }
            Err(_) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        code: "create_intake_failed",
                        message: "failed to create intake".to_string(),
                        details: None,
                        request_id: crate::new_request_id(),
                    }),
                ))
            }
        }
    }

    tx.commit().await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "create_intake_failed",
                message: "failed to create intake".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    if let Some(created) = first_created.clone() {
        let db = state.db.clone();
        let logs_state = state.clone();
        let events_state = state.clone();
        let qr_code_bg = qr_code.clone();
        let product_key_bg = product_key.clone();
        let internal_index_bg = created.internal_index.clone();
        tokio::spawn(async move {
            if let Some(internal_index) = internal_index_bg {
                match enrich_intake_rows_by_internal_index(
                    &db,
                    &internal_index,
                    &qr_code_bg,
                    product_key_bg.as_deref(),
                )
                .await
                {
                    Ok(rows) => {
                        for intake in rows {
                            let _ = events_state.intake_events.send(IntakeEventMessage {
                                kind: "intake_updated".to_string(),
                                intake: Some(intake.clone()),
                                intake_id: Some(intake.id),
                            });
                        }
                    }
                    Err(error) => {
                        append_service_log(
                            &logs_state,
                            "backend",
                            "warn",
                            format!("background enrichment failed for {internal_index}: {error}"),
                            None,
                        )
                        .await;
                    }
                }
            }
        });
    }

    if let Some(created) = first_created {
        Ok((StatusCode::CREATED, Json(created)))
    } else {
        Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "create_intake_failed",
                message: "no intake rows were created".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ))
    }
}
