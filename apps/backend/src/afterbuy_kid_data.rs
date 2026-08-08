use axum::{http::StatusCode, Json};
use std::{env, sync::Arc};

use crate::{
    afterbuy_auth::login_and_collect_cookie,
    afterbuy_cookie_cache::{read_cookie_cache, write_cookie_cache},
    afterbuy_http::{fetch_afterbuy_search_page, AfterbuyFetchResult},
    afterbuy_kid_search::{
        build_afterbuy_kid_primary_post_body, build_afterbuy_kid_search_urls,
        build_farm_kid_search_login_url, build_kid_debug_info, is_afterbuy_kid_search_usable,
        AfterbuyKidSearchAttempt,
    },
    afterbuy_parse::parse_afterbuy_kid_matches,
    validation_error, AfterbuyKidOrdersResponse, ErrorResponse,
};

pub(crate) async fn fetch_afterbuy_orders_by_kid_data(
    kid_number: &str,
    account: Option<&str>,
    debug_enabled: bool,
) -> Result<AfterbuyKidOrdersResponse, (StatusCode, Json<ErrorResponse>)> {
    let normalized_kid = kid_number.trim().to_string();
    if normalized_kid.is_empty()
        || normalized_kid.len() > 64
        || !normalized_kid
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(validation_error(
            "invalid_kid_number",
            "kid_number must be 1..64 chars [a-zA-Z0-9_-]",
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
        .user_agent("SofortBot/afterbuy-kid-search")
        .build()
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "internal_error",
                    message: format!("failed to build http client: {error}"),
                    details: None,
                    request_id: crate::new_request_id(),
                }),
            )
        })?;

    let mut fallback_result: Option<(String, String, bool, AfterbuyFetchResult)> = None;
    let mut last_account_error: Option<String> = None;
    let mut missing_credentials: Vec<String> = Vec::new();
    let mut missing_login_urls: Vec<String> = Vec::new();

    for account in accounts_to_try {
        let (
            farm_host,
            login_env,
            pass_env,
            login_url_env,
            cache_file_env,
            default_cache_file,
            webayname_env,
            default_webayname,
        ) = match account {
            "xl" => (
                "farm04.afterbuy.de",
                "AFTERBUY_XL_LOGIN",
                "AFTERBUY_XL_PASS",
                "AFTERBUY_XL_LOGIN_URL",
                "AFTERBUY_XL_COOKIE_CACHE_FILE",
                ".afterbuy_xl.cookie",
                "AFTERBUY_XL_AWEBAYNAME",
                "538053450",
            ),
            _ => (
                "farm01.afterbuy.de",
                "AFTERBUY_JV_LOGIN",
                "AFTERBUY_JV_PASS",
                "AFTERBUY_JV_LOGIN_URL",
                "AFTERBUY_JV_COOKIE_CACHE_FILE",
                ".afterbuy_jv.cookie",
                "AFTERBUY_JV_AWEBAYNAME",
                "538053450",
            ),
        };

        let login = env::var(login_env).unwrap_or_default();
        let pass = env::var(pass_env).unwrap_or_default();
        if login.trim().is_empty() || pass.trim().is_empty() {
            missing_credentials.push(account.to_string());
            continue;
        }

        let webayname = env::var(webayname_env)
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| default_webayname.to_string());
        let search_urls = build_afterbuy_kid_search_urls(farm_host, &webayname, &normalized_kid)?;
        let post_url = format!("https://{farm_host}/afterbuy/auktionsliste.aspx");
        let primary_post_body = build_afterbuy_kid_primary_post_body(&normalized_kid);
        let mut search_attempts = Vec::<AfterbuyKidSearchAttempt>::new();
        search_attempts.push(AfterbuyKidSearchAttempt {
            display_url: format!("{post_url}?{primary_post_body}"),
            request_url: post_url,
            post_body: Some(primary_post_body),
        });
        for search_url in search_urls {
            search_attempts.push(AfterbuyKidSearchAttempt {
                display_url: search_url.clone(),
                request_url: search_url,
                post_body: None,
            });
        }
        let login_url = env::var(login_url_env).unwrap_or_default();
        let cookie_cache_file =
            env::var(cache_file_env).unwrap_or_else(|_| default_cache_file.to_string());

        let mut cookie_header = read_cookie_cache(&cookie_cache_file);
        for attempt in search_attempts {
            let mut relogin_performed = false;
            let first_try = match fetch_afterbuy_search_page(
                &client,
                &attempt.request_url,
                cookie_header.as_deref(),
                attempt.post_body.as_deref(),
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
            if !is_afterbuy_kid_search_usable(&final_result, &normalized_kid) {
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
                    &attempt.request_url,
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

                if let Err((_, err)) = write_cookie_cache(&cookie_cache_file, &refreshed_cookie).await
                {
                    last_account_error = Some(format!("{account}: {}", err.message));
                    continue;
                }
                cookie_header = Some(refreshed_cookie);
                final_result = match fetch_afterbuy_search_page(
                    &client,
                    &attempt.request_url,
                    cookie_header.as_deref(),
                    attempt.post_body.as_deref(),
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
                        build_farm_kid_search_login_url(farm_host, &normalized_kid, login.trim());
                    let refreshed_cookie = match login_and_collect_cookie(
                        &client,
                        cookie_jar.as_ref(),
                        &fallback_login_url,
                        &attempt.request_url,
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
                    final_result = match fetch_afterbuy_search_page(
                        &client,
                        &attempt.request_url,
                        cookie_header.as_deref(),
                        attempt.post_body.as_deref(),
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
            }

            if is_afterbuy_kid_search_usable(&final_result, &normalized_kid) {
                let matches = parse_afterbuy_kid_matches(&final_result.page_html, Some(&normalized_kid));
                if !matches.is_empty() {
                    return Ok(AfterbuyKidOrdersResponse {
                        kid_number: normalized_kid.clone(),
                        account: account.to_string(),
                        url: attempt.display_url.clone(),
                        final_url: final_result.final_url,
                        http_status: final_result.http_status,
                        page_title: final_result.page_title,
                        login_required: final_result.login_required,
                        relogin_performed,
                        page_preview: final_result.page_preview,
                        matches,
                        debug: if debug_enabled {
                            Some(build_kid_debug_info(&final_result.page_html, &normalized_kid))
                        } else {
                            None
                        },
                    });
                }
            }

            if fallback_result.is_none() {
                fallback_result = Some((
                    account.to_string(),
                    attempt.display_url.clone(),
                    relogin_performed,
                    final_result,
                ));
            }
        }
    }

    if let Some((account, search_url, relogin_performed, final_result)) = fallback_result {
        if !is_afterbuy_kid_search_usable(&final_result, &normalized_kid) {
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
                        "all afterbuy account attempts returned unusable page for kid_number={normalized_kid} (last account: {account}, title: {}, status: {}, final_url: {}, relogin: {}, preview: {})",
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

        return Ok(AfterbuyKidOrdersResponse {
            kid_number: normalized_kid.clone(),
            account,
            url: search_url,
            final_url: final_result.final_url,
            http_status: final_result.http_status,
            page_title: final_result.page_title,
            login_required: final_result.login_required,
            relogin_performed,
            page_preview: final_result.page_preview,
            matches: parse_afterbuy_kid_matches(&final_result.page_html, Some(&normalized_kid)),
            debug: if debug_enabled {
                Some(build_kid_debug_info(&final_result.page_html, &normalized_kid))
            } else {
                None
            },
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
