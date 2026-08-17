use std::time::Duration;

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    auth::require_approved_user, AppState, CreateIntakeRequest, ErrorResponse,
    UpdateIntakePhotoRequest,
};

const DATABASE_INVENTORY_TIMEOUT_SECONDS: u64 = 8;
const DEFAULT_INVENTORY_PAGE_SIZE: i64 = 20;
const MAX_INVENTORY_PAGE_SIZE: i64 = 100;

#[derive(Debug, Deserialize)]
pub(crate) struct DatabaseInventoryRowsQuery {
    pub(crate) limit: Option<i64>,
    pub(crate) offset: Option<i64>,
    pub(crate) search: Option<String>,
    pub(crate) q: Option<String>,
    pub(crate) place: Option<String>,
    pub(crate) section: Option<String>,
    pub(crate) quantity: Option<String>,
    pub(crate) room: Option<String>,
    #[serde(rename = "type")]
    pub(crate) furniture_type: Option<String>,
    pub(crate) company: Option<String>,
    pub(crate) color: Option<String>,
    pub(crate) material: Option<String>,
    pub(crate) location: Option<String>,
    pub(crate) store: Option<bool>,
    pub(crate) b_ware: Option<bool>,
    #[serde(alias = "in_stock")]
    pub(crate) stock_status: Option<String>,
    pub(crate) in_transit: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct DatabaseInventoryRowsResponse {
    count: Option<i64>,
    results: Vec<Value>,
}

#[derive(Debug, Default)]
struct DatabaseInventoryRowsRequest {
    page_size: i64,
    page: i64,
    search: Option<String>,
    place: Option<String>,
    section: Option<String>,
    quantity: Option<String>,
    room: Option<String>,
    furniture_type: Option<String>,
    company: Option<String>,
    color: Option<String>,
    material: Option<String>,
    location: Option<String>,
    b_ware: Option<bool>,
    stock_status: Option<String>,
    in_transit: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct MarkDatabaseInventoryOutOfStockRequest {
    place: String,
    section: String,
    stock_status: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default, PartialEq, Eq)]
pub(crate) struct MobileInventoryFilterOptionsDto {
    pub(crate) places: Vec<String>,
    #[serde(default)]
    pub(crate) available_places: Vec<String>,
    pub(crate) sections: Vec<String>,
    pub(crate) locations: Vec<String>,
    pub(crate) quantities: Vec<String>,
    pub(crate) rooms: Vec<String>,
    pub(crate) types: Vec<String>,
    pub(crate) companies: Vec<String>,
    pub(crate) colors: Vec<String>,
    pub(crate) materials: Vec<String>,
}

#[derive(Debug, Serialize)]
struct DatabaseKidCreatePayload {
    kid_number: String,
    place: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    section: Option<String>,
    skip_order_sync: bool,
    quantity: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    room: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    furniture_type: Option<String>,
    b_ware: bool,
    store: bool,
    in_transit: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    commentary: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    photo: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub(crate) struct MobileInventoryRowDto {
    pub(crate) id: String,
    pub(crate) database_kid_id: i64,
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
    pub(crate) is_b_ware: bool,
    pub(crate) store: bool,
    pub(crate) stock_status: String,
    pub(crate) in_transit: bool,
    pub(crate) b_ware_comment: Option<String>,
    pub(crate) created_at: String,
    pub(crate) is_removed: bool,
    pub(crate) is_active: bool,
    pub(crate) removed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub(crate) struct MobileInventoryPageDto {
    pub(crate) items: Vec<MobileInventoryRowDto>,
    pub(crate) count: i64,
    pub(crate) limit: i64,
    pub(crate) offset: i64,
    pub(crate) next_offset: Option<i64>,
    pub(crate) has_more: bool,
}

pub(crate) async fn list_database_inventory_rows(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DatabaseInventoryRowsQuery>,
) -> Result<Json<MobileInventoryPageDto>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    list_database_inventory_rows_service(&state, query)
        .await
        .map(Json)
}

pub(crate) async fn list_database_inventory_filter_options(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<MobileInventoryFilterOptionsDto>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let Some(config) = state.database_kid_sync.clone() else {
        return Err(database_inventory_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "database_inventory_not_configured",
            "database-service integration is not configured",
        ));
    };
    let url = format!("{}/api/v1/inventory/filter-options/", config.base_url);
    let response = state
        .http_client
        .get(url)
        .header("x-warehub-service-token", &config.service_token)
        .timeout(Duration::from_secs(DATABASE_INVENTORY_TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| {
            database_inventory_error(
                StatusCode::BAD_GATEWAY,
                "database_inventory_filter_options_request_failed",
                format!("failed to request database-service inventory filter options: {error}"),
            )
        })?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(database_inventory_error(
            StatusCode::BAD_GATEWAY,
            "database_inventory_filter_options_upstream_failed",
            format!("database-service returned HTTP {status}: {body}"),
        ));
    }
    response
        .json::<MobileInventoryFilterOptionsDto>()
        .await
        .map(Json)
        .map_err(|error| {
            database_inventory_error(
                StatusCode::BAD_GATEWAY,
                "database_inventory_filter_options_response_invalid",
                format!("database-service inventory filter options response is invalid: {error}"),
            )
        })
}

pub(crate) async fn create_database_inventory_kid(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateIntakeRequest>,
) -> Result<(StatusCode, Json<MobileInventoryRowDto>), (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let created = create_database_inventory_kid_service(&state, payload).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

pub(crate) async fn update_database_inventory_kid_photo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(kid_ref): Path<String>,
    Json(payload): Json<UpdateIntakePhotoRequest>,
) -> Result<Json<MobileInventoryRowDto>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    update_database_inventory_kid_photo_service(&state, &kid_ref, payload)
        .await
        .map(Json)
}

