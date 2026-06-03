use axum::{http::StatusCode, Json};

use crate::{
    afterbuy_html::extract_attr, afterbuy_http::AfterbuyFetchResult, internal_error,
    AfterbuyKidDebugDto, ErrorResponse,
};

pub(crate) fn build_kid_debug_info(html: &str, kid_number: &str) -> AfterbuyKidDebugDto {
    fn collect_candidate_urls(source: &str) -> Vec<String> {
        let lower = source.to_lowercase();
        let mut out = Vec::<String>::new();
        for needle in [
            "/afterbuy/",
            "/tajax/",
            "auktionsliste.aspx",
            "defaultpage.js",
            "fl_full_js.js",
        ] {
            let mut start = 0usize;
            while let Some(rel) = lower[start..].find(needle) {
                let pos = start + rel;
                let tail = &source[pos..];
                let end = tail
                    .find(['"', '\'', ' ', '\n', '\r', '\t', '<', '>'])
                    .unwrap_or(tail.len());
                let candidate = tail[..end].trim().to_string();
                if !candidate.is_empty() && !out.iter().any(|v| v == &candidate) {
                    out.push(candidate);
                }
                start = pos + needle.len();
                if out.len() >= 20 {
                    return out;
                }
            }
        }
        out
    }

    let lower = html.to_lowercase();
    let first_iframe_src = if let Some(idx) = lower.find("<iframe") {
        extract_attr(&html[idx..], "src")
    } else {
        None
    };
    let html_sample = html.chars().take(4000).collect::<String>();
    let html_tail_sample = html
        .chars()
        .rev()
        .take(4000)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    let kid_occurrences = lower.matches(&kid_number.to_lowercase()).count();
    AfterbuyKidDebugDto {
        html_length: html.len(),
        has_seller_overview_row: lower.contains("seller-overview-table-frow"),
        has_data_row_item_id: lower.contains("data-row-item-id"),
        has_art_edit_id: lower.contains("art=edit&id=") || lower.contains("art=edit&amp;id="),
        has_iframe: lower.contains("<iframe"),
        first_iframe_src,
        html_sample,
        html_tail_sample,
        kid_occurrences,
        candidate_urls: collect_candidate_urls(html),
    }
}

pub(crate) fn build_afterbuy_kid_search_urls(
    farm_host: &str,
    webayname: &str,
    kid_number: &str,
) -> Result<Vec<String>, (StatusCode, Json<ErrorResponse>)> {
    fn kid_search_terms(kid_number: &str) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        let raw = kid_number.trim();
        if raw.is_empty() {
            return out;
        }
        out.push(raw.to_string());
        let no_prefix = raw
            .trim_start_matches("KID-")
            .trim_start_matches("kid-")
            .trim();
        if !no_prefix.is_empty() && !out.iter().any(|v| v.eq_ignore_ascii_case(no_prefix)) {
            out.push(no_prefix.to_string());
        }
        let digits_only: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
        if digits_only.len() >= 4 && !out.iter().any(|v| v == &digits_only) {
            out.push(digits_only);
        }
        out
    }

    fn build_single_url(
        farm_host: &str,
        webayname: &str,
        awsuchwort: &str,
        awre_nummer: &str,
        awdyn_search_field1: &str,
    ) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
        let mut url =
            reqwest::Url::parse(&format!("https://{farm_host}/afterbuy/auktionsliste.aspx"))
                .map_err(|error| internal_error(format!("invalid afterbuy url: {error}")))?;
        url.query_pairs_mut()
            .append_pair("AWebayname", webayname)
            .append_pair("AWFilter", "0")
            .append_pair("AWSuchwort", awsuchwort)
            .append_pair("AWRENummer", awre_nummer)
            .append_pair("AWFilter2", "0")
            .append_pair("awmaxart", "10")
            .append_pair("maxgesamt", "500")
            .append_pair("AWEmail", "")
            .append_pair("AWDatumVon", "")
            .append_pair("AWDatumBis", "")
            .append_pair("AWBezug", "EndeDerAuktion")
            .append_pair("AWPLZ", "")
            .append_pair("AWBetrag", "")
            .append_pair("AWBetragBezug", "1")
            .append_pair("AWStammID", "")
            .append_pair("awCountryGroup", "")
            .append_pair("AWLaenderkennung", "")
            .append_pair("AWLaenderkennungBezug", "rechnung")
            .append_pair("AWLabelDynSearchField1", "ShippingAddress")
            .append_pair("AWDynSearchField1", awdyn_search_field1)
            .append_pair("AWeBaySubAccount", "-1")
            .append_pair("AWLabelDynSearchField2", "PaymentStatus")
            .append_pair("AWDynSearchField2", "")
            .append_pair("AWDynamicSorting", "0")
            .append_pair("AWLabelDynSearchField3", "PaymentShipMethod")
            .append_pair("AWDynSearchField3", "")
            .append_pair("AWshowall", "ON")
            .append_pair("searchUserTag1", "0")
            .append_pair("searchUserTag2", "0")
            .append_pair("searchUserTag3", "0")
            .append_pair("searchUserTag4", "0")
            .append_pair("killordersession", "0")
            .append_pair("art", "SetAuswahl");
        Ok(url.to_string())
    }

    let mut urls = Vec::<String>::new();
    // Primary variant from real browser flow: KID is passed as AWebayname.
    urls.push(build_single_url(farm_host, kid_number, "", "", "")?);
    // Keep account variant as fallback.
    urls.push(build_single_url(farm_host, webayname, "", "", "")?);
    let terms = kid_search_terms(kid_number);
    for term in terms {
        urls.push(build_single_url(
            farm_host,
            webayname,
            term.as_str(),
            "",
            "",
        )?);
        urls.push(build_single_url(
            farm_host,
            webayname,
            "",
            term.as_str(),
            "",
        )?);
        urls.push(build_single_url(
            farm_host,
            webayname,
            term.as_str(),
            term.as_str(),
            "",
        )?);
        urls.push(build_single_url(
            farm_host,
            webayname,
            "",
            "",
            term.as_str(),
        )?);
        urls.push(build_single_url(
            farm_host,
            webayname,
            "",
            term.as_str(),
            term.as_str(),
        )?);
        // Additional fallback: KID as account key + search filters.
        urls.push(build_single_url(farm_host, term.as_str(), "", "", "")?);
    }
    urls.sort();
    urls.dedup();
    Ok(urls)
}

