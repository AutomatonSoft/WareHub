use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::Serialize;
use std::env;

use crate::{ApiInfoResponse, AppState, ErrorResponse, HealthResponse};

#[derive(Debug, Serialize)]
pub(crate) struct MobileAppUpdateResponse {
    channel: String,
    latest_version: String,
    apk_url: String,
}

pub(crate) async fn healthz(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "sofortbot-backend",
        environment: state.app_env,
    })
}

pub(crate) async fn readyz(
    State(state): State<AppState>,
) -> Result<(StatusCode, Json<HealthResponse>), (StatusCode, Json<ErrorResponse>)> {
    match sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(&state.db)
        .await
    {
        Ok(_) => Ok((
            StatusCode::OK,
            Json(HealthResponse {
                status: "ready",
                service: "sofortbot-backend",
                environment: state.app_env,
            }),
        )),
        Err(_) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                code: "database_unavailable",
                message: "database is not ready".to_string(),
                details: None,
                request_id: crate::new_request_id(),
            }),
        )),
    }
}

pub(crate) async fn api_meta() -> Json<ApiInfoResponse> {
    Json(ApiInfoResponse {
        name: "sofortbot-backend",
        version: "v1",
        base_path: "/api/v1",
    })
}

pub(crate) async fn mobile_app_update(
    State(state): State<AppState>,
) -> Json<MobileAppUpdateResponse> {
    let env_name = state.app_env.to_ascii_lowercase();
    let is_stage = env_name == "stage";

    let default_stage_version =
        env::var("MOBILE_STAGE_APP_VERSION").unwrap_or_else(|_| "v0.0.0".to_string());
    let default_stage_url = env::var("MOBILE_STAGE_APK_URL").unwrap_or_default();
    let default_prod_version =
        env::var("MOBILE_PROD_APP_VERSION").unwrap_or_else(|_| "v0.0.0".to_string());
    let default_prod_url = env::var("MOBILE_PROD_APK_URL").unwrap_or_default();

    if is_stage {
        let stage_url = with_version_cache_buster(default_stage_url, &default_stage_version);
        return Json(MobileAppUpdateResponse {
            channel: "stage".to_string(),
            latest_version: default_stage_version,
            apk_url: stage_url,
        });
    }

    let prod_url = with_version_cache_buster(default_prod_url, &default_prod_version);
    Json(MobileAppUpdateResponse {
        channel: "prod".to_string(),
        latest_version: default_prod_version,
        apk_url: prod_url,
    })
}

fn with_version_cache_buster(url: String, version: &str) -> String {
    if url.trim().is_empty() || version.trim().is_empty() {
        return url;
    }
    if url.contains('?') {
        format!("{url}&v={version}")
    } else {
        format!("{url}?v={version}")
    }
}
