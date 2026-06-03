use axum::{http::StatusCode, Json};

use crate::{
    afterbuy_html::{
        extract_form_action, extract_form_fields, extract_form_method, extract_html_redirect_target,
        extract_html_title,
    },
    afterbuy_support::{merge_cookie_headers, submit_form_request},
    internal_error, ErrorResponse,
};

pub(crate) struct AfterbuyFetchResult {
    pub(crate) http_status: u16,
    pub(crate) final_url: String,
    pub(crate) page_title: Option<String>,
    pub(crate) login_required: bool,
    pub(crate) page_preview: String,
    pub(crate) page_html: String,
}

pub(crate) fn is_afterbuy_result_usable(result: &AfterbuyFetchResult, order_id: &str) -> bool {
    if result.login_required {
        return false;
    }
    if result.http_status < 200 || result.http_status >= 300 {
        return false;
    }

    let final_url_lower = result.final_url.to_lowercase();
    if final_url_lower.contains("login.afterbuy.de")
        || final_url_lower.contains("logout.afterbuy.de/error")
        || final_url_lower.contains("/error/httperror")
    {
        return false;
    }

    if result.page_html.trim().is_empty() {
        return false;
    }

    let order_id_lower = order_id.to_lowercase();
    let html_lower = result.page_html.to_lowercase();
    let contains_direct_id = final_url_lower.contains(&format!("id={order_id_lower}"))
        || html_lower.contains(&format!("id={order_id_lower}"))
        || html_lower.contains(&format!("id%3d{order_id_lower}"));
    let contains_order_token = html_lower.contains(&format!(">{order_id_lower}<"))
        || html_lower.contains(&format!("\"{order_id_lower}\""))
        || html_lower.contains(&format!("'{order_id_lower}'"))
        || html_lower.contains(&format!("|{order_id_lower}|"));
    let is_generic_search_page = html_lower.contains("produkt id")
        && html_lower.contains("alle anzeigen")
        && html_lower.contains("transaktionen anzuzeigen");

    if is_generic_search_page && !contains_direct_id && !contains_order_token {
        return false;
    }

    contains_direct_id || contains_order_token
}

pub(crate) async fn fetch_afterbuy_order_page(
    client: &reqwest::Client,
    farm_host: &str,
    order_id: &str,
    cookie_header: Option<&str>,
) -> Result<AfterbuyFetchResult, (StatusCode, Json<ErrorResponse>)> {
    let order_url = format!(
        "https://{farm_host}/afterbuy/auktionsliste.aspx?art=edit&id={order_id}&rsposition=0&ref=/afterbuy/auktionsliste.aspx"
    );
    let referer = format!(
        "https://{farm_host}/afterbuy/login.aspx?art=login&ref=%2Fafterbuy%2Fauktionsliste.aspx"
    );

    fetch_afterbuy_page_internal(
        client,
        &order_url,
        &referer,
        cookie_header,
        None,
        "invalid afterbuy url",
    )
    .await
}

pub(crate) async fn fetch_afterbuy_search_page(
    client: &reqwest::Client,
    search_url: &str,
    cookie_header: Option<&str>,
    post_body: Option<&str>,
) -> Result<AfterbuyFetchResult, (StatusCode, Json<ErrorResponse>)> {
    let referer =
        "https://farm01.afterbuy.de/afterbuy/login.aspx?art=login&ref=%2Fafterbuy%2Fauktionsliste.aspx";

    fetch_afterbuy_page_internal(
        client,
        search_url,
        referer,
        cookie_header,
        post_body,
        "invalid afterbuy search url",
    )
    .await
}

