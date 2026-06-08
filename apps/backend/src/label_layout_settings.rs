use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};

use crate::auth::require_approved_user;
use crate::label_layout_settings_repository as repo;
use crate::{
    validation_error, AppState, ErrorResponse, LabelLayoutSettingsDto,
    UpdateLabelLayoutSettingsRequest,
};

pub(crate) async fn get_label_layout_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LabelLayoutSettingsDto>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let row = repo::fetch_label_layout_settings(&state.db)
        .await
        .map_err(|_| internal_error("failed to fetch label layout settings"))?;
    Ok(Json(match row {
        Some(value) => map_row(value),
        None => default_dto(),
    }))
}

pub(crate) async fn update_label_layout_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateLabelLayoutSettingsRequest>,
) -> Result<Json<LabelLayoutSettingsDto>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let dto = validate_payload(payload)?;
    let saved = repo::upsert_label_layout_settings(
        &state.db,
        &repo::LabelLayoutSettingsRow {
            qr_scale: dto.qr_scale,
            qr_offset_x: dto.qr_offset_x,
            qr_offset_y: dto.qr_offset_y,
            main_scale: dto.main_scale,
            main_offset_x: dto.main_offset_x,
            main_offset_y: dto.main_offset_y,
            parts_scale: dto.parts_scale,
            parts_offset_x: dto.parts_offset_x,
            parts_offset_y: dto.parts_offset_y,
        },
    )
    .await
    .map_err(|_| internal_error("failed to save label layout settings"))?;
    Ok(Json(map_row(saved)))
}

fn map_row(row: repo::LabelLayoutSettingsRow) -> LabelLayoutSettingsDto {
    LabelLayoutSettingsDto {
        qr_scale: row.qr_scale,
        qr_offset_x: row.qr_offset_x,
        qr_offset_y: row.qr_offset_y,
        main_scale: row.main_scale,
        main_offset_x: row.main_offset_x,
        main_offset_y: row.main_offset_y,
        parts_scale: row.parts_scale,
        parts_offset_x: row.parts_offset_x,
        parts_offset_y: row.parts_offset_y,
    }
}

fn validate_payload(
    payload: UpdateLabelLayoutSettingsRequest,
) -> Result<LabelLayoutSettingsDto, (StatusCode, Json<ErrorResponse>)> {
    let qr_scale = validate_range(payload.qr_scale, 0.50, 0.95, "qr_scale")?;
    let qr_offset_x = validate_range(payload.qr_offset_x, -173.0, 173.0, "qr_offset_x")?;
    let qr_offset_y = validate_range(payload.qr_offset_y, -288.0, 288.0, "qr_offset_y")?;
    let main_scale = validate_range(payload.main_scale, 0.70, 1.80, "main_scale")?;
    let main_offset_x = validate_range(payload.main_offset_x, -173.0, 173.0, "main_offset_x")?;
    let main_offset_y = validate_range(payload.main_offset_y, -288.0, 288.0, "main_offset_y")?;
    let parts_scale = validate_range(payload.parts_scale, 0.70, 1.80, "parts_scale")?;
    let parts_offset_x = validate_range(payload.parts_offset_x, -173.0, 173.0, "parts_offset_x")?;
    let parts_offset_y = validate_range(payload.parts_offset_y, -288.0, 288.0, "parts_offset_y")?;

    Ok(LabelLayoutSettingsDto {
        qr_scale,
        qr_offset_x,
        qr_offset_y,
        main_scale,
        main_offset_x,
        main_offset_y,
        parts_scale,
        parts_offset_x,
        parts_offset_y,
    })
}

fn validate_range(
    value: f64,
    min: f64,
    max: f64,
    field: &'static str,
) -> Result<f64, (StatusCode, Json<ErrorResponse>)> {
    if !value.is_finite() || value < min || value > max {
        return Err(validation_error(
            "invalid_label_layout",
            &format!("{field} must be in range {min}..{max}"),
        ));
    }
    Ok(value)
}

fn default_dto() -> LabelLayoutSettingsDto {
    LabelLayoutSettingsDto {
        qr_scale: 0.78,
        qr_offset_x: 0.0,
        qr_offset_y: 0.0,
        main_scale: 1.0,
        main_offset_x: 0.0,
        main_offset_y: 0.0,
        parts_scale: 1.0,
        parts_offset_x: 0.0,
        parts_offset_y: 0.0,
    }
}

fn internal_error(message: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            code: "label_layout_settings_failed",
            message: message.to_string(),
            details: None,
            request_id: crate::new_request_id(),
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::{validate_payload, UpdateLabelLayoutSettingsRequest};

    #[test]
    fn validate_payload_accepts_valid_values() {
        let payload = UpdateLabelLayoutSettingsRequest {
            qr_scale: 0.78,
            qr_offset_x: 0.0,
            qr_offset_y: 0.0,
            main_scale: 1.0,
            main_offset_x: 0.0,
            main_offset_y: 0.0,
            parts_scale: 1.0,
            parts_offset_x: 0.0,
            parts_offset_y: 0.0,
        };
        let result = validate_payload(payload).expect("must validate");
        assert_eq!(result.qr_scale, 0.78);
    }

    #[test]
    fn validate_payload_rejects_invalid_qr_scale() {
        let payload = UpdateLabelLayoutSettingsRequest {
            qr_scale: 2.0,
            qr_offset_x: 0.0,
            qr_offset_y: 0.0,
            main_scale: 1.0,
            main_offset_x: 0.0,
            main_offset_y: 0.0,
            parts_scale: 1.0,
            parts_offset_x: 0.0,
            parts_offset_y: 0.0,
        };
        let result = validate_payload(payload);
        assert!(result.is_err());
    }
}
