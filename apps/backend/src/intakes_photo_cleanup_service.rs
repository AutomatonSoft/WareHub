use axum::{
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::intakes_query_repository as query_repo;
use crate::{
    append_service_log, delete_uploaded_photo_by_url, validation_error, AppState,
    CleanupIntakePhotosQuery, CleanupIntakePhotosResponse, CleanupRetryQueueStatusResponse,
    ErrorResponse,
};

#[derive(Clone, Debug)]
pub(crate) enum CleanupInitiator {
    Manual { admin_login: String },
    Auto,
}

struct CleanupLogEntry<'a> {
    level: &'a str,
    request_id: &'a str,
    initiator: &'a CleanupInitiator,
    event: &'a str,
    dry_run: bool,
    limit: i64,
    result: Option<&'a CleanupIntakePhotosResponse>,
}

pub(crate) async fn cleanup_removed_intake_photos_service(
    state: &AppState,
    query: CleanupIntakePhotosQuery,
    initiator: CleanupInitiator,
) -> Result<Json<CleanupIntakePhotosResponse>, (StatusCode, Json<ErrorResponse>)> {
    let limit = normalize_cleanup_limit(query.limit)?;
    let dry_run = query.dry_run.unwrap_or(false);
    let request_id = crate::new_request_id();
    append_cleanup_log(
        state,
        CleanupLogEntry {
            level: "info",
            request_id: &request_id,
            initiator: &initiator,
            event: "cleanup started",
            dry_run,
            limit,
            result: None,
        },
    )
    .await;
    let rows = query_repo::fetch_removed_intake_photos(&state.db, limit)
        .await
        .map_err(|_| cleanup_error("failed to list removed intake photos"))?;
    let response = run_cleanup_rows(state, rows, dry_run, request_id)
        .await
        .map_err(|_| cleanup_error("failed to clear intake photo urls"))?;
    append_cleanup_log(
        state,
        CleanupLogEntry {
            level: if response.failed_files > 0 {
                "warn"
            } else {
                "info"
            },
            request_id: &response.request_id,
            initiator: &initiator,
            event: "cleanup completed",
            dry_run: response.dry_run,
            limit,
            result: Some(&response),
        },
    )
    .await;
    Ok(Json(response))
}

pub(crate) async fn run_auto_orphan_photo_cleanup(
    state: &AppState,
    retention_days: i64,
    limit: i64,
) -> Result<CleanupIntakePhotosResponse, String> {
    let safe_days = retention_days.clamp(1, 3650);
    let safe_limit = limit.clamp(1, 5000);
    let request_id = crate::new_request_id();
    append_cleanup_log(
        state,
        CleanupLogEntry {
            level: "info",
            request_id: &request_id,
            initiator: &CleanupInitiator::Auto,
            event: "auto cleanup started",
            dry_run: false,
            limit: safe_limit,
            result: None,
        },
    )
    .await;
    let rows = query_repo::fetch_orphan_removed_intake_photos_older_than(&state.db, safe_days, safe_limit)
        .await
        .map_err(|error| format!("failed to list orphan removed intake photos: {error}"))?;
    let response = run_cleanup_rows(state, rows, false, request_id)
        .await
        .map_err(|error| format!("failed to clear intake photo urls: {error}"))?;
    let retry_processed = process_due_cleanup_retries(state, safe_limit)
        .await
        .map_err(|error| format!("failed to process photo cleanup retry queue: {error}"))?;
    append_cleanup_log(
        state,
        CleanupLogEntry {
            level: if response.failed_files > 0 || retry_processed.failed_files > 0 {
                "warn"
            } else {
                "info"
            },
            request_id: &response.request_id,
            initiator: &CleanupInitiator::Auto,
            event: "auto cleanup completed",
            dry_run: false,
            limit: safe_limit,
            result: Some(&response),
        },
    )
    .await;
    Ok(response)
}

async fn run_cleanup_rows(
    state: &AppState,
    rows: Vec<query_repo::RemovedIntakePhotoRow>,
    dry_run: bool,
    request_id: String,
) -> Result<CleanupIntakePhotosResponse, sqlx::Error> {
    let mut deleted_files: i64 = 0;
    let mut failed_files: i64 = 0;
    let mut cleared_candidate_ids: Vec<Uuid> = Vec::new();

    for row in &rows {
        if dry_run {
            continue;
        }
        match delete_uploaded_photo_by_url(&row.photo_url).await {
            Ok(_) => {
                deleted_files += 1;
                cleared_candidate_ids.push(row.id);
            }
            Err(error) => {
                failed_files += 1;
                let _ = query_repo::enqueue_photo_cleanup_retry(
                    &state.db,
                    &row.photo_url,
                    &error,
                    &request_id,
                )
                .await;
                eprintln!(
                    "warn: failed to cleanup removed intake photo id={} url={} error={}",
                    row.id, row.photo_url, error
                );
            }
        }
    }

    let cleared_rows = if dry_run {
        0
    } else {
        query_repo::clear_intake_photo_urls_by_ids(&state.db, &cleared_candidate_ids).await?
    };

    Ok(CleanupIntakePhotosResponse {
        request_id,
        scanned: rows.len() as i64,
        deleted_files,
        failed_files,
        cleared_rows,
        dry_run,
    })
}

