use axum::{
    extract::{Path, Query},
    http::StatusCode,
    Json,
};
use std::{env, sync::Arc};

use crate::{
    afterbuy_auth::login_and_collect_cookie,
    afterbuy_cookie_cache::{read_cookie_cache, write_cookie_cache},
    afterbuy_kid_data::fetch_afterbuy_orders_by_kid_data,
    afterbuy_http::{
        fetch_afterbuy_order_page, is_afterbuy_result_usable, AfterbuyFetchResult,
    },
    afterbuy_order_parse::parse_afterbuy_order_items,
    afterbuy_parse::{ensure_non_empty_order_items, parse_afterbuy_memo},
    afterbuy_support::build_farm_login_url,
    internal_error, validation_error, AfterbuyKidOrdersResponse,
    AfterbuyKidQuery, AfterbuyOrderQuery, AfterbuyOrderResponse, ErrorResponse,
};

pub(crate) async fn fetch_afterbuy_order(
    Path(order_id): Path<String>,
    Query(query): Query<AfterbuyOrderQuery>,
) -> Result<Json<AfterbuyOrderResponse>, (StatusCode, Json<ErrorResponse>)> {
    let response = fetch_afterbuy_order_data(&order_id, query.account.as_deref()).await?;
    Ok(Json(response))
}

pub(crate) async fn fetch_afterbuy_orders_by_kid(
    Path(kid_number): Path<String>,
    Query(query): Query<AfterbuyKidQuery>,
) -> Result<Json<AfterbuyKidOrdersResponse>, (StatusCode, Json<ErrorResponse>)> {
    let debug_enabled = parse_bool_query_flag(query.debug.as_deref());
    let response =
        fetch_afterbuy_orders_by_kid_data(&kid_number, query.account.as_deref(), debug_enabled)
            .await?;
    Ok(Json(response))
}

