use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

use crate::{database_kid_sync::DatabaseKidSyncConfig, service_logs::InMemoryLogs};

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) app_env: String,
    pub(crate) db: PgPool,
    pub(crate) intake_events: broadcast::Sender<IntakeEventMessage>,
    pub(crate) logs: Arc<RwLock<InMemoryLogs>>,
    pub(crate) http_client: reqwest::Client,
    pub(crate) database_kid_sync: Option<DatabaseKidSyncConfig>,
}

#[derive(Serialize)]
pub(crate) struct HealthResponse {
    pub(crate) status: &'static str,
    pub(crate) service: &'static str,
    pub(crate) environment: String,
}

#[derive(Serialize)]
pub(crate) struct ApiInfoResponse {
    pub(crate) name: &'static str,
    pub(crate) version: &'static str,
    pub(crate) base_path: &'static str,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateIntakeRequest {
    pub(crate) qr_code: String,
    pub(crate) warehouse_location: Option<String>,
    pub(crate) placement_section: Option<String>,
    pub(crate) kid_number: String,
    pub(crate) photo_url: Option<String>,
    pub(crate) product_key: Option<String>,
    pub(crate) product_color: Option<String>,
    pub(crate) store: Option<bool>,
    pub(crate) in_transit: Option<bool>,
    pub(crate) category_main: Option<String>,
    pub(crate) category_sub: Option<String>,
    pub(crate) is_b_ware: Option<bool>,
    pub(crate) b_ware_comment: Option<String>,
    pub(crate) box_total: Option<i32>,
    pub(crate) placement_strategy: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ListIntakesQuery {
    pub(crate) limit: Option<i64>,
    pub(crate) offset: Option<i64>,
    pub(crate) search: Option<String>,
    pub(crate) section: Option<String>,
    pub(crate) activity: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub(crate) struct ProductStockStatDto {
    pub(crate) product_ref: String,
    pub(crate) product_title: Option<String>,
    pub(crate) active_units: i64,
    pub(crate) first_created_at: DateTime<Utc>,
    pub(crate) last_created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct DeleteIntakeQuery {
    pub(crate) mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct DeleteIntakeByLocationQuery {
    pub(crate) section: String,
    pub(crate) slot_number: i32,
}

#[derive(Debug, Serialize)]
pub(crate) struct DeleteIntakeByLocationResponse {
    pub(crate) removed_count: i64,
    pub(crate) section: String,
    pub(crate) slot_number: i32,
    pub(crate) warehouse_location: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateIntakePhotoRequest {
    pub(crate) photo_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CleanupIntakePhotosQuery {
    pub(crate) dry_run: Option<bool>,
    pub(crate) limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateLabelLayoutSettingsRequest {
    pub(crate) qr_scale: f64,
    pub(crate) qr_offset_x: f64,
    pub(crate) qr_offset_y: f64,
    pub(crate) main_scale: f64,
    pub(crate) main_offset_x: f64,
    pub(crate) main_offset_y: f64,
    pub(crate) parts_scale: f64,
    pub(crate) parts_offset_x: f64,
    pub(crate) parts_offset_y: f64,
}

#[derive(Debug, Serialize)]
pub(crate) struct LabelLayoutSettingsDto {
    pub(crate) qr_scale: f64,
    pub(crate) qr_offset_x: f64,
    pub(crate) qr_offset_y: f64,
    pub(crate) main_scale: f64,
    pub(crate) main_offset_x: f64,
    pub(crate) main_offset_y: f64,
    pub(crate) parts_scale: f64,
    pub(crate) parts_offset_x: f64,
    pub(crate) parts_offset_y: f64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdatePrinterSetupSettingsRequest {
    pub(crate) print_width_px: i32,
    pub(crate) print_height_px: i32,
    pub(crate) print_density: i32,
    pub(crate) print_label_type: i32,
    pub(crate) print_inter_label_delay_ms: i32,
    pub(crate) print_preview_only: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct PrinterSetupSettingsDto {
    pub(crate) print_width_px: i32,
    pub(crate) print_height_px: i32,
    pub(crate) print_density: i32,
    pub(crate) print_label_type: i32,
    pub(crate) print_inter_label_delay_ms: i32,
    pub(crate) print_preview_only: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct CleanupIntakePhotosResponse {
    pub(crate) request_id: String,
    pub(crate) scanned: i64,
    pub(crate) deleted_files: i64,
    pub(crate) failed_files: i64,
    pub(crate) cleared_rows: i64,
    pub(crate) dry_run: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct CleanupRetryQueueStatusResponse {
    pub(crate) request_id: String,
    pub(crate) pending_count: i64,
    pub(crate) due_count: i64,
    pub(crate) max_attempts: i32,
    pub(crate) oldest_created_at: Option<DateTime<Utc>>,
    pub(crate) next_attempt_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub(crate) struct IntakeDto {
    pub(crate) id: Uuid,
    pub(crate) qr_code: String,
    pub(crate) warehouse_location: String,
    pub(crate) kid_number: String,
    pub(crate) photo_url: Option<String>,
    pub(crate) product_key: Option<String>,
    pub(crate) section: String,
    pub(crate) slot_number: i32,
    pub(crate) box_index: i32,
    pub(crate) box_total: i32,
    pub(crate) unit_index: i32,
    pub(crate) internal_index: Option<String>,
    pub(crate) order_id: Option<String>,
    pub(crate) product_title: Option<String>,
    pub(crate) product_sku: Option<String>,
    pub(crate) product_ean: Option<String>,
    pub(crate) product_price: Option<String>,
    pub(crate) product_size: Option<String>,
    pub(crate) product_color: Option<String>,
    pub(crate) category_main: Option<String>,
    pub(crate) category_sub: Option<String>,
    pub(crate) is_b_ware: bool,
    pub(crate) b_ware_comment: Option<String>,
    pub(crate) product_sale_date: Option<String>,
    pub(crate) order_memo: Option<String>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) is_removed: bool,
    pub(crate) removed_at: Option<DateTime<Utc>>,
    #[sqlx(default)]
    pub(crate) is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct IntakeEventMessage {
    pub(crate) kind: String,
    pub(crate) intake: Option<IntakeDto>,
    pub(crate) intake_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub(crate) struct ErrorResponse {
    pub(crate) code: &'static str,
    pub(crate) message: String,
    pub(crate) request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) details: Option<HashMap<String, Vec<String>>>,
}

#[derive(Debug, Serialize)]
pub(crate) struct UploadResponse {
    pub(crate) url: String,
}