pub(crate) async fn mark_database_inventory_out_of_stock(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<MarkDatabaseInventoryOutOfStockRequest>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let place = payload.place.trim();
    let section = payload.section.trim().to_ascii_uppercase();
    let stock_status = normalize_inventory_stock_status(payload.stock_status.as_deref()).ok_or_else(|| {
        database_inventory_error(
            StatusCode::BAD_REQUEST,
            "database_inventory_stock_status_invalid",
            "stock_status must be one of: in_stock, returned, out",
        )
    })?;
    if place.is_empty() {
        return Err(database_inventory_error(
            StatusCode::BAD_REQUEST,
            "database_inventory_place_required",
            "place is required",
        ));
    }
    if section.chars().count() != 1 {
        return Err(database_inventory_error(
            StatusCode::BAD_REQUEST,
            "database_inventory_section_invalid",
            "section must contain exactly one character",
        ));
    }

    let Some(config) = state.database_kid_sync.clone() else {
        return Err(database_inventory_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "database_inventory_not_configured",
            "database-service integration is not configured",
        ));
    };
    let url = format!("{}/api/v1/kids/mark-out-of-stock/", config.base_url);
    let response = state
        .http_client
        .post(url)
        .header("x-warehub-service-token", &config.service_token)
        .json(&serde_json::json!({
            "place": place,
            "section": section,
            "stock_status": stock_status,
        }))
        .timeout(Duration::from_secs(DATABASE_INVENTORY_TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| {
            database_inventory_error(
                StatusCode::BAD_GATEWAY,
                "database_inventory_mark_out_of_stock_request_failed",
                format!("failed to request database-service: {error}"),
            )
        })?;

    if !response.status().is_success() {
        let upstream_status = response.status();
        let body = response.text().await.unwrap_or_default();
        let status = match upstream_status {
            StatusCode::BAD_REQUEST => StatusCode::BAD_REQUEST,
            StatusCode::NOT_FOUND => StatusCode::NOT_FOUND,
            _ => StatusCode::BAD_GATEWAY,
        };
        return Err(database_inventory_error(
            status,
            "database_inventory_mark_out_of_stock_upstream_failed",
            format!("database-service returned HTTP {upstream_status}: {body}"),
        ));
    }

    response.json::<Value>().await.map(Json).map_err(|error| {
        database_inventory_error(
            StatusCode::BAD_GATEWAY,
            "database_inventory_mark_out_of_stock_response_invalid",
            format!("database-service response is invalid: {error}"),
        )
    })
}

