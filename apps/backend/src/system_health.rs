use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::{env, io::ErrorKind};
use tracing::warn;

use crate::{ApiInfoResponse, AppState, ErrorResponse, HealthResponse};

#[derive(Debug, Serialize)]
pub(crate) struct MobileAppUpdateResponse {
    channel: String,
    latest_version: String,
    apk_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    minimum_supported_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    published_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    release_notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mandatory: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct MobileReleaseManifest {
    channel: String,
    version: String,
    apk_url: String,
    #[serde(default)]
    minimum_supported_version: Option<String>,
    #[serde(default)]
    sha256: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    release_notes: Option<String>,
    #[serde(default)]
    mandatory: Option<bool>,
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
    match sqlx::query_scalar::<_, i64>("SELECT 1::BIGINT")
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
    let channel = if env_name == "stage" { "stage" } else { "prod" };

    if let Some(manifest) = load_mobile_release_manifest(channel).await {
        let apk_url = with_version_cache_buster(manifest.apk_url, &manifest.version);
        return Json(MobileAppUpdateResponse {
            channel: manifest.channel,
            latest_version: manifest.version,
            apk_url,
            minimum_supported_version: manifest.minimum_supported_version,
            sha256: manifest.sha256,
            published_at: manifest.published_at,
            release_notes: manifest.release_notes,
            mandatory: manifest.mandatory,
        });
    }

    let (version_key, url_key) = if channel == "stage" {
        ("MOBILE_STAGE_APP_VERSION", "MOBILE_STAGE_APK_URL")
    } else {
        ("MOBILE_PROD_APP_VERSION", "MOBILE_PROD_APK_URL")
    };
    let latest_version = env::var(version_key).unwrap_or_else(|_| "v0.0.0".to_string());
    let apk_url = with_version_cache_buster(env::var(url_key).unwrap_or_default(), &latest_version);

    Json(MobileAppUpdateResponse {
        channel: channel.to_string(),
        latest_version,
        apk_url,
        minimum_supported_version: None,
        sha256: None,
        published_at: None,
        release_notes: None,
        mandatory: None,
    })
}

async fn load_mobile_release_manifest(channel: &str) -> Option<MobileReleaseManifest> {
    let path_key = if channel == "stage" {
        "MOBILE_STAGE_RELEASE_MANIFEST_PATH"
    } else {
        "MOBILE_PROD_RELEASE_MANIFEST_PATH"
    };
    let path = env::var(path_key).ok()?.trim().to_string();
    if path.is_empty() {
        return None;
    }

    let content = match tokio::fs::read_to_string(&path).await {
        Ok(content) => content,
        Err(error) if error.kind() == ErrorKind::NotFound => return None,
        Err(error) => {
            warn!(%channel, %path, %error, "failed to read mobile release manifest");
            return None;
        }
    };
    let manifest = match serde_json::from_str::<MobileReleaseManifest>(&content) {
        Ok(manifest) => manifest,
        Err(error) => {
            warn!(%channel, %path, %error, "failed to parse mobile release manifest");
            return None;
        }
    };

    if manifest.channel != channel
        || manifest.version.trim().is_empty()
        || manifest.apk_url.trim().is_empty()
    {
        warn!(%channel, %path, "mobile release manifest has invalid required fields");
        return None;
    }

    Some(manifest)
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