pub(crate) async fn enqueue_photo_cleanup_retry(
    state: &AppState,
    photo_url: &str,
    error: &str,
    request_id: &str,
) -> Result<(), String> {
    query_repo::enqueue_photo_cleanup_retry(&state.db, photo_url, error, request_id)
        .await
        .map_err(|e| format!("failed to enqueue photo cleanup retry: {e}"))
}

pub(crate) async fn photo_cleanup_retry_queue_status_service(
    state: &AppState,
) -> Result<Json<CleanupRetryQueueStatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    let row = query_repo::fetch_photo_cleanup_retry_queue_stats(&state.db)
        .await
        .map_err(|_| cleanup_error("failed to fetch photo cleanup retry queue stats"))?;
    Ok(Json(CleanupRetryQueueStatusResponse {
        request_id: crate::new_request_id(),
        pending_count: row.pending_count,
        due_count: row.due_count,
        max_attempts: row.max_attempts,
        oldest_created_at: row.oldest_created_at,
        next_attempt_at: row.next_attempt_at,
    }))
}

async fn process_due_cleanup_retries(
    state: &AppState,
    limit: i64,
) -> Result<CleanupIntakePhotosResponse, String> {
    let safe_limit = limit.clamp(1, 2000);
    let request_id = crate::new_request_id();
    let rows = query_repo::fetch_due_photo_cleanup_retries(&state.db, safe_limit)
        .await
        .map_err(|e| format!("failed to fetch due photo cleanup retries: {e}"))?;
    let mut deleted_files: i64 = 0;
    let mut failed_files: i64 = 0;
    for row in &rows {
        match delete_uploaded_photo_by_url(&row.photo_url).await {
            Ok(_) => {
                deleted_files += 1;
                let _ = query_repo::delete_photo_cleanup_retry(&state.db, &row.photo_url).await;
            }
            Err(error) => {
                failed_files += 1;
                let _ = query_repo::reschedule_photo_cleanup_retry(
                    &state.db,
                    &row.photo_url,
                    &error,
                    &request_id,
                )
                .await;
                eprintln!(
                    "warn: failed to process cleanup retry url={} attempts={} error={}",
                    row.photo_url, row.attempts, error
                );
            }
        }
    }
    append_service_log(
        state,
        "backend",
        if failed_files > 0 { "warn" } else { "info" },
        "intake photo cleanup retry queue processed",
        Some(format!(
            "request_id={} scanned={} deleted_files={} failed_files={}",
            request_id,
            rows.len(),
            deleted_files,
            failed_files
        )),
    )
    .await;
    Ok(CleanupIntakePhotosResponse {
        request_id,
        scanned: rows.len() as i64,
        deleted_files,
        failed_files,
        cleared_rows: 0,
        dry_run: false,
    })
}

fn cleanup_error(message: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            code: "cleanup_intake_photos_failed",
            message: message.to_string(),
            details: None,
            request_id: crate::new_request_id(),
        }),
    )
}

fn normalize_cleanup_limit(value: Option<i64>) -> Result<i64, (StatusCode, Json<ErrorResponse>)> {
    let limit = value.unwrap_or(200);
    if !(1..=2000).contains(&limit) {
        return Err(validation_error(
            "invalid_limit",
            "limit must be in range 1..2000",
        ));
    }
    Ok(limit)
}

async fn append_cleanup_log(state: &AppState, entry: CleanupLogEntry<'_>) {
    let source = match entry.initiator {
        CleanupInitiator::Manual { .. } => "manual",
        CleanupInitiator::Auto => "auto",
    };
    let actor = match entry.initiator {
        CleanupInitiator::Manual { admin_login } => admin_login.as_str(),
        CleanupInitiator::Auto => "system",
    };
    let message = format!(
        "intake photo cleanup {event}: source={source} actor={actor} dry_run={dry_run} limit={limit}"
        ,
        event = entry.event,
        dry_run = entry.dry_run,
        limit = entry.limit
    );
    let context = match entry.result {
        Some(value) => Some(format!(
            "request_id={} scanned={} deleted_files={} failed_files={} cleared_rows={}",
            entry.request_id,
            value.scanned,
            value.deleted_files,
            value.failed_files,
            value.cleared_rows
        )),
        None => Some(format!("request_id={}", entry.request_id)),
    };
    append_service_log(state, "backend", entry.level, message, context).await;
}

#[cfg(test)]
mod tests {
    use super::normalize_cleanup_limit;

    #[test]
    fn normalize_cleanup_limit_defaults_to_200() {
        let result = normalize_cleanup_limit(None).expect("must normalize");
        assert_eq!(result, 200);
    }

    #[test]
    fn normalize_cleanup_limit_rejects_too_large() {
        let result = normalize_cleanup_limit(Some(5000));
        assert!(result.is_err());
    }
}
