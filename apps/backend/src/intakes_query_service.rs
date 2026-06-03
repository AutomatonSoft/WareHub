use axum::{
    http::StatusCode,
    Json,
};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::intakes_common::normalize_section;
use crate::intakes_enrichment::purge_expired_inactive_intakes;
use crate::intakes_photo_cleanup_service::enqueue_photo_cleanup_retry;
use crate::intakes_query_repository as query_repo;
use crate::{
    append_service_log, delete_uploaded_photo_by_url, hydrate_intake_activity_many,
    validation_error, AppState, DeleteIntakeQuery, ErrorResponse, IntakeDto, IntakeEventMessage,
    ListIntakesQuery, ProductStockStatDto, UpdateIntakePhotoRequest,
};

pub(crate) async fn list_intakes_service(
    state: &AppState,
    query: ListIntakesQuery,
) -> Result<Json<Vec<IntakeDto>>, (StatusCode, Json<ErrorResponse>)> {
    let _ = purge_expired_inactive_intakes(&state.db).await;
    let limit = normalize_intakes_limit(query.limit)?;
    let offset = normalize_intakes_offset(query.offset)?;
    let section = normalize_intakes_section_filter(query.section.as_deref())?;
    let activity_filter = normalize_intakes_activity_filter(query.activity.as_deref())?;
    let search = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    let mut rows = query_repo::fetch_intakes_rows(
        &state.db,
        limit,
        offset,
        section.as_deref(),
        activity_filter,
        search.as_deref(),
    )
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "list_intakes_failed",
                    message: "failed to list intakes".to_string(),
                    details: None,
                    request_id: crate::new_request_id(),
                }),
            )
        })?;
    hydrate_intake_activity_many(&mut rows);
    Ok(Json(rows))
}

pub(crate) fn normalize_intakes_limit(
    value: Option<i64>,
) -> Result<i64, (StatusCode, Json<ErrorResponse>)> {
    let limit = value.unwrap_or(50);
    if !(1..=200).contains(&limit) {
        return Err(validation_error(
            "invalid_limit",
            "limit must be in range 1..200",
        ));
    }
    Ok(limit)
}

pub(crate) fn normalize_intakes_offset(
    value: Option<i64>,
) -> Result<i64, (StatusCode, Json<ErrorResponse>)> {
    let offset = value.unwrap_or(0);
    if offset < 0 {
        return Err(validation_error("invalid_offset", "offset must be >= 0"));
    }
    Ok(offset)
}

pub(crate) fn normalize_intakes_section_filter(
    value: Option<&str>,
) -> Result<Option<String>, (StatusCode, Json<ErrorResponse>)> {
    match value {
        Some(raw) if !raw.trim().is_empty() => normalize_section(raw).map(Some),
        _ => Ok(None),
    }
}

pub(crate) fn normalize_intakes_activity_filter(
    value: Option<&str>,
) -> Result<Option<bool>, (StatusCode, Json<ErrorResponse>)> {
    match value.map(|v| v.trim().to_ascii_lowercase()) {
        None => Ok(None),
        Some(v) if v.is_empty() || v == "active" => Ok(Some(false)),
        Some(v) if v == "inactive" => Ok(Some(true)),
        Some(v) if v == "all" => Ok(None),
        Some(_) => Err(validation_error(
            "invalid_activity",
            "activity must be one of: active, inactive, all",
        )),
    }
}

pub(crate) async fn list_product_stats_service(
    state: &AppState,
) -> Result<Json<Vec<ProductStockStatDto>>, (StatusCode, Json<ErrorResponse>)> {
    let rows = query_repo::fetch_product_stats_rows(&state.db)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "list_product_stats_failed",
                message: "failed to list product stats".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;
    Ok(Json(rows))
}

