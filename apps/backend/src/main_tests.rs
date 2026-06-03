use super::*;
use crate::afterbuy_html::decode_html_entities;
use axum::body::Body;
use axum::http::HeaderMap;
use axum::http::Request;
use axum::http::StatusCode;
use chrono::Utc;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;
use uuid::Uuid;

#[test]
fn normalize_location_uppercases() {
    let value = intakes_common::normalize_warehouse_location(" a-01 ").expect("must normalize");
    assert_eq!(value, "A-01");
}

#[test]
fn normalize_kid_number_uppercases() {
    let value = intakes_common::normalize_kid_number(" kid-123 ").expect("must normalize");
    assert_eq!(value, "KID-123");
}

#[test]
fn qr_code_validation_accepts_symbols() {
    let result = intakes_common::normalize_qr_code("bad#barcode");
    assert!(result.is_ok());
}

#[test]
fn qr_code_validation_rejects_empty_values() {
    let result = intakes_common::normalize_qr_code("   ");
    assert!(result.is_err());
}

#[test]
fn qr_code_validation_accepts_qr_payload() {
    let result = intakes_common::normalize_qr_code("BOX-42|A1|https://example.com/x?id=7")
        .expect("must accept qr payload");
    assert_eq!(result, "BOX-42|A1|https://example.com/x?id=7");
}

#[test]
fn decode_html_entities_decodes_federation_payload() {
    let decoded = decode_html_entities("&lt;a b=&quot;1&amp;2&quot;&gt;x&#39;y&lt;/a&gt;");
    assert_eq!(decoded, "<a b=\"1&2\">x'y</a>");
}

#[test]
fn env_flag_parses_truthy_and_default_values() {
    std::env::set_var("TEST_ENV_FLAG", "true");
    assert!(env_flag("TEST_ENV_FLAG", false));

    std::env::set_var("TEST_ENV_FLAG", "0");
    assert!(!env_flag("TEST_ENV_FLAG", true));

    std::env::remove_var("TEST_ENV_FLAG");
    assert!(env_flag("TEST_ENV_FLAG", true));
}

#[test]
fn normalize_placement_strategy_supports_pool_auto() {
    let strategy = intakes_placement::normalize_placement_strategy(Some("pool_auto".to_string()));
    assert!(matches!(
        strategy,
        intakes_placement::PlacementStrategy::PoolAuto
    ));
}

#[test]
fn find_first_free_pool_location_returns_lowest_slot() {
    let mut slots = serde_json::Map::new();
    slots.insert("1".to_string(), json!(["D", "idx-1"]));
    slots.insert("2".to_string(), json!(["D", "idx-2"]));
    slots.insert("4".to_string(), json!(["D", "idx-4"]));

    let result = intakes_placement::find_first_free_pool_location(&slots);

    assert_eq!(result, Some(3));
}

#[test]
fn find_first_free_pool_location_none_when_full() {
    let mut slots = serde_json::Map::new();
    for slot in 1..=10000 {
        slots.insert(slot.to_string(), json!(["D", "busy"]));
    }

    let result = intakes_placement::find_first_free_pool_location(&slots);

    assert!(result.is_none());
}

#[test]
fn collect_used_pool_slots_merges_all_sections() {
    let rows = vec![
        (
            "D".to_string(),
            json!({
                "1": ["D", "idx-d1"],
                "3": ["D", "idx-d3"]
            }),
        ),
        (
            "F".to_string(),
            json!({
                "2": ["F", "idx-f2"]
            }),
        ),
    ];

    let merged = intakes_placement::collect_used_pool_slots(&rows);
    let result = intakes_placement::find_first_free_pool_location(&merged);

    assert_eq!(result, Some(4));
}

#[test]
fn hydrate_intake_activity_sets_inverse_of_is_removed() {
    let mut intake = IntakeDto {
        id: Uuid::nil(),
        qr_code: "Q".to_string(),
        warehouse_location: "D1".to_string(),
        kid_number: "KID-1".to_string(),
        photo_url: None,
        product_key: None,
        category_main: None,
        category_sub: None,
        section: "D".to_string(),
        slot_number: 1,
        box_index: 1,
        box_total: 1,
        unit_index: 1,
        internal_index: None,
        order_id: None,
        product_title: None,
        product_sku: None,
        product_ean: None,
        product_price: None,
        product_size: None,
        product_color: None,
        is_b_ware: false,
        b_ware_comment: None,
        product_sale_date: None,
        order_memo: None,
        created_at: Utc::now(),
        is_removed: true,
        removed_at: None,
        is_active: true,
    };

    hydrate_intake_activity(&mut intake);
    assert!(!intake.is_active);
}

#[test]
fn normalize_log_level_falls_back_to_info_for_unknown() {
    assert_eq!(
        service_logs::normalize_log_level(Some("trace".to_string())),
        "info"
    );
    assert_eq!(
        service_logs::normalize_log_level(Some(" warning ".to_string())),
        "warn"
    );
}