async fn list_database_inventory_rows_service(
    state: &AppState,
    query: DatabaseInventoryRowsQuery,
) -> Result<MobileInventoryPageDto, (StatusCode, Json<ErrorResponse>)> {
    let Some(config) = state.database_kid_sync.clone() else {
        return Err(database_inventory_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "database_inventory_not_configured",
            "database-service integration is not configured",
        ));
    };

    let limit = normalize_page_size(query.limit);
    let offset = query.offset.unwrap_or(0).max(0);
    let page = normalize_page(Some(offset), limit);
    let location = normalized_optional_text(query.location.as_deref()).or_else(|| {
        query
            .store
            .map(|store| if store { "store" } else { "warehouse" }.to_string())
    });
    let response = fetch_database_inventory_rows_page(
        state,
        &config,
        DatabaseInventoryRowsRequest {
            page_size: limit,
            page,
            search: query.search.or(query.q),
            place: query.place,
            section: query.section,
            quantity: query.quantity,
            room: query.room,
            furniture_type: query.furniture_type,
            company: query.company,
            color: query.color,
            material: query.material,
            location,
            b_ware: query.b_ware,
            stock_status: query.stock_status,
            in_transit: query.in_transit,
        },
    )
    .await?;
    let items = response
        .results
        .iter()
        .map(map_inventory_row_to_mobile_row)
        .collect::<Vec<MobileInventoryRowDto>>();
    let count = response.count.unwrap_or(items.len() as i64);
    let next_offset = if offset + items.len() as i64 >= count {
        None
    } else {
        Some(offset + items.len() as i64)
    };

    Ok(MobileInventoryPageDto {
        items,
        count,
        limit,
        offset,
        next_offset,
        has_more: next_offset.is_some(),
    })
}

async fn create_database_inventory_kid_service(
    state: &AppState,
    payload: CreateIntakeRequest,
) -> Result<MobileInventoryRowDto, (StatusCode, Json<ErrorResponse>)> {
    let Some(config) = state.database_kid_sync.clone() else {
        return Err(database_inventory_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "database_inventory_not_configured",
            "database-service integration is not configured",
        ));
    };

    let create_payload = build_database_kid_create_payload(&payload)?;
    let url = format!("{}/api/v1/kids/", config.base_url);
    let response = state
        .http_client
        .post(url)
        .header("x-warehub-service-token", &config.service_token)
        .json(&create_payload)
        .timeout(Duration::from_secs(DATABASE_INVENTORY_TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| {
            database_inventory_error(
                StatusCode::BAD_GATEWAY,
                "database_kid_create_failed",
                format!("failed to create database-service kid: {error}"),
            )
        })?;

    if !response.status().is_success() {
        let upstream_status = response.status();
        let body = response.text().await.unwrap_or_default();
        let (status, code) = database_kid_create_error_status(upstream_status);
        return Err(database_inventory_error(
            status,
            code,
            format!("database-service returned HTTP {upstream_status}: {body}"),
        ));
    }

    let created_kid = response.json::<Value>().await.map_err(|error| {
        database_inventory_error(
            StatusCode::BAD_GATEWAY,
            "database_kid_create_response_invalid",
            format!("database-service kid response is invalid: {error}"),
        )
    })?;

    let Some(created_kid_number) = text_field(&created_kid, "kid_number") else {
        return Err(database_inventory_error(
            StatusCode::BAD_GATEWAY,
            "database_kid_create_response_missing_kid_number",
            "database-service kid response does not include kid_number",
        ));
    };

    let rows = fetch_database_inventory_rows(
        state,
        &config,
        1,
        1,
        Some(created_kid_number),
    )
    .await?;
    if let Some(row) = rows.first() {
        return Ok(map_inventory_row_to_mobile_row(row));
    }

    Ok(map_kid_response_to_mobile_row(&created_kid))
}

