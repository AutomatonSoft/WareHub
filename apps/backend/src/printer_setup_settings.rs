use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};

use crate::auth::require_approved_user;
use crate::printer_setup_settings_repository as repo;
use crate::{
    validation_error, AppState, ErrorResponse, PrinterSetupSettingsDto,
    UpdatePrinterSetupSettingsRequest,
};

pub(crate) async fn get_printer_setup_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<PrinterSetupSettingsDto>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let row = repo::fetch_printer_setup_settings(&state.db)
        .await
        .map_err(|_| internal_error("failed to fetch printer setup settings"))?;
    Ok(Json(match row {
        Some(value) => map_row(value),
        None => default_dto(),
    }))
}

pub(crate) async fn update_printer_setup_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdatePrinterSetupSettingsRequest>,
) -> Result<Json<PrinterSetupSettingsDto>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let dto = validate_payload(payload)?;
    let saved = repo::upsert_printer_setup_settings(
        &state.db,
        &repo::PrinterSetupSettingsRow {
            print_width_px: dto.print_width_px,
            print_height_px: dto.print_height_px,
            print_density: dto.print_density,
            print_label_type: dto.print_label_type,
            print_inter_label_delay_ms: dto.print_inter_label_delay_ms,
            print_preview_only: dto.print_preview_only,
        },
    )
    .await
    .map_err(|_| internal_error("failed to save printer setup settings"))?;
    Ok(Json(map_row(saved)))
}

fn map_row(row: repo::PrinterSetupSettingsRow) -> PrinterSetupSettingsDto {
    let sanitized = sanitize_settings(
        row.print_width_px,
        row.print_height_px,
        row.print_density,
        row.print_label_type,
        row.print_inter_label_delay_ms,
        row.print_preview_only,
    );
    PrinterSetupSettingsDto {
        print_width_px: sanitized.0,
        print_height_px: sanitized.1,
        print_density: sanitized.2,
        print_label_type: sanitized.3,
        print_inter_label_delay_ms: sanitized.4,
        print_preview_only: sanitized.5,
    }
}

fn validate_payload(
    payload: UpdatePrinterSetupSettingsRequest,
) -> Result<PrinterSetupSettingsDto, (StatusCode, Json<ErrorResponse>)> {
    if payload.print_width_px < 300 || payload.print_width_px > 600 {
        return Err(validation_error(
            "invalid_printer_setup",
            "print_width_px must be in range 300..600",
        ));
    }
    if payload.print_height_px < 500 || payload.print_height_px > 900 {
        return Err(validation_error(
            "invalid_printer_setup",
            "print_height_px must be in range 500..900",
        ));
    }
    if !(1..=5).contains(&payload.print_density) {
        return Err(validation_error(
            "invalid_printer_setup",
            "print_density must be in range 1..5",
        ));
    }
    if !(0..=5).contains(&payload.print_label_type) {
        return Err(validation_error(
            "invalid_printer_setup",
            "print_label_type must be in range 0..5",
        ));
    }
    if !(0..=2000).contains(&payload.print_inter_label_delay_ms) {
        return Err(validation_error(
            "invalid_printer_setup",
            "print_inter_label_delay_ms must be in range 0..2000",
        ));
    }
    Ok(PrinterSetupSettingsDto {
        print_width_px: payload.print_width_px,
        print_height_px: payload.print_height_px,
        print_density: payload.print_density,
        print_label_type: payload.print_label_type,
        print_inter_label_delay_ms: payload.print_inter_label_delay_ms,
        print_preview_only: payload.print_preview_only,
    })
}

fn sanitize_settings(
    width: i32,
    height: i32,
    density: i32,
    label_type: i32,
    delay_ms: i32,
    preview_only: bool,
) -> (i32, i32, i32, i32, i32, bool) {
    let safe_width = if (300..=600).contains(&width) {
        width
    } else {
        384
    };
    let safe_height = if (500..=900).contains(&height) {
        height
    } else {
        640
    };
    let safe_density = density.clamp(1, 5);
    let safe_label_type = label_type.clamp(0, 5);
    let safe_delay_ms = delay_ms.clamp(0, 2000);
    (
        safe_width,
        safe_height,
        safe_density,
        safe_label_type,
        safe_delay_ms,
        preview_only,
    )
}

fn default_dto() -> PrinterSetupSettingsDto {
    PrinterSetupSettingsDto {
        print_width_px: 384,
        print_height_px: 640,
        print_density: 5,
        print_label_type: 0,
        print_inter_label_delay_ms: 120,
        print_preview_only: false,
    }
}

fn internal_error(message: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            code: "printer_setup_settings_failed",
            message: message.to_string(),
            details: None,
            request_id: crate::new_request_id(),
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::{default_dto, validate_payload, UpdatePrinterSetupSettingsRequest};

    #[test]
    fn default_settings_use_rfid_label_type_auto_detection() {
        assert_eq!(default_dto().print_label_type, 0);
    }

    #[test]
    fn validate_payload_accepts_valid_values() {
        let payload = UpdatePrinterSetupSettingsRequest {
            print_width_px: 384,
            print_height_px: 640,
            print_density: 5,
            print_label_type: 1,
            print_inter_label_delay_ms: 120,
            print_preview_only: false,
        };
        let result = validate_payload(payload).expect("must validate");
        assert_eq!(result.print_width_px, 384);
    }

    #[test]
    fn validate_payload_rejects_invalid_density() {
        let payload = UpdatePrinterSetupSettingsRequest {
            print_width_px: 384,
            print_height_px: 640,
            print_density: 9,
            print_label_type: 1,
            print_inter_label_delay_ms: 120,
            print_preview_only: false,
        };
        let result = validate_payload(payload);
        assert!(result.is_err());
    }

    #[test]
    fn sanitize_settings_falls_back_to_safe_size() {
        let result = super::sanitize_settings(120, 200, 9, 9, 5000, false);
        assert_eq!(result.0, 384);
        assert_eq!(result.1, 640);
        assert_eq!(result.2, 5);
        assert_eq!(result.3, 5);
        assert_eq!(result.4, 2000);
    }
}
