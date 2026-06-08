use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use uuid::Uuid;

use crate::intakes_photo_cleanup_service::{
    cleanup_removed_intake_photos_service, photo_cleanup_retry_queue_status_service,
    CleanupInitiator,
};
use crate::intakes_delete_by_location_service::delete_oldest_intake_by_location_service;
use crate::intakes_query_service::{
    delete_intake_service, list_intakes_service, list_product_stats_service,
    update_intake_photo_service,
};
use crate::{
    auth::{require_admin_user, require_approved_user},
    AppState, CleanupIntakePhotosQuery, CleanupIntakePhotosResponse,
    CleanupRetryQueueStatusResponse, DeleteIntakeByLocationQuery, DeleteIntakeByLocationResponse,
    DeleteIntakeQuery, ErrorResponse, IntakeDto, ListIntakesQuery, ProductStockStatDto,
    UpdateIntakePhotoRequest,
};

pub(crate) async fn list_intakes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListIntakesQuery>,
) -> Result<Json<Vec<IntakeDto>>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    list_intakes_service(&state, query).await
}

pub(crate) async fn list_product_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<ProductStockStatDto>>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    list_product_stats_service(&state).await
}

pub(crate) async fn delete_intake(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(intake_id): Path<Uuid>,
    Query(query): Query<DeleteIntakeQuery>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let user = require_approved_user(&state, &headers).await?;
    let hard_delete_allowed = true;
    delete_intake_service(&state, intake_id, query, hard_delete_allowed, &user.login).await
}

pub(crate) async fn delete_oldest_intake_by_location(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DeleteIntakeByLocationQuery>,
) -> Result<Json<DeleteIntakeByLocationResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_approved_user(&state, &headers).await?;
    delete_oldest_intake_by_location_service(&state, query, &user.login).await
}

pub(crate) async fn update_intake_photo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(intake_id): Path<Uuid>,
    Json(payload): Json<UpdateIntakePhotoRequest>,
) -> Result<Json<IntakeDto>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    update_intake_photo_service(&state, intake_id, payload).await
}

pub(crate) async fn cleanup_removed_intake_photos(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CleanupIntakePhotosQuery>,
) -> Result<Json<CleanupIntakePhotosResponse>, (StatusCode, Json<ErrorResponse>)> {
    let admin = require_admin_user(&state, &headers).await?;
    cleanup_removed_intake_photos_service(
        &state,
        query,
        CleanupInitiator::Manual {
            admin_login: admin.login,
        },
    )
    .await
}

pub(crate) async fn get_photo_cleanup_retry_queue_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<CleanupRetryQueueStatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    let _admin = require_admin_user(&state, &headers).await?;
    photo_cleanup_retry_queue_status_service(&state).await
}
