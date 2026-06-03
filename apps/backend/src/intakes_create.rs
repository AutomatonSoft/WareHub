use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};

use crate::{
    auth::require_approved_user, create_intake_service, AppState, CreateIntakeRequest,
    ErrorResponse, IntakeDto,
};

pub(crate) async fn create_intake(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateIntakeRequest>,
) -> Result<(StatusCode, Json<IntakeDto>), (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    create_intake_service(&state, payload).await
}