pub(crate) async fn delete_intake_service(
    state: &AppState,
    intake_id: Uuid,
    query: DeleteIntakeQuery,
    hard_delete_allowed: bool,
    actor_login: &str,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let mode = normalize_delete_mode(query.mode.as_deref())?;
    let soft_delete = mode == DeleteMode::Soft;

    if mode == DeleteMode::Hard && !hard_delete_allowed {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                code: "admin_required",
                message: "admin role is required for hard delete".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    }

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

    let deleted = if soft_delete {
        query_repo::soft_delete_intake_by_id(&mut tx, intake_id)
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
        })?
    } else {
        query_repo::hard_delete_intake_by_id(&mut tx, intake_id)
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
        })?
    };

    let Some(intake) = deleted else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                code: "not_found",
                message: "intake not found".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    };

    release_pool_slot_if_unused(&mut tx, &intake.section, intake.slot_number).await?;

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

    if mode == DeleteMode::Hard {
        if let Some(photo_url) = intake.photo_url.as_deref() {
            if let Err(error) = delete_uploaded_photo_by_url(photo_url).await {
                eprintln!("warn: failed to delete intake photo from storage: {error}");
                let request_id = crate::new_request_id();
                let _ = enqueue_photo_cleanup_retry(state, photo_url, &error, &request_id).await;
            }
        }
    }

    if soft_delete {
        let _ = state.intake_events.send(IntakeEventMessage {
            kind: "intake_updated".to_string(),
            intake: Some(intake.clone()),
            intake_id: None,
        });
    } else {
        let _ = state.intake_events.send(IntakeEventMessage {
            kind: "intake_deleted".to_string(),
            intake: None,
            intake_id: Some(intake.id),
        });
    }
    let request_id = crate::new_request_id();
    let mode = if soft_delete { "soft" } else { "hard" };
    let context = format!(
        "{{\"event\":\"intake_delete_by_id\",\"request_id\":\"{request_id}\",\"actor_login\":\"{}\",\"intake_id\":\"{}\",\"mode\":\"{mode}\",\"section\":\"{}\",\"slot_number\":{},\"warehouse_location\":\"{}\"}}",
        actor_login,
        intake.id,
        intake.section,
        intake.slot_number,
        intake.warehouse_location
    );
    append_service_log(
        state,
        "backend",
        "info",
        "intake delete completed",
        Some(context),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn update_intake_photo_service(
    state: &AppState,
    intake_id: Uuid,
    payload: UpdateIntakePhotoRequest,
) -> Result<Json<IntakeDto>, (StatusCode, Json<ErrorResponse>)> {
    let photo_url = normalize_optional_photo_url(payload.photo_url.as_deref())?;

    let mut tx = state.db.begin().await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "update_intake_photo_failed",
                message: "failed to update intake photo".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    let updated = query_repo::update_intake_photo_by_id(&mut tx, intake_id, photo_url.as_deref())
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "update_intake_photo_failed",
                    message: "failed to update intake photo".to_string(),
                    details: None,
                    request_id: crate::new_request_id(),
                }),
            )
        })?;

    let Some(mut updated) = updated else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                code: "not_found",
                message: "intake not found".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    };
    crate::hydrate_intake_activity(&mut updated);

    tx.commit().await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "update_intake_photo_failed",
                message: "failed to update intake photo".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )
    })?;

    let _ = state.intake_events.send(IntakeEventMessage {
        kind: "intake_updated".to_string(),
        intake: Some(updated.clone()),
        intake_id: Some(updated.id),
    });

    Ok(Json(updated))
}


#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum DeleteMode {
    Soft,
    Hard,
}

fn normalize_delete_mode(
    value: Option<&str>,
) -> Result<DeleteMode, (StatusCode, Json<ErrorResponse>)> {
    match value.map(|raw| raw.trim().to_ascii_lowercase()) {
        None => Ok(DeleteMode::Soft),
        Some(v) if v.is_empty() || v == "soft" => Ok(DeleteMode::Soft),
        Some(v) if v == "hard" => Ok(DeleteMode::Hard),
        Some(_) => Err(validation_error(
            "invalid_delete_mode",
            "mode must be one of: soft, hard",
        )),
    }
}

fn normalize_optional_photo_url(
    value: Option<&str>,
) -> Result<Option<String>, (StatusCode, Json<ErrorResponse>)> {
    let Some(raw) = value else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > 4000 {
        return Err(validation_error(
            "invalid_photo_url",
            "photo_url must be 1..4000 chars",
        ));
    }
    Ok(Some(trimmed.to_string()))
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
    use super::{normalize_delete_mode, normalize_optional_photo_url, DeleteMode};

    #[test]
    fn normalize_delete_mode_defaults_to_soft() {
        let result = normalize_delete_mode(None).expect("must normalize");
        assert_eq!(result, DeleteMode::Soft);
    }

    #[test]
    fn normalize_delete_mode_accepts_hard_case_insensitive() {
        let result = normalize_delete_mode(Some("HaRd")).expect("must normalize");
        assert_eq!(result, DeleteMode::Hard);
    }

    #[test]
    fn normalize_delete_mode_rejects_unknown() {
        let result = normalize_delete_mode(Some("force"));
        assert!(result.is_err());
    }

    #[test]
    fn normalize_optional_photo_url_accepts_trimmed_http_url() {
        let result = normalize_optional_photo_url(Some("  https://a/b.jpg  "))
            .expect("must normalize");
        assert_eq!(result.as_deref(), Some("https://a/b.jpg"));
    }

    #[test]
    fn normalize_optional_photo_url_maps_empty_to_none() {
        let result = normalize_optional_photo_url(Some("   ")).expect("must normalize");
        assert!(result.is_none());
    }

}
