use axum::{response::Html, Json};
use serde_json::json;

use super::system_openapi_paths::openapi_paths;

pub(crate) async fn openapi_json() -> Json<serde_json::Value> {
    Json(json!({
        "openapi": "3.1.0",
        "info": {
            "title": "SofortBOT Backend API",
            "version": "v1",
            "description": "Primary backend API for warehouse intakes, auth and uploads."
        },
        "servers": [
            { "url": "/" }
        ],
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "UUID token"
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
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>"#;
    Html(html.to_string())
}