async fn fetch_afterbuy_page_internal(
    client: &reqwest::Client,
    start_url: &str,
    referer: &str,
    cookie_header: Option<&str>,
    post_body: Option<&str>,
    invalid_url_error_prefix: &str,
) -> Result<AfterbuyFetchResult, (StatusCode, Json<ErrorResponse>)> {
    let mut current_url = reqwest::Url::parse(start_url)
        .map_err(|error| internal_error(format!("{invalid_url_error_prefix}: {error}")))?;
    let mut last_status = 0u16;
    let mut html = String::new();
    let mut last_location = String::new();
    let mut session_cookie = cookie_header.unwrap_or("").trim().to_string();
    let mut first_request = true;

    for _ in 0..10 {
        let mut request = build_request(
            client,
            current_url.clone(),
            referer,
            post_body,
            first_request,
        );
        first_request = false;

        if !session_cookie.is_empty() {
            request = request.header(reqwest::header::COOKIE, session_cookie.clone());
        }

        let response = request
            .send()
            .await
            .map_err(|error| internal_error(format!("failed to fetch afterbuy page: {error}")))?;
        session_cookie = merge_cookie_headers(
            &session_cookie,
            response.headers().get_all(reqwest::header::SET_COOKIE),
        );

        last_status = response.status().as_u16();
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        last_location = location.to_lowercase();

        if response.status().is_redirection() && !location.is_empty() {
            let _ = response.text().await;
            if let Some(next_url) = resolve_redirect_url(&current_url, &location) {
                current_url = next_url;
                continue;
            }
            break;
        }

        let response_url_for_html = response.url().to_string();
        html = response
            .text()
            .await
            .map_err(|error| internal_error(format!("failed to read afterbuy response body: {error}")))?;

        if html.to_lowercase().contains("<title>working") {
            let form_action = extract_form_action(&html, &response_url_for_html);
            let form_method = extract_form_method(&html);
            let form_fields = extract_form_fields(&html);
            let is_federation_form = form_action
                .to_lowercase()
                .contains("logout.afterbuy.de/federation/index");

            if is_federation_form && !form_fields.is_empty() {
                let follow = submit_form_request(
                    client,
                    &form_action,
                    &form_method,
                    &form_fields,
                    &session_cookie,
                    &response_url_for_html,
                    "failed to submit afterbuy working form",
                )
                .await?;

                session_cookie = merge_cookie_headers(
                    &session_cookie,
                    follow.headers().get_all(reqwest::header::SET_COOKIE),
                );

                last_status = follow.status().as_u16();
                let follow_location = follow
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                last_location = follow_location.to_lowercase();

                if follow.status().is_redirection() && !follow_location.is_empty() {
                    let _ = follow.text().await;
                    if let Some(next_url) = resolve_redirect_url(&current_url, &follow_location) {
                        current_url = next_url;
                        continue;
                    }
                } else {
                    let follow_url_for_html = follow.url().to_string();
                    html = follow.text().await.map_err(|error| {
                        internal_error(format!(
                            "failed to read afterbuy working form response: {error}"
                        ))
                    })?;

                    if let Some(next_url) =
                        extract_html_redirect_target(&html, &follow_url_for_html)
                    {
                        if let Ok(parsed) = reqwest::Url::parse(&next_url) {
                            current_url = parsed;
                            continue;
                        }
                    }
                    if let Ok(parsed) = reqwest::Url::parse(&follow_url_for_html) {
                        current_url = parsed;
                    }
                }
            }
        }

        if let Some(next_url) = extract_html_redirect_target(&html, current_url.as_str()) {
            if let Ok(parsed) = reqwest::Url::parse(&next_url) {
                current_url = parsed;
                continue;
            }
        }
        break;
    }

    Ok(build_fetch_result(
        last_status,
        current_url,
        last_location,
        html,
    ))
}

fn build_request(
    client: &reqwest::Client,
    current_url: reqwest::Url,
    referer: &str,
    post_body: Option<&str>,
    first_request: bool,
) -> reqwest::RequestBuilder {
    if !first_request {
        return client.get(current_url);
    }

    if let Some(body) = post_body {
        client
            .post(current_url)
            .header(reqwest::header::REFERER, referer)
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .body(body.to_string())
    } else {
        client
            .get(current_url)
            .header(reqwest::header::REFERER, referer)
    }
}

fn resolve_redirect_url(base: &reqwest::Url, location: &str) -> Option<reqwest::Url> {
    if let Ok(absolute) = reqwest::Url::parse(location) {
        return Some(absolute);
    }
    base.join(location).ok()
}

fn build_fetch_result(
    last_status: u16,
    current_url: reqwest::Url,
    last_location: String,
    html: String,
) -> AfterbuyFetchResult {
    let page_title = extract_html_title(&html);
    let login_required = is_login_required(
        &page_title,
        &html,
        current_url.as_str(),
        last_location.as_str(),
    );
    let page_preview: String = html.chars().take(500).collect();

    AfterbuyFetchResult {
        http_status: last_status,
        final_url: current_url.to_string(),
        page_title,
        login_required,
        page_preview,
        page_html: html,
    }
}

fn is_login_required(
    page_title: &Option<String>,
    html: &str,
    current_url: &str,
    last_location: &str,
) -> bool {
    let title_lower = page_title.as_deref().unwrap_or("").trim().to_lowercase();
    let lower = html.to_lowercase();
    let current_url_lower = current_url.to_lowercase();
    let has_login_fields = (lower.contains("name=\"username\"") || lower.contains("id=\"username\""))
        && (lower.contains("name=\"password\"") || lower.contains("id=\"password\""));

    current_url_lower.contains("login.afterbuy.de")
        || current_url_lower.contains("logout.afterbuy.de/error")
        || current_url_lower.contains("/error/httperror")
        || current_url_lower.contains("/account/login")
        || last_location.contains("login.afterbuy.de")
        || last_location.contains("logout.afterbuy.de/error")
        || last_location.contains("/error/httperror")
        || title_lower.contains("benutzer-login")
        || title_lower.contains("anmeldung")
        || title_lower.contains("login")
        || has_login_fields
        || (lower.contains("/account/login") && has_login_fields)
}