pub(crate) fn build_afterbuy_kid_primary_post_body(kid_number: &str) -> String {
    let params = vec![
        ("AWebayname".to_string(), kid_number.to_string()),
        ("AWFilter".to_string(), "0".to_string()),
        ("AWSuchwort".to_string(), "".to_string()),
        ("AWRENummer".to_string(), "".to_string()),
        ("AWFilter2".to_string(), "0".to_string()),
        ("awmaxart".to_string(), "10".to_string()),
        ("maxgesamt".to_string(), "500".to_string()),
        ("AWEmail".to_string(), "".to_string()),
        ("AWDatumVon".to_string(), "".to_string()),
        ("AWDatumBis".to_string(), "".to_string()),
        ("AWBezug".to_string(), "EndeDerAuktion".to_string()),
        ("AWPLZ".to_string(), "".to_string()),
        ("AWBetrag".to_string(), "".to_string()),
        ("AWBetragBezug".to_string(), "1".to_string()),
        ("AWStammID".to_string(), "".to_string()),
        ("awCountryGroup".to_string(), "".to_string()),
        ("AWLaenderkennung".to_string(), "".to_string()),
        ("AWLaenderkennungBezug".to_string(), "rechnung".to_string()),
        (
            "AWLabelDynSearchField1".to_string(),
            "ShippingAddress".to_string(),
        ),
        ("AWDynSearchField1".to_string(), "".to_string()),
        ("AWeBaySubAccount".to_string(), "-1".to_string()),
        (
            "AWLabelDynSearchField2".to_string(),
            "PaymentStatus".to_string(),
        ),
        ("AWDynSearchField2".to_string(), "".to_string()),
        ("AWDynamicSorting".to_string(), "0".to_string()),
        (
            "AWLabelDynSearchField3".to_string(),
            "PaymentShipMethod".to_string(),
        ),
        ("AWDynSearchField3".to_string(), "".to_string()),
        ("AWshowall".to_string(), "ON".to_string()),
        ("searchUserTag1".to_string(), "0".to_string()),
        ("searchUserTag2".to_string(), "0".to_string()),
        ("searchUserTag3".to_string(), "0".to_string()),
        ("searchUserTag4".to_string(), "0".to_string()),
        ("killordersession".to_string(), "0".to_string()),
        ("art".to_string(), "SetAuswahl".to_string()),
    ];
    serde_urlencoded::to_string(params).unwrap_or_default()
}

pub(crate) fn build_farm_kid_search_login_url(
    farm_host: &str,
    kid_number: &str,
    login: &str,
) -> String {
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
            &format!("/afterbuy/auktionsliste.aspx?AWRENummer={kid_number}&art=SetAuswahl"),
        );
    url.to_string()
}

pub(crate) fn is_afterbuy_kid_search_usable(result: &AfterbuyFetchResult, kid_number: &str) -> bool {
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
    let lower = result.page_html.to_lowercase();
    if lower.trim().is_empty() {
        return false;
    }
    lower.contains("seller-overview-table-frow")
        || lower.contains("data-row-item-id")
        || lower.contains(&kid_number.to_lowercase())
}

#[derive(Clone)]
pub(crate) struct AfterbuyKidSearchAttempt {
    pub(crate) display_url: String,
    pub(crate) request_url: String,
    pub(crate) post_body: Option<String>,
}