fn parse_bool_query_flag(value: Option<&str>) -> bool {
    matches!(
        value.unwrap_or("").trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

pub(crate) async fn fetch_afterbuy_order_data(
    order_id: &str,
    account: Option<&str>,
) -> Result<AfterbuyOrderResponse, (StatusCode, Json<ErrorResponse>)> {
    let normalized_order_id = order_id.trim().to_string();
    if normalized_order_id.is_empty()
        || normalized_order_id.len() > 64
        || !normalized_order_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(validation_error(
            "invalid_order_id",
            "order_id must be 1..64 chars [a-zA-Z0-9_-]",
        ));
    }

    let requested_account = account.unwrap_or_default().trim().to_lowercase();
    let accounts_to_try: Vec<&str> = if requested_account == "jv" || requested_account == "xl" {
        vec![requested_account.as_str()]
    } else {
        vec!["jv", "xl"]
    };

    let cookie_jar = Arc::new(reqwest::cookie::Jar::default());
    let client = reqwest::Client::builder()
        .cookie_provider(cookie_jar.clone())
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("SofortBot/afterbuy-fetch")
        .build()
        .map_err(|error| internal_error(format!("failed to build http client: {error}")))?;

    let mut fallback_result: Option<(String, String, bool, AfterbuyFetchResult)> = None;
    let mut last_account_error: Option<String> = None;
    let mut missing_credentials: Vec<String> = Vec::new();
    let mut missing_login_urls: Vec<String> = Vec::new();

    for account in accounts_to_try {
        let (farm_host, login_env, pass_env, login_url_env, cache_file_env, default_cache_file) =
            match account {
                "xl" => (
                    "farm04.afterbuy.de",
                    "AFTERBUY_XL_LOGIN",
                    "AFTERBUY_XL_PASS",
                    "AFTERBUY_XL_LOGIN_URL",
                    "AFTERBUY_XL_COOKIE_CACHE_FILE",
                    ".afterbuy_xl.cookie",
                ),
                _ => (
                    "farm01.afterbuy.de",
                    "AFTERBUY_JV_LOGIN",
                    "AFTERBUY_JV_PASS",
                    "AFTERBUY_JV_LOGIN_URL",
                    "AFTERBUY_JV_COOKIE_CACHE_FILE",
                    ".afterbuy_jv.cookie",
                ),
            };
        let afterbuy_url = format!(
            "https://{farm_host}/afterbuy/auktionsliste.aspx?art=edit&id={normalized_order_id}&rsposition=0&ref=/afterbuy/auktionsliste.aspx"
        );

        let login_url = env::var(login_url_env).unwrap_or_default();
        let cookie_cache_file =
            env::var(cache_file_env).unwrap_or_else(|_| default_cache_file.to_string());

        let login = env::var(login_env).unwrap_or_default();
        let pass = env::var(pass_env).unwrap_or_default();
        if login.trim().is_empty() || pass.trim().is_empty() {
            missing_credentials.push(account.to_string());
            continue;
        }
        let mut relogin_performed = false;
        let mut cookie_header = read_cookie_cache(&cookie_cache_file);
        let first_try = match fetch_afterbuy_order_page(
            &client,
            farm_host,
            &normalized_order_id,
            cookie_header.as_deref(),
        )
        .await
        {
            Ok(v) => v,
            Err((_, err)) => {
                last_account_error = Some(format!("{account}: {}", err.message));
                continue;
            }
        };

        let mut final_result = first_try;
        if !is_afterbuy_result_usable(&final_result, &normalized_order_id) {
            relogin_performed = true;
            let login_url_for_attempt = if final_result
                .final_url
                .to_lowercase()
                .contains("login.afterbuy.de")
            {
                final_result.final_url.as_str()
            } else if !login_url.trim().is_empty() {
                login_url.trim()
            } else {
                missing_login_urls.push(login_url_env.to_string());
                last_account_error = Some(format!(
                    "{account}: missing login url (no redirect url and empty {login_url_env})"
                ));
                continue;
            };
            let refreshed_cookie = match login_and_collect_cookie(
                &client,
                cookie_jar.as_ref(),
                login_url_for_attempt,
                &afterbuy_url,
                login.trim(),
                pass.trim(),
            )
            .await
            {
                Ok(v) => v,
                Err((_, err)) => {
                    last_account_error = Some(format!("{account}: {}", err.message));
                    continue;
                }
            };
            if let Err((_, err)) = write_cookie_cache(&cookie_cache_file, &refreshed_cookie).await {
                last_account_error = Some(format!("{account}: {}", err.message));
                continue;
            }
            cookie_header = Some(refreshed_cookie);
            final_result = match fetch_afterbuy_order_page(
                &client,
                farm_host,
                &normalized_order_id,
                cookie_header.as_deref(),
            )
            .await
            {
                Ok(v) => v,
                Err((_, err)) => {
                    last_account_error = Some(format!("{account}: {}", err.message));
                    continue;
                }
            };

            let failed_on_http_error = final_result
                .final_url
                .to_lowercase()
                .contains("/error/httperror");
            if final_result.login_required && failed_on_http_error {
                let fallback_login_url =
                    build_farm_login_url(farm_host, &normalized_order_id, login.trim());
                let refreshed_cookie = match login_and_collect_cookie(
                    &client,
                    cookie_jar.as_ref(),
                    &fallback_login_url,
                    &afterbuy_url,
                    login.trim(),
                    pass.trim(),
                )
                .await
                {
                    Ok(v) => v,
                    Err((_, err)) => {
                        last_account_error = Some(format!("{account}: {}", err.message));
                        continue;
                    }
                };
                if let Err((_, err)) =
                    write_cookie_cache(&cookie_cache_file, &refreshed_cookie).await
                {
                    last_account_error = Some(format!("{account}: {}", err.message));
                    continue;
                }
                cookie_header = Some(refreshed_cookie);
                final_result = match fetch_afterbuy_order_page(
                    &client,
                    farm_host,
                    &normalized_order_id,
                    cookie_header.as_deref(),
                )
                .await
                {
                    Ok(v) => v,
                    Err((_, err)) => {
                        last_account_error = Some(format!("{account}: {}", err.message));
                        continue;
                    }
                };
            }

            // Afterbuy may briefly return an intermediate "Working..." page
            // even with valid cookies; retry the order page a few times.
            for _ in 0..3 {
                let title_lower = final_result
                    .page_title
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase();
                if !final_result.login_required || !title_lower.contains("working") {
                    break;
                }
                final_result = match fetch_afterbuy_order_page(
                    &client,
                    farm_host,
                    &normalized_order_id,
                    cookie_header.as_deref(),
                )
                .await
                {
                    Ok(v) => v,
                    Err((_, err)) => {
                        last_account_error = Some(format!("{account}: {}", err.message));
                        break;
                    }
                };
            }
        }

        if is_afterbuy_result_usable(&final_result, &normalized_order_id) {
            let memo = parse_afterbuy_memo(&final_result.page_html);
            let order_items = ensure_non_empty_order_items(
                &normalized_order_id,
                parse_afterbuy_order_items(&final_result.page_html),
            );
            return Ok(AfterbuyOrderResponse {
                order_id: normalized_order_id,
                account: account.to_string(),
                url: afterbuy_url.clone(),
                final_url: final_result.final_url,
                http_status: final_result.http_status,
                page_title: final_result.page_title,
                login_required: final_result.login_required,
                relogin_performed,
                page_preview: final_result.page_preview,
                page_html: final_result.page_html,
                memo,
                order_items,
            });
        }

        if fallback_result.is_none() {
            fallback_result = Some((
                account.to_string(),
                afterbuy_url,
                relogin_performed,
                final_result,
            ));
        }
    }

    if let Some((account, afterbuy_url, relogin_performed, final_result)) = fallback_result {
        if !is_afterbuy_result_usable(&final_result, &normalized_order_id) {
            let preview = final_result
                .page_preview
                .replace(['\n', '\r'], " ")
                .chars()
                .take(180)
                .collect::<String>();
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(ErrorResponse {
                    code: "afterbuy_fetch_failed",
                    message: format!(
                        "all afterbuy account attempts returned unusable page for order_id={normalized_order_id} (last account: {account}, title: {}, status: {}, final_url: {}, relogin: {}, preview: {})",
                        final_result
                            .page_title
                            .clone()
                            .unwrap_or_else(|| "n/a".to_string()),
                        final_result.http_status,
                        final_result.final_url,
                        relogin_performed,
                        preview
                    ),
                    details: None,
                    request_id: crate::new_request_id(),
                }),
            ));
        }
        let order_items = ensure_non_empty_order_items(
            &normalized_order_id,
            parse_afterbuy_order_items(&final_result.page_html),
        );
        let memo = parse_afterbuy_memo(&final_result.page_html);
        return Ok(AfterbuyOrderResponse {
            order_id: normalized_order_id,
            account,
            url: afterbuy_url,
            final_url: final_result.final_url,
            http_status: final_result.http_status,
            page_title: final_result.page_title,
            login_required: final_result.login_required,
            relogin_performed,
            page_preview: final_result.page_preview,
            page_html: final_result.page_html,
            memo,
            order_items,
        });
    }

    if let Some(last_error) = last_account_error {
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                code: "afterbuy_fetch_failed",
                message: format!("all afterbuy account attempts failed: {last_error}"),
                details: None,
                request_id: crate::new_request_id(),
            }),
        ));
    }

    let mut missing_parts: Vec<String> = Vec::new();
    if !missing_credentials.is_empty() {
        missing_parts.push(format!(
            "credentials for accounts: {}",
            missing_credentials.join(",")
        ));
    }
    if !missing_login_urls.is_empty() {
        missing_parts.push(format!("login url envs: {}", missing_login_urls.join(",")));
    }

    Err(validation_error(
        "afterbuy_config_missing",
        &format!(
            "missing afterbuy config: {}",
            if missing_parts.is_empty() {
                "AFTERBUY_JV_* and AFTERBUY_XL_*".to_string()
            } else {
                missing_parts.join("; ")
            }
        ),
    ))
}

