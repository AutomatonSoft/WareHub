use axum::{http::StatusCode, Json};

use crate::{
    afterbuy_html::{
        extract_form_action, extract_form_fields, extract_form_method, extract_html_redirect_target,
    },
    afterbuy_support::{
        cookie_header_from_jar, extract_pending_federation_url_from_cookie, merge_cookie_headers,
        submit_form_request,
    },
    internal_error, ErrorResponse,
};

pub(crate) async fn login_and_collect_cookie(
    client: &reqwest::Client,
    cookie_jar: &reqwest::cookie::Jar,
    login_url: &str,
    session_url: &str,
    login: &str,
    pass: &str,
) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let mut login_get = client
        .get(login_url)
        .send()
        .await
        .map_err(|error| internal_error(format!("failed to open afterbuy login page: {error}")))?;

    let mut cookie = String::new();
    let mut login_html = String::new();
    let mut login_page_url = login_url.to_string();
    for _ in 0..10 {
        cookie = merge_cookie_headers(
            &cookie,
            login_get.headers().get_all(reqwest::header::SET_COOKIE),
        );

        if login_get.status().is_redirection() {
            let location = login_get
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .map(|v| v.trim().to_string())
                .unwrap_or_default();
            if location.is_empty() {
                break;
            }
            let follow_url = if let Ok(absolute) = reqwest::Url::parse(&location) {
                absolute.to_string()
            } else if let Ok(joined) = login_get.url().join(&location) {
                joined.to_string()
            } else {
                break;
            };
            login_get = client
                .get(follow_url)
                .header(reqwest::header::COOKIE, cookie.clone())
                .send()
                .await
                .map_err(|error| {
                    internal_error(format!("failed to follow pre-login redirect: {error}"))
                })?;
            continue;
        }

        let response_url = login_get.url().to_string();
        let body = login_get
            .text()
            .await
            .map_err(|error| internal_error(format!("failed to read afterbuy login page: {error}")))?;
        if let Some(next_url) = extract_html_redirect_target(&body, &response_url) {
            login_get = client
                .get(next_url)
                .header(reqwest::header::COOKIE, cookie.clone())
                .send()
                .await
                .map_err(|error| {
                    internal_error(format!("failed to follow pre-login html redirect: {error}"))
                })?;
            continue;
        }
        login_html = body;
        login_page_url = response_url;
        break;
    }
    if login_html.trim().is_empty() {
        return Err(internal_error(
            "afterbuy login page body is empty after redirects".to_string(),
        ));
    }

    let mut form_fields = extract_form_fields(&login_html);
    form_fields.insert("Username".to_string(), login.to_string());
    form_fields.insert("UserName".to_string(), login.to_string());
    form_fields.insert("Login".to_string(), login.to_string());
    form_fields.insert("Password".to_string(), pass.to_string());
    form_fields.insert("Passwort".to_string(), pass.to_string());
    form_fields.insert("RememberMe".to_string(), "false".to_string());

    let post_url = extract_form_action(&login_html, &login_page_url);
    let post_method = extract_form_method(&login_html);
    let mut login_post = submit_form_request(
        client,
        &post_url,
        &post_method,
        &form_fields,
        &cookie,
        &login_page_url,
        "failed to submit afterbuy login form",
    )
    .await?;

    for _ in 0..10 {
        cookie = merge_cookie_headers(
            &cookie,
            login_post.headers().get_all(reqwest::header::SET_COOKIE),
        );

        if login_post.status().is_redirection() {
            let location = login_post
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .map(|v| v.trim().to_string())
                .unwrap_or_default();
            if location.is_empty() {
                break;
            }

            let follow_url = if let Ok(absolute) = reqwest::Url::parse(&location) {
                absolute
            } else if let Ok(joined) = login_post.url().join(&location) {
                joined
            } else if let Ok(base) = reqwest::Url::parse(&post_url) {
                base.join(&location).map_err(|error| {
                    internal_error(format!(
                        "invalid afterbuy redirect location '{location}': {error}"
                    ))
                })?
            } else {
                return Err(internal_error(format!(
                    "invalid afterbuy redirect location '{location}'"
                )));
            };

            login_post = client
                .get(follow_url)
                .header(reqwest::header::COOKIE, cookie.clone())
                .send()
                .await
                .map_err(|error| {
                    internal_error(format!("failed to follow afterbuy redirect: {error}"))
                })?;
            continue;
        }

        let current_response_url = login_post.url().to_string();
        let body = login_post.text().await.map_err(|error| {
            internal_error(format!("failed to read afterbuy auth response body: {error}"))
        })?;
        let lower_body = body.to_lowercase();
        let mut ws_fields = extract_form_fields(&body);
        let should_autopost = ws_fields.contains_key("wresult")
            || ws_fields.contains_key("wa")
            || ws_fields.contains_key("wctx")
            || lower_body.contains("wsignin1.0");
        let working_autosubmit = lower_body.contains("<form")
            && (lower_body.contains("working")
                || lower_body.contains("document.forms")
                || lower_body.contains(".submit("));

        if !working_autosubmit && (ws_fields.is_empty() || !should_autopost) {
            if let Some(next_url) = extract_html_redirect_target(&body, &current_response_url) {
                login_post = client
                    .get(next_url)
                    .header(reqwest::header::COOKIE, cookie.clone())
                    .send()
                    .await
                    .map_err(|error| {
                        internal_error(format!("failed to follow afterbuy html redirect: {error}"))
                    })?;
                continue;
            }
            break;
        }

        let ws_action = extract_form_action(&body, &current_response_url);
        let ws_method = extract_form_method(&body);
        if ws_action.trim().is_empty() {
            if let Some(next_url) = extract_html_redirect_target(&body, &current_response_url) {
                login_post = client
                    .get(next_url)
                    .header(reqwest::header::COOKIE, cookie.clone())
                    .send()
                    .await
                    .map_err(|error| {
                        internal_error(format!("failed to follow afterbuy html redirect: {error}"))
                    })?;
                continue;
            }
            break;
        }
        if !ws_fields.contains_key("wa") {
            ws_fields.insert("wa".to_string(), "wsignin1.0".to_string());
        }
        login_post = submit_form_request(
            client,
            &ws_action,
            &ws_method,
            &ws_fields,
            &cookie,
            &current_response_url,
            "failed to submit afterbuy federation form",
        )
        .await?;
    }

    // Afterbuy sometimes stores the next federation hop inside a cookie value.
    // Follow it explicitly to finalize authenticated session cookies.
    for _ in 0..2 {
        let Some(federation_url) = extract_pending_federation_url_from_cookie(&cookie) else {
            break;
        };
        let mut follow = client
            .get(&federation_url)
            .header(reqwest::header::COOKIE, cookie.clone())
            .send()
            .await
            .map_err(|error| {
                internal_error(format!("failed to open afterbuy federation url: {error}"))
            })?;

        for _ in 0..8 {
            cookie = merge_cookie_headers(
                &cookie,
                follow.headers().get_all(reqwest::header::SET_COOKIE),
            );
            if follow.status().is_redirection() {
                let location = follow
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|v| v.to_str().ok())
                    .map(|v| v.trim().to_string())
                    .unwrap_or_default();
                if location.is_empty() {
                    break;
                }
                let next_url = if let Ok(absolute) = reqwest::Url::parse(&location) {
                    absolute.to_string()
                } else if let Ok(joined) = follow.url().join(&location) {
                    joined.to_string()
                } else {
                    break;
                };
                follow = client
                    .get(next_url)
                    .header(reqwest::header::COOKIE, cookie.clone())
                    .send()
                    .await
                    .map_err(|error| {
                        internal_error(format!(
                            "failed to follow afterbuy federation redirect: {error}"
                        ))
                    })?;
                continue;
            }
            let follow_url_for_html = follow.url().to_string();
            let body = follow.text().await.map_err(|error| {
                internal_error(format!("failed to read afterbuy federation response body: {error}"))
            })?;
            if let Some(next_url) = extract_html_redirect_target(&body, &follow_url_for_html) {
                follow = client
                    .get(next_url)
                    .header(reqwest::header::COOKIE, cookie.clone())
                    .send()
                    .await
                    .map_err(|error| {
                        internal_error(format!(
                            "failed to follow afterbuy federation html redirect: {error}"
                        ))
                    })?;
                continue;
            }
            break;
        }
    }

    if let Some(cookie_from_jar) = cookie_header_from_jar(cookie_jar, session_url) {
        return Ok(cookie_from_jar);
    }

    if cookie.trim().is_empty() {
        return Err(internal_error(
            "afterbuy login finished without cookies".to_string(),
        ));
    }

    Ok(cookie)
}
