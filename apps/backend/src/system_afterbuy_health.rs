use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Serialize;
use std::env;

use crate::{auth::require_approved_user, AppState, ErrorResponse};

#[derive(Debug, Serialize)]
pub(crate) struct AfterbuyAccountHealth {
    account: String,
    credentials_present: bool,
    login_url_present: bool,
    login_url_value: Option<String>,
    cookie_cache_file: String,
    webayname_present: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct AfterbuyHealthResponse {
    status: String,
    jv: AfterbuyAccountHealth,
    xl: AfterbuyAccountHealth,
}

pub(crate) async fn afterbuy_health(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AfterbuyHealthResponse>, (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;

    let jv = build_afterbuy_account_health(
        "jv",
        "AFTERBUY_JV_LOGIN",
        "AFTERBUY_JV_PASS",
        "AFTERBUY_JV_LOGIN_URL",
        "AFTERBUY_JV_COOKIE_CACHE_FILE",
        ".afterbuy_jv.cookie",
        "AFTERBUY_JV_AWEBAYNAME",
    );
    let xl = build_afterbuy_account_health(
        "xl",
        "AFTERBUY_XL_LOGIN",
        "AFTERBUY_XL_PASS",
        "AFTERBUY_XL_LOGIN_URL",
        "AFTERBUY_XL_COOKIE_CACHE_FILE",
        ".afterbuy_xl.cookie",
        "AFTERBUY_XL_AWEBAYNAME",
    );

    let status = if jv.credentials_present
        && jv.login_url_present
        && xl.credentials_present
        && xl.login_url_present
    {
        "ok".to_string()
    } else {
        "degraded".to_string()
    };

    Ok(Json(AfterbuyHealthResponse { status, jv, xl }))
}

fn env_non_empty(name: &str) -> bool {
    env::var(name)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

fn build_afterbuy_account_health(
    account: &str,
    login_env: &str,
    pass_env: &str,
    login_url_env: &str,
    cookie_file_env: &str,
    default_cookie_file: &str,
    webayname_env: &str,
) -> AfterbuyAccountHealth {
    let login_present = env_non_empty(login_env);
    let pass_present = env_non_empty(pass_env);
    let login_url = env::var(login_url_env).ok().map(|v| v.trim().to_string());
    let login_url_present = login_url.as_ref().map(|v| !v.is_empty()).unwrap_or(false);
    let cookie_cache_file = env::var(cookie_file_env)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default_cookie_file.to_string());
    let webayname_present = env_non_empty(webayname_env);

    AfterbuyAccountHealth {
        account: account.to_string(),
        credentials_present: login_present && pass_present,
        login_url_present,
        login_url_value: login_url.filter(|v| !v.is_empty()),
        cookie_cache_file,
        webayname_present,
    }
}
