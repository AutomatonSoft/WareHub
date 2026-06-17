use axum::{response::Html, Json};
use serde_json::json;

use super::system_openapi_paths::openapi_paths;

pub(crate) async fn openapi_json() -> Json<serde_json::Value> {
    Json(json!({
        "openapi": "3.1.0",
        "info": {
            "title": "SofortBOT Backend API",
            "version": "v1",
            "description": "Primary backend API for warehouse intake flows, authentication, admin operations, uploads and diagnostics."
        },
        "servers": [
            { "url": "/" }
        ],
        "tags": [
            { "name": "System", "description": "Healthchecks, metadata and API documentation endpoints." },
            { "name": "Mobile", "description": "Mobile application update metadata." },
            { "name": "Auth", "description": "Registration, login, refresh and current-user account operations." },
            { "name": "Admin", "description": "Admin-only user management, moderation and audit operations." },
            { "name": "Intakes", "description": "Warehouse intake CRUD, lookup and product stock queries." },
            { "name": "Placement", "description": "Placement suggestions and location-based intake operations." },
            { "name": "Realtime", "description": "Realtime event streams and websocket integrations." },
            { "name": "Uploads", "description": "Authenticated file upload endpoints." },
            { "name": "Afterbuy", "description": "Afterbuy order lookup and runtime integration health." },
            { "name": "Settings", "description": "Global printer and label layout configuration." },
            { "name": "Logs", "description": "In-memory service log viewer and write endpoints." }
        ],
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "UUID token"
                }
            },
            "schemas": {
                "ErrorResponse": {
                    "type": "object",
                    "required": ["code", "message", "request_id"],
                    "properties": {
                        "code": { "type": "string", "description": "Stable machine-readable error code." },
                        "message": { "type": "string", "description": "Safe human-readable error message." },
                        "request_id": { "type": "string", "description": "Request correlation id for troubleshooting." },
                        "details": {
                            "type": "object",
                            "description": "Optional field-level validation details.",
                            "additionalProperties": {
                                "type": "array",
                                "items": { "type": "string" }
                            },
                            "nullable": true
                        }
                    }
                },
                "HealthResponse": {
                    "type": "object",
                    "required": ["status", "service", "environment"],
                    "properties": {
                        "status": { "type": "string", "example": "ok" },
                        "service": { "type": "string", "example": "sofortbot-backend" },
                        "environment": { "type": "string", "example": "dev" }
                    }
                },
                "ApiInfoResponse": {
                    "type": "object",
                    "required": ["name", "version", "base_path"],
                    "properties": {
                        "name": { "type": "string", "example": "sofortbot-backend" },
                        "version": { "type": "string", "example": "v1" },
                        "base_path": { "type": "string", "example": "/api/v1" }
                    }
                },
                "AuthUserResponse": {
                    "type": "object",
                    "required": ["id", "username", "login", "role", "status"],
                    "properties": {
                        "id": { "type": "string", "format": "uuid" },
                        "username": { "type": "string" },
                        "login": { "type": "string" },
                        "email": { "type": "string", "nullable": true },
                        "first_name": { "type": "string", "nullable": true },
                        "last_name": { "type": "string", "nullable": true },
                        "phone_number": { "type": "string", "nullable": true },
                        "avatar_url": { "type": "string", "nullable": true },
                        "role": { "type": "string", "enum": ["admin", "user"] },
                        "status": { "type": "string", "enum": ["pending", "approved", "rejected"] }
                    }
                },
                "LoginResponse": {
                    "type": "object",
                    "required": ["token", "user"],
                    "properties": {
                        "token": { "type": "string", "format": "uuid" },
                        "user": { "$ref": "#/components/schemas/AuthUserResponse" }
                    }
                },
                "RegisterResponse": {
                    "type": "object",
                    "required": ["message", "status"],
                    "properties": {
                        "message": { "type": "string" },
                        "status": { "type": "string", "example": "pending" }
                    }
                },
                "IntakeDto": {
                    "type": "object",
                    "required": [
                        "id", "qr_code", "warehouse_location", "kid_number", "section", "slot_number",
                        "box_index", "box_total", "unit_index", "is_b_ware", "created_at", "is_removed", "is_active"
                    ],
                    "properties": {
                        "id": { "type": "string", "format": "uuid" },
                        "qr_code": { "type": "string" },
                        "warehouse_location": { "type": "string" },
                        "kid_number": { "type": "string" },
                        "photo_url": { "type": "string", "nullable": true },
                        "product_key": { "type": "string", "nullable": true },
                        "section": { "type": "string", "enum": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"] },
                        "slot_number": { "type": "integer" },
                        "box_index": { "type": "integer" },
                        "box_total": { "type": "integer" },
                        "unit_index": { "type": "integer" },
                        "internal_index": { "type": "string", "nullable": true },
                        "order_id": { "type": "string", "nullable": true },
                        "product_title": { "type": "string", "nullable": true },
                        "product_sku": { "type": "string", "nullable": true },
                        "product_ean": { "type": "string", "nullable": true },
                        "product_price": { "type": "string", "nullable": true },
                        "product_size": { "type": "string", "nullable": true },
                        "product_color": { "type": "string", "nullable": true },
                        "category_main": { "type": "string", "nullable": true },
                        "category_sub": { "type": "string", "nullable": true },
                        "is_b_ware": { "type": "boolean" },
                        "b_ware_comment": { "type": "string", "nullable": true },
                        "product_sale_date": { "type": "string", "nullable": true },
                        "order_memo": { "type": "string", "nullable": true },
                        "created_at": { "type": "string", "format": "date-time" },
                        "is_removed": { "type": "boolean" },
                        "removed_at": { "type": "string", "format": "date-time", "nullable": true },
                        "is_active": { "type": "boolean" }
                    }
                },
                "ProductStockStatDto": {
                    "type": "object",
                    "required": ["product_ref", "active_units", "first_created_at", "last_created_at"],
                    "properties": {
                        "product_ref": { "type": "string" },
                        "product_title": { "type": "string", "nullable": true },
                        "active_units": { "type": "integer" },
                        "first_created_at": { "type": "string", "format": "date-time" },
                        "last_created_at": { "type": "string", "format": "date-time" }
                    }
                },
                "ServiceLogEntry": {
                    "type": "object",
                    "required": ["timestamp", "channel", "level", "message"],
                    "properties": {
                        "timestamp": { "type": "string", "format": "date-time" },
                        "channel": { "type": "string", "enum": ["frontend", "backend", "mobile"] },
                        "level": { "type": "string", "enum": ["debug", "info", "warn", "error"] },
                        "message": { "type": "string" },
                        "context": { "type": "string", "nullable": true }
                    }
                },
                "UploadResponse": {
                    "type": "object",
                    "required": ["url"],
                    "properties": {
                        "url": { "type": "string", "description": "Public or backend-served uploaded file URL." }
                    }
                }
            }
        },
        "paths": openapi_paths()
    }))
}

pub(crate) async fn scalar_ui() -> Html<String> {
    let html = r#"<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SofortBOT API Scalar</title>
  </head>
  <body>
    <script id="api-reference" data-url="/api/v1/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>"#;
    Html(html.to_string())
}