#[test]
fn normalize_log_message_trims_and_limits_length() {
    let source = format!("  {}  ", "x".repeat(service_logs::MAX_LOG_MESSAGE_LEN + 12));
    let normalized = service_logs::normalize_log_message(&source).expect("must normalize");
    assert_eq!(
        normalized.chars().count(),
        service_logs::MAX_LOG_MESSAGE_LEN
    );
}

#[test]
fn normalize_log_context_drops_empty_value() {
    assert_eq!(
        service_logs::normalize_log_context(Some("   ".to_string())),
        None
    );
}

#[test]
fn build_ws_auth_headers_uses_query_token_when_header_missing() {
    let headers = HeaderMap::new();
    let next = intake_ws::build_ws_auth_headers(&headers, Some(Uuid::nil().to_string()))
        .expect("must build auth header");
    let value = next
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string();
    assert!(value.starts_with("Bearer "));
}

#[test]
fn build_ws_auth_headers_uses_subprotocol_token_when_header_missing() {
    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::SEC_WEBSOCKET_PROTOCOL,
        "json, auth.00000000-0000-0000-0000-000000000000"
            .parse()
            .expect("must parse ws protocol"),
    );
    let next = intake_ws::build_ws_auth_headers(&headers, None).expect("must build auth header");
    let value = next
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string();
    assert_eq!(value, "Bearer 00000000-0000-0000-0000-000000000000");
}

#[test]
fn normalize_intakes_activity_filter_maps_active_to_not_removed() {
    let result = intakes_query_service::normalize_intakes_activity_filter(Some("active"));
    assert!(matches!(result, Ok(Some(false))));
}

#[test]
fn normalize_intakes_activity_filter_defaults_to_all() {
    let result = intakes_query_service::normalize_intakes_activity_filter(None);
    assert!(matches!(result, Ok(None)));
}

#[test]
fn normalize_intakes_activity_filter_rejects_unknown() {
    let result = intakes_query_service::normalize_intakes_activity_filter(Some("archived"));
    assert!(result.is_err());
}

#[test]
fn normalize_intakes_section_filter_accepts_valid_section() {
    let result =
        intakes_query_service::normalize_intakes_section_filter(Some("d")).expect("must parse");
    assert_eq!(result, Some("D".to_string()));
}

#[test]
fn normalize_intakes_section_filter_accepts_showroom_section() {
    let result =
        intakes_query_service::normalize_intakes_section_filter(Some("a")).expect("must parse");
    assert_eq!(result, Some("A".to_string()));
}

#[test]
fn normalize_intakes_offset_rejects_negative() {
    let result = intakes_query_service::normalize_intakes_offset(Some(-1));
    assert!(result.is_err());
}

#[test]
fn normalize_category_allows_empty_values() {
    let main = intakes_categories::normalize_optional_category_main(None).expect("must parse");
    let sub = intakes_categories::normalize_optional_category_sub(main.as_deref(), None)
        .expect("must parse");
    assert_eq!(main, None);
    assert_eq!(sub, None);
}

#[test]
fn normalize_category_main_only_sets_main_and_keeps_sub_empty() {
    let main = intakes_categories::normalize_optional_category_main(Some("Wohnzimmer".to_string()))
        .expect("must parse");
    let sub = intakes_categories::normalize_optional_category_sub(main.as_deref(), None)
        .expect("must parse");
    assert_eq!(main, Some("Wohnzimmer".to_string()));
    assert_eq!(sub, None);
}

#[test]
fn normalize_category_main_and_sub_accepts_valid_pair() {
    let main = intakes_categories::normalize_optional_category_main(Some("Küche".to_string()))
        .expect("must parse");
    let sub = intakes_categories::normalize_optional_category_sub(
        main.as_deref(),
        Some("Küchenschränke".to_string()),
    )
    .expect("must parse");
    assert_eq!(main, Some("Küche".to_string()));
    assert_eq!(sub, Some("Küchenschränke".to_string()));
}

#[test]
fn normalize_category_rejects_sub_without_main() {
    let result =
        intakes_categories::normalize_optional_category_sub(None, Some("Sofas".to_string()));
    assert!(result.is_err());
}

#[tokio::test]
async fn new_request_id_uses_request_context_when_available() {
    let expected = "test-request-id-123".to_string();
    CURRENT_REQUEST_ID
        .scope(expected.clone(), async move {
            assert_eq!(new_request_id(), expected);
        })
        .await;
}

#[tokio::test]
async fn logs_endpoint_requires_authorization() {
    let db = PgPoolOptions::new()
        .max_connections(1)
        .connect_lazy("postgres://sofortbot:sofortbot@localhost:8933/sofortbot")
        .expect("must create lazy pool");
    let (tx, _) = broadcast::channel(8);
    let state = AppState {
        app_env: "test".to_string(),
        db,
        intake_events: tx,
        logs: Arc::new(RwLock::new(InMemoryLogs::default())),
    };
    let app = build_app(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/logs/backend")
                .body(Body::empty())
                .expect("must build request"),
        )
        .await
        .expect("request must complete");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
