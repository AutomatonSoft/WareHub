use axum::{
    http::StatusCode,
    Json,
};
use sqlx::{Postgres, Transaction};

use crate::intakes_common::normalize_section;
use crate::intakes_delete_by_location_repository as delete_by_location_repo;
use crate::intakes_query_repository as query_repo;
use crate::{
    append_service_log, validation_error, AppState, DeleteIntakeByLocationQuery,
    DeleteIntakeByLocationResponse, ErrorResponse, IntakeEventMessage,
};

pub(crate) async fn delete_oldest_intake_by_location_service(
    state: &AppState,
    query: DeleteIntakeByLocationQuery,
    actor_login: &str,
) -> Result<Json<DeleteIntakeByLocationResponse>, (StatusCode, Json<ErrorResponse>)> {
    let section = normalize_section(&query.section)?;
    let slot_number = normalize_slot_number(query.slot_number)?;

    let mut tx = state.db.begin().await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "delete_intake_failed",
                message: "failed to delete intake".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    let seed = delete_by_location_repo::fetch_oldest_active_intake_seed_for_location(
        &mut tx,
        &section,
        slot_number,
    )
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "delete_intake_failed",
                message: "failed to delete intake".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    let Some(seed) = seed else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                code: "not_found",
                message: "active intake not found for location".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    };

    let deleted = if let Some(internal_index) = seed
        .internal_index
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        delete_by_location_repo::soft_delete_active_unit_group_by_internal_index(
            &mut tx,
            internal_index,
        )
        .await
    } else {
        let key = delete_by_location_repo::UnitGroupKey {
            section: &seed.section,
            slot_number: seed.slot_number,
            unit_index: seed.unit_index,
            qr_code: &seed.qr_code,
            kid_number: &seed.kid_number,
            product_key: seed.product_key.as_deref(),
            is_b_ware: seed.is_b_ware,
        };
        delete_by_location_repo::soft_delete_active_unit_group_by_key(&mut tx, &key).await
    }
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "delete_intake_failed",
                message: "failed to delete intake".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    if deleted.is_empty() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                code: "not_found",
                message: "active intake not found for location".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    }

    release_pool_slot_if_unused(&mut tx, &section, slot_number).await?;

    tx.commit().await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "delete_intake_failed",
                message: "failed to delete intake".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    for intake in &deleted {
        let _ = state.intake_events.send(IntakeEventMessage {
            kind: "intake_updated".to_string(),
            intake: Some(intake.clone()),
            intake_id: Some(intake.id),
        });
    }

    let request_id = crate::new_request_id();
    let warehouse_location = format!("{section}{slot_number}");
    let removed_count = deleted.len() as i64;
    let context = format!(
        "{{\"event\":\"intake_delete_by_location\",\"request_id\":\"{request_id}\",\"actor_login\":\"{}\",\"section\":\"{}\",\"slot_number\":{},\"warehouse_location\":\"{}\",\"removed_count\":{}}}",
        actor_login, section, slot_number, warehouse_location, removed_count
    );
    append_service_log(
        state,
        "backend",
        "info",
        "intake delete by location completed",
        Some(context),
    )
    .await;

    Ok(Json(DeleteIntakeByLocationResponse {
        removed_count,
        section: section.clone(),
        slot_number,
        warehouse_location,
    }))
}

fn normalize_slot_number(value: i32) -> Result<i32, (StatusCode, Json<ErrorResponse>)> {
    if !(1..=10000).contains(&value) {
        return Err(validation_error(
            "invalid_slot_number",
            "slot_number must be in range 1..10000",
        ));
    }
    Ok(value)
}

async fn release_pool_slot_if_unused(
    tx: &mut Transaction<'_, Postgres>,
    section: &str,
    slot_number: i32,
) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    let active_rows = query_repo::count_active_rows_for_slot(tx, section, slot_number)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "pool_release_failed",
                    message: "failed to release pool slot".to_string(),
                    details: None,
                    request_id: crate::new_request_id(),
                }),
            )
        })?;

    if active_rows > 0 {
        return Ok(());
    }

    query_repo::release_pool_slot_mapping(tx, section, slot_number)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "pool_release_failed",
                    message: "failed to release pool slot".to_string(),
                    details: None,
                    request_id: crate::new_request_id(),
                }),
            )
        })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_slot_number;

    #[test]
    fn normalize_slot_number_accepts_pool_range() {
        let result = normalize_slot_number(10000).expect("must normalize");
        assert_eq!(result, 10000);
    }

    #[test]
    fn normalize_slot_number_rejects_out_of_range_value() {
        let result = normalize_slot_number(0);
        assert!(result.is_err());
    }
}
