use std::{env, time::Duration};

use serde::Serialize;

use crate::{append_service_log, AppState, IntakeDto};

const DATABASE_KID_SYNC_TIMEOUT_SECONDS: u64 = 8;

#[derive(Clone, Debug)]
pub(crate) struct DatabaseKidSyncConfig {
    pub(crate) base_url: String,
    pub(crate) service_token: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub(crate) struct DatabaseKidSyncPayload {
    pub(crate) kid_number: String,
    pub(crate) place: String,
    pub(crate) skip_order_sync: bool,
    pub(crate) quantity: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) room: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub(crate) furniture_type: Option<String>,
    pub(crate) b_ware: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) commentary: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) photo: Vec<String>,
}

pub(crate) fn build_database_kid_sync_config() -> Option<DatabaseKidSyncConfig> {
    let base_url = env::var("DATABASE_SERVICE_BASE_URL")
        .ok()
        .or_else(|| env::var("SERVICES_API_BASE_URL").ok())
        .map(|value| normalize_database_service_base_url(&value))
        .filter(|value| !value.is_empty())?;
    let service_token = env::var("ORCHESTRATOR_SERVICE_AUTH_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())?;
    Some(DatabaseKidSyncConfig {
        base_url,
        service_token,
    })
}

pub(crate) fn spawn_database_kid_sync(state: &AppState, intake: IntakeDto) {
    let Some(config) = state.database_kid_sync.clone() else {
        return;
    };
    let client = state.http_client.clone();
    let logs_state = state.clone();
    tokio::spawn(async move {
        if let Err(error) = sync_database_kid(&client, &config, &intake).await {
            append_service_log(
                &logs_state,
                "backend",
                "warn",
                format!(
                    "database_kid sync failed for intake {}: {error}",
                    intake.id
                ),
                None,
            )
            .await;
        }
    });
}

async fn sync_database_kid(
    client: &reqwest::Client,
    config: &DatabaseKidSyncConfig,
    intake: &IntakeDto,
) -> Result<(), String> {
    let payload = build_database_kid_sync_payload(intake)
        .ok_or_else(|| "intake does not contain a usable kid identity".to_string())?;
    let url = format!("{}/api/v1/kids/", config.base_url);
    let response = client
        .post(url)
        .header("x-warehub-service-token", &config.service_token)
        .json(&payload)
        .timeout(Duration::from_secs(DATABASE_KID_SYNC_TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(format!("database-service returned HTTP {status}: {body}"))
}

pub(crate) fn build_database_kid_sync_payload(
    intake: &IntakeDto,
) -> Option<DatabaseKidSyncPayload> {
    let kid_number = database_kid_number(intake)?;
    Some(DatabaseKidSyncPayload {
        kid_number,
        place: intake.warehouse_location.trim().to_string(),
        skip_order_sync: true,
        quantity: intake.box_total,
        color: normalized_optional_text(intake.product_color.as_deref()),
        room: normalized_optional_text(intake.category_main.as_deref()),
        furniture_type: normalized_optional_text(intake.category_sub.as_deref()),
        b_ware: intake.is_b_ware,
        commentary: normalized_optional_text(intake.b_ware_comment.as_deref()),
        photo: normalized_photo_urls(intake.photo_url.as_deref()),
    })
}

fn database_kid_number(intake: &IntakeDto) -> Option<String> {
    let kid_number = intake.kid_number.trim();
    if !kid_number.is_empty() && !kid_number.eq_ignore_ascii_case("NO-KID") {
        return Some(kid_number.to_string());
    }
    normalized_optional_text(Some(intake.qr_code.as_str()))
}

fn normalized_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalized_photo_urls(value: Option<&str>) -> Vec<String> {
    normalized_optional_text(value).into_iter().collect()
}

fn normalize_database_service_base_url(value: &str) -> String {
    let trimmed = value.trim().trim_end_matches('/');
    trimmed
        .strip_suffix("/api/v1")
        .unwrap_or(trimmed)
        .trim_end_matches('/')
        .to_string()
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use uuid::Uuid;

    use super::*;

    fn intake_with_identity(kid_number: &str, qr_code: &str) -> IntakeDto {
        IntakeDto {
            id: Uuid::nil(),
            qr_code: qr_code.to_string(),
            warehouse_location: "E67".to_string(),
            kid_number: kid_number.to_string(),
            photo_url: Some(" https://cdn.example.com/item.jpg ".to_string()),
            product_key: None,
            section: "E".to_string(),
            slot_number: 67,
            box_index: 1,
            box_total: 7,
            unit_index: 1,
            internal_index: Some("1-123-ORDER".to_string()),
            order_id: None,
            product_title: None,
            product_sku: None,
            product_ean: None,
            product_price: None,
            product_size: None,
            product_color: Some("Blue".to_string()),
            category_main: Some("Living room".to_string()),
            category_sub: Some("Sofa".to_string()),
            is_b_ware: true,
            b_ware_comment: Some("Packaging damage".to_string()),
            product_sale_date: None,
            order_memo: None,
            created_at: Utc::now(),
            is_removed: false,
            removed_at: None,
            is_active: true,
        }
    }

    #[test]
    fn payload_uses_kid_number_when_present() {
        let intake = intake_with_identity(" KID-123 ", "EMPTY-1");

        let payload = build_database_kid_sync_payload(&intake).expect("payload");

        assert_eq!(payload.kid_number, "KID-123");
        assert_eq!(payload.place, "E67");
        assert!(payload.skip_order_sync);
        assert_eq!(payload.quantity, 7);
        assert_eq!(payload.color.as_deref(), Some("Blue"));
        assert_eq!(payload.room.as_deref(), Some("Living room"));
        assert_eq!(payload.furniture_type.as_deref(), Some("Sofa"));
        assert!(payload.b_ware);
        assert_eq!(payload.commentary.as_deref(), Some("Packaging damage"));
        assert_eq!(
            payload.photo,
            vec!["https://cdn.example.com/item.jpg".to_string()]
        );
    }

    #[test]
    fn payload_uses_qr_code_for_no_kid_empty_items() {
        let intake = intake_with_identity("NO-KID", "EMPTY-1782891067928");

        let payload = build_database_kid_sync_payload(&intake).expect("payload");

        assert_eq!(payload.kid_number, "EMPTY-1782891067928");
    }

    #[test]
    fn normalize_base_url_accepts_api_v1_suffix() {
        let value = normalize_database_service_base_url(" http://localhost:8934/api/v1/ ");

        assert_eq!(value, "http://localhost:8934");
    }
}