async fn update_database_inventory_kid_photo_service(
    state: &AppState,
    kid_ref: &str,
    payload: UpdateIntakePhotoRequest,
) -> Result<MobileInventoryRowDto, (StatusCode, Json<ErrorResponse>)> {
    let Some(config) = state.database_kid_sync.clone() else {
        return Err(database_inventory_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "database_inventory_not_configured",
            "database-service integration is not configured",
        ));
    };
    let kid_id = parse_kid_id_ref(kid_ref).ok_or_else(|| {
        database_inventory_error(
            StatusCode::BAD_REQUEST,
            "kid_id_invalid",
            "kid photo update requires a database kid id",
        )
    })?;
    let photo = normalize_photo_urls(payload.photo_url.as_deref());
    let url = format!("{}/api/v1/kids/{kid_id}/", config.base_url);
    let response = state
        .http_client
        .patch(url)
        .header("x-warehub-service-token", &config.service_token)
        .json(&serde_json::json!({ "photo": photo }))
        .timeout(Duration::from_secs(DATABASE_INVENTORY_TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| {
            database_inventory_error(
                StatusCode::BAD_GATEWAY,
                "database_kid_photo_update_failed",
                format!("failed to update database-service kid photo: {error}"),
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(database_inventory_error(
            StatusCode::BAD_GATEWAY,
            "database_kid_photo_update_upstream_failed",
            format!("database-service returned HTTP {status}: {body}"),
        ));
    }

    let updated_kid = response.json::<Value>().await.map_err(|error| {
        database_inventory_error(
            StatusCode::BAD_GATEWAY,
            "database_kid_photo_update_response_invalid",
            format!("database-service kid response is invalid: {error}"),
        )
    })?;
    if let Some(kid_number) = text_field(&updated_kid, "kid_number") {
        let rows = fetch_database_inventory_rows(state, &config, 1, 1, Some(kid_number)).await?;
        if let Some(row) = rows.first() {
            return Ok(map_inventory_row_to_mobile_row(row));
        }
    }

    Ok(map_kid_response_to_mobile_row(&updated_kid))
}

async fn fetch_database_inventory_rows(
    state: &AppState,
    config: &crate::database_kid_sync::DatabaseKidSyncConfig,
    page_size: i64,
    page: i64,
    search: Option<String>,
) -> Result<Vec<Value>, (StatusCode, Json<ErrorResponse>)> {
    fetch_database_inventory_rows_page(
        state,
        config,
        DatabaseInventoryRowsRequest {
            page_size,
            page,
            search,
            ..Default::default()
        },
    )
        .await
        .map(|response| response.results)
}

async fn fetch_database_inventory_rows_page(
    state: &AppState,
    config: &crate::database_kid_sync::DatabaseKidSyncConfig,
    request: DatabaseInventoryRowsRequest,
) -> Result<DatabaseInventoryRowsResponse, (StatusCode, Json<ErrorResponse>)> {
    let mut url = Url::parse(&format!("{}/api/v1/inventory/rows/", config.base_url)).map_err(
        |_| {
            database_inventory_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "database_inventory_invalid_base_url",
                "database-service base URL is invalid",
            )
        },
    )?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("page_size", &request.page_size.to_string());
        pairs.append_pair("page", &request.page.to_string());
        if let Some(search) = normalized_optional_text(request.search.as_deref()) {
            pairs.append_pair("q", &search);
        }
        pairs.append_pair("place_sort", "asc");
        if let Some(place) = normalized_optional_text(request.place.as_deref()) {
            pairs.append_pair("place", &place);
        }
        if let Some(section) = normalized_optional_text(request.section.as_deref()) {
            pairs.append_pair("section", &section);
        }
        if let Some(quantity) = normalized_optional_text(request.quantity.as_deref()) {
            pairs.append_pair("quantity", &quantity);
        }
        if let Some(room) = normalized_optional_text(request.room.as_deref()) {
            pairs.append_pair("room", &room);
        }
        if let Some(furniture_type) = normalized_optional_text(request.furniture_type.as_deref()) {
            pairs.append_pair("type", &furniture_type);
        }
        if let Some(company) = normalized_optional_text(request.company.as_deref()) {
            pairs.append_pair("company", &company);
        }
        if let Some(color) = normalized_optional_text(request.color.as_deref()) {
            pairs.append_pair("color", &color);
        }
        if let Some(material) = normalized_optional_text(request.material.as_deref()) {
            pairs.append_pair("material", &material);
        }
        if let Some(location) = normalized_optional_text(request.location.as_deref()) {
            pairs.append_pair("location", &location);
        }
        if let Some(b_ware) = request.b_ware {
            pairs.append_pair("b_ware", if b_ware { "true" } else { "false" });
        }
        if let Some(stock_status) = normalized_optional_text(request.stock_status.as_deref()) {
            pairs.append_pair("stock_status", &stock_status);
        }
        if let Some(in_transit) = request.in_transit {
            pairs.append_pair("in_transit", if in_transit { "true" } else { "false" });
        }
    }

    let response = state
        .http_client
        .get(url)
        .header("x-warehub-service-token", &config.service_token)
        .timeout(Duration::from_secs(DATABASE_INVENTORY_TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| {
            database_inventory_error(
                StatusCode::BAD_GATEWAY,
                "database_inventory_request_failed",
                format!("failed to request database-service inventory rows: {error}"),
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(database_inventory_error(
            StatusCode::BAD_GATEWAY,
            "database_inventory_upstream_failed",
            format!("database-service returned HTTP {status}: {body}"),
        ));
    }

    let decoded = response
        .json::<DatabaseInventoryRowsResponse>()
        .await
        .map_err(|error| {
            database_inventory_error(
                StatusCode::BAD_GATEWAY,
                "database_inventory_response_invalid",
                format!("database-service inventory response is invalid: {error}"),
            )
        })?;

    Ok(decoded)
}

fn build_database_kid_create_payload(
    payload: &CreateIntakeRequest,
) -> Result<DatabaseKidCreatePayload, (StatusCode, Json<ErrorResponse>)> {
    let kid_number = normalized_optional_text(Some(&payload.kid_number)).ok_or_else(|| {
        database_inventory_error(
            StatusCode::BAD_REQUEST,
            "kid_number_required",
            "kid_number is required",
        )
    })?;
    let place = normalized_optional_text(payload.warehouse_location.as_deref()).ok_or_else(|| {
        database_inventory_error(
            StatusCode::BAD_REQUEST,
            "place_required",
            "warehouse_location is required",
        )
    })?;

    Ok(DatabaseKidCreatePayload {
        kid_number,
        place,
        section: normalized_optional_text(payload.placement_section.as_deref())
            .map(|value| value.to_uppercase()),
        skip_order_sync: true,
        quantity: payload.box_total.unwrap_or(1).max(1),
        color: normalized_optional_text(payload.product_color.as_deref()),
        room: normalized_optional_text(payload.category_main.as_deref()),
        furniture_type: normalized_optional_text(payload.category_sub.as_deref()),
        b_ware: payload.is_b_ware.unwrap_or(false),
        store: payload.store.unwrap_or(false),
        in_transit: payload.in_transit.unwrap_or(false),
        commentary: normalized_optional_text(payload.b_ware_comment.as_deref()),
        photo: normalize_photo_urls(payload.photo_url.as_deref()),
    })
}

fn map_kid_response_to_mobile_row(row: &Value) -> MobileInventoryRowDto {
    let id = text_field(row, "id")
        .map(|id| format!("KID-{id}"))
        .unwrap_or_default();
    let kid_number = text_field(row, "kid_number").unwrap_or_default();
    let place = text_field(row, "place").unwrap_or_default();
    let (section, slot_number) = section_and_slot_from_row(row, &place);
    MobileInventoryRowDto {
        id,
        database_kid_id: int_field(row, "id").unwrap_or(0).max(0) as i64,
        qr_code: kid_number.clone(),
        warehouse_location: place,
        kid_number,
        photo_url: photo_url_field(row.get("photo")),
        product_key: None,
        section,
        slot_number,
        box_index: 1,
        box_total: 1,
        unit_index: int_field(row, "id").unwrap_or(1).max(1),
        is_b_ware: bool_field(row, "b_ware").unwrap_or(false),
        store: bool_field(row, "store").unwrap_or(false),
        stock_status: stock_status_field(row),
        in_transit: bool_field(row, "in_transit").unwrap_or(false),
        b_ware_comment: text_field(row, "commentary"),
        created_at: Utc::now().to_rfc3339(),
        is_removed: false,
        is_active: true,
        removed_at: None,
    }
}

fn map_inventory_row_to_mobile_row(row: &Value) -> MobileInventoryRowDto {
    let id = text_field(row, "id").unwrap_or_else(|| {
        text_field(row, "kid_id")
            .map(|kid_id| format!("KID-{kid_id}"))
            .unwrap_or_default()
    });
    let kid_number = text_field(row, "kid_number").unwrap_or_default();
    let order_id = text_field(row, "order_id").filter(|value| value != "-");
    let place = text_field(row, "place").unwrap_or_default();
    let (section, slot_number) = section_and_slot_from_row(row, &place);
    let quantity = int_field(row, "quantity").unwrap_or(1).max(1);

    MobileInventoryRowDto {
        id,
        database_kid_id: int_field(row, "kid_id").unwrap_or(0).max(0) as i64,
        qr_code: order_id.unwrap_or_else(|| kid_number.clone()),
        warehouse_location: place,
        kid_number,
        photo_url: photo_url_field(row.get("photo")),
        product_key: text_field(row, "sku").filter(|value| value != "-").or_else(|| {
            text_field(row, "ean")
                .filter(|value| value != "-")
                .or_else(|| text_field(row, "company"))
        }),
        section,
        slot_number,
        box_index: 1,
        box_total: quantity,
        unit_index: int_field(row, "kid_id").unwrap_or(1).max(1),
        is_b_ware: bool_field(row, "b_ware").unwrap_or(false),
        store: bool_field(row, "store").unwrap_or(false),
        stock_status: stock_status_field(row),
        in_transit: bool_field(row, "in_transit").unwrap_or(false),
        b_ware_comment: text_field(row, "commentary").filter(|value| value != "-"),
        created_at: text_field(row, "date").unwrap_or_else(|| Utc::now().to_rfc3339()),
        is_removed: false,
        is_active: true,
        removed_at: None,
    }
}

fn normalize_page_size(limit: Option<i64>) -> i64 {
    limit
        .unwrap_or(DEFAULT_INVENTORY_PAGE_SIZE)
        .clamp(1, MAX_INVENTORY_PAGE_SIZE)
}

fn normalize_page(offset: Option<i64>, page_size: i64) -> i64 {
    let offset = offset.unwrap_or(0).max(0);
    (offset / page_size) + 1
}

fn parse_place(place: &str) -> (String, i32) {
    let normalized = place.trim().to_uppercase();
    let mut section = String::new();
    let mut digits = String::new();
    for ch in normalized.chars() {
        if ch.is_ascii_alphabetic() && digits.is_empty() {
            section.push(ch);
            continue;
        }
        if ch.is_ascii_digit() {
            digits.push(ch);
        }
    }
    let slot_number = digits.parse::<i32>().unwrap_or(0);
    (section, slot_number)
}

fn section_and_slot_from_row(row: &Value, place: &str) -> (String, i32) {
    let (parsed_section, slot_number) = parse_place(place);
    let section = text_field(row, "section")
        .filter(|value| value != "-")
        .map(|value| value.to_uppercase())
        .unwrap_or(parsed_section);
    (section, slot_number)
}

fn photo_url_field(value: Option<&Value>) -> Option<String> {
    let value = value?;
    match value {
        Value::Array(items) => {
            if items.is_empty() {
                None
            } else {
                serde_json::to_string(items).ok()
            }
        }
        Value::String(raw) => normalized_optional_text(Some(raw)),
        _ => None,
    }
}

fn parse_kid_id_ref(value: &str) -> Option<i64> {
    let normalized = value.trim();
    let raw_id = normalized.strip_prefix("KID-").unwrap_or(normalized);
    raw_id.parse::<i64>().ok().filter(|id| *id > 0)
}

fn normalize_photo_urls(value: Option<&str>) -> Vec<String> {
    let Some(raw) = normalized_optional_text(value) else {
        return Vec::new();
    };
    if raw.starts_with('[') {
        if let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&raw) {
            return items
                .iter()
                .filter_map(Value::as_str)
                .filter_map(|item| normalized_optional_text(Some(item)))
                .collect();
        }
    }
    raw.split([',', ';', '\n', '\r'])
        .filter_map(|item| normalized_optional_text(Some(item)))
        .collect()
}

fn text_field(row: &Value, field: &str) -> Option<String> {
    let value = row.get(field)?;
    match value {
        Value::String(raw) => normalized_optional_text(Some(raw)),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
}

fn int_field(row: &Value, field: &str) -> Option<i32> {
    match row.get(field)? {
        Value::Number(number) => number.as_i64().and_then(|value| i32::try_from(value).ok()),
        Value::String(raw) => raw.trim().parse::<i32>().ok(),
        _ => None,
    }
}

fn bool_field(row: &Value, field: &str) -> Option<bool> {
    match row.get(field)? {
        Value::Bool(value) => Some(*value),
        Value::String(raw) => match raw.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn stock_status_field(row: &Value) -> String {
    match row.get("stock_status").or_else(|| row.get("in_stock")) {
        Some(Value::String(value)) if matches!(value.as_str(), "in_stock" | "returned" | "out") => value.clone(),
        Some(Value::Bool(true)) => "in_stock".to_string(),
        Some(Value::Bool(false)) => "out".to_string(),
        _ => "in_stock".to_string(),
    }
}

fn normalized_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalize_inventory_stock_status(value: Option<&str>) -> Option<String> {
    let normalized = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase)
        .unwrap_or_else(|| "out".to_string());
    match normalized.as_str() {
        "in_stock" | "returned" | "out" => Some(normalized),
        _ => None,
    }
}

fn database_kid_create_error_status(upstream_status: StatusCode) -> (StatusCode, &'static str) {
    match upstream_status {
        StatusCode::BAD_REQUEST | StatusCode::CONFLICT | StatusCode::UNPROCESSABLE_ENTITY => (
            upstream_status,
            "database_kid_create_validation_failed",
        ),
        _ => (StatusCode::BAD_GATEWAY, "database_kid_create_upstream_failed"),
    }
}

fn database_inventory_error(
    status: StatusCode,
    code: &'static str,
    message: impl Into<String>,
) -> (StatusCode, Json<ErrorResponse>) {
    (
        status,
        Json(ErrorResponse {
            code,
            message: message.into(),
            details: None,
            request_id: crate::new_request_id(),
        }),
    )
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn maps_inventory_row_to_mobile_row() {
        let row = json!({
            "id": "KID-42",
            "kid_id": 42,
            "kid_number": "KID-001",
            "place": "1A",
            "section": "A",
            "photo": ["https://cdn.example.com/1.jpg"],
            "order_id": "-",
            "sku": "SKU-1",
            "quantity": 3,
            "store": true,
            "stock_status": "out",
            "in_transit": true,
            "commentary": "Box damaged",
            "date": "2026-07-08T10:00:00Z"
        });

        let mapped = map_inventory_row_to_mobile_row(&row);

        assert_eq!(mapped.id, "KID-42");
        assert_eq!(mapped.database_kid_id, 42);
        assert_eq!(mapped.qr_code, "KID-001");
        assert_eq!(mapped.warehouse_location, "1A");
        assert_eq!(mapped.section, "A");
        assert_eq!(mapped.slot_number, 1);
        assert_eq!(mapped.box_total, 3);
        assert_eq!(mapped.product_key.as_deref(), Some("SKU-1"));
        assert!(mapped.store);
        assert_eq!(mapped.stock_status, "out");
        assert!(mapped.in_transit);
        assert_eq!(mapped.b_ware_comment.as_deref(), Some("Box damaged"));
        assert_eq!(
            mapped.photo_url.as_deref(),
            Some("[\"https://cdn.example.com/1.jpg\"]")
        );
    }

    #[test]
    fn normalizes_inventory_stock_status_for_mobile_requests() {
        assert_eq!(normalize_inventory_stock_status(Some(" returned ")).as_deref(), Some("returned"));
        assert_eq!(normalize_inventory_stock_status(Some("IN_STOCK")).as_deref(), Some("in_stock"));
        assert_eq!(normalize_inventory_stock_status(None).as_deref(), Some("out"));
        assert_eq!(normalize_inventory_stock_status(Some("unknown")), None);
    }

    #[test]
    fn preserves_database_kid_validation_statuses_for_mobile_clients() {
        assert_eq!(
            database_kid_create_error_status(StatusCode::BAD_REQUEST),
            (StatusCode::BAD_REQUEST, "database_kid_create_validation_failed"),
        );
        assert_eq!(
            database_kid_create_error_status(StatusCode::CONFLICT),
            (StatusCode::CONFLICT, "database_kid_create_validation_failed"),
        );
        assert_eq!(
            database_kid_create_error_status(StatusCode::UNPROCESSABLE_ENTITY),
            (StatusCode::UNPROCESSABLE_ENTITY, "database_kid_create_validation_failed"),
        );
        assert_eq!(
            database_kid_create_error_status(StatusCode::INTERNAL_SERVER_ERROR),
            (StatusCode::BAD_GATEWAY, "database_kid_create_upstream_failed"),
        );
    }

    #[test]
    fn build_create_payload_preserves_store_and_photo_urls() {
        let payload = CreateIntakeRequest {
            qr_code: "QR-1".to_string(),
            warehouse_location: Some("E123".to_string()),
            placement_section: Some("A".to_string()),
            kid_number: "KID-001".to_string(),
            photo_url: Some(" https://cdn.example.com/1.jpg, https://cdn.example.com/2.jpg ".to_string()),
            product_key: None,
            product_color: Some("Blue".to_string()),
            store: Some(true),
            in_transit: Some(true),
            category_main: Some("Living room".to_string()),
            category_sub: Some("Sofa".to_string()),
            is_b_ware: Some(true),
            b_ware_comment: Some("Packaging damage".to_string()),
            box_total: Some(2),
            placement_strategy: None,
        };

        let create_payload = build_database_kid_create_payload(&payload).expect("payload");

        assert_eq!(create_payload.kid_number, "KID-001");
        assert_eq!(create_payload.place, "E123");
        assert_eq!(create_payload.section.as_deref(), Some("A"));
        assert!(create_payload.store);
        assert!(create_payload.in_transit);
        assert!(create_payload.b_ware);
        assert_eq!(create_payload.quantity, 2);
        assert_eq!(
            create_payload.photo,
            vec![
                "https://cdn.example.com/1.jpg".to_string(),
                "https://cdn.example.com/2.jpg".to_string(),
            ]
        );
    }

    #[test]
    fn normalizes_limit_and_offset_to_database_service_page() {
        assert_eq!(normalize_page_size(None), 20);
        assert_eq!(normalize_page_size(Some(700)), 100);
        assert_eq!(normalize_page(Some(20), 20), 2);
        assert_eq!(normalize_page(Some(-1), 20), 1);
    }

    #[test]
    fn decodes_inventory_filter_options_contract() {
        let options: MobileInventoryFilterOptionsDto = serde_json::from_value(json!({
            "places": ["1A", "1B"],
            "available_places": ["2", "3", "4"],
            "sections": ["A"],
            "locations": ["warehouse"],
            "quantities": ["1", "2"],
            "rooms": ["Wohnzimmer"],
            "types": ["Sofa"],
            "companies": ["Brand"],
            "colors": ["Blue"],
            "materials": ["Velvet"]
        }))
        .expect("filter options");

        assert_eq!(options.places, vec!["1A", "1B"]);
        assert_eq!(options.available_places, vec!["2", "3", "4"]);
        assert_eq!(options.sections, vec!["A"]);
        assert_eq!(options.quantities, vec!["1", "2"]);
        assert_eq!(options.materials, vec!["Velvet"]);
    }
}
