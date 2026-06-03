use axum::{http::StatusCode, Json};
use std::collections::BTreeMap;

use crate::{internal_error, ErrorResponse};

pub(crate) async fn submit_form_request(
    client: &reqwest::Client,
    action: &str,
    method: &str,
    fields: &BTreeMap<String, String>,
    cookie: &str,
    referer: &str,
    error_prefix: &str,
) -> Result<reqwest::Response, (StatusCode, Json<ErrorResponse>)> {
    let method_lower = method.trim().to_lowercase();
    let mut request = if method_lower == "get" {
        client.get(action).query(fields)
    } else {
        client
            .post(action)
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .form(fields)
    };
    if !referer.trim().is_empty() {
        request = request.header(reqwest::header::REFERER, referer);
    }
    if let Ok(action_url) = reqwest::Url::parse(action) {
        if let Some(host) = action_url.host_str() {
            let origin = format!("{}://{host}", action_url.scheme());
            request = request.header(reqwest::header::ORIGIN, origin);
        }
    }
    if !cookie.trim().is_empty() {
        request = request.header(reqwest::header::COOKIE, cookie.to_string());
    }
    request
        .send()
        .await
        .map_err(|error| internal_error(format!("{error_prefix}: {error}")))
}

pub(crate) fn extract_pending_federation_url_from_cookie(cookie_header: &str) -> Option<String> {
    for pair in cookie_header.split(';') {
        let p = pair.trim();
        if p.is_empty() {
            continue;
        }
        let (_, value) = p.split_once('=')?;
        let v = value.trim();
        if v.starts_with("http://logout.afterbuy.de/Federation/Index")
            || v.starts_with("https://logout.afterbuy.de/Federation/Index")
        {
            return Some(v.to_string());
        }
    }
    None
}

pub(crate) fn build_farm_login_url(farm_host: &str, order_id: &str, login: &str) -> String {
    let mut url = reqwest::Url::parse(&format!("https://{farm_host}/afterbuy/login.aspx"))
        .unwrap_or_else(|_| {
            reqwest::Url::parse("https://farm01.afterbuy.de/afterbuy/login.aspx")
                .expect("fallback url must be valid")
        });
    url.query_pairs_mut()
        .append_pair("art", "login")
        .append_pair("user", login)
        .append_pair(
            "ref",
            &format!("/afterbuy/auktionsliste.aspx?art=edit&id={order_id}&rsposition=0&ref=/afterbuy/auktionsliste.aspx"),
        );
    url.to_string()
}

pub(crate) fn merge_cookie_headers(
    existing_cookie_header: &str,
    set_cookie_values: reqwest::header::GetAll<reqwest::header::HeaderValue>,
) -> String {
    let mut map: BTreeMap<String, String> = BTreeMap::new();
    for pair in existing_cookie_header.split(';') {
        let p = pair.trim();
        if p.is_empty() {
            continue;
        }
        if let Some((name, value)) = p.split_once('=') {
            map.insert(name.trim().to_string(), value.trim().to_string());
        }
    }

    for value in set_cookie_values.iter() {
        if let Ok(raw) = value.to_str() {
            let first = raw.split(';').next().unwrap_or("").trim();
            if let Some((name, val)) = first.split_once('=') {
                if !name.trim().is_empty() {
                    map.insert(name.trim().to_string(), val.trim().to_string());
                }
            }
        }
    }

    map.into_iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<String>>()
        .join("; ")
}
