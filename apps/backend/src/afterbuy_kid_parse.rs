use std::collections::HashSet;

use crate::{
    afterbuy_html::{decode_html_entities, extract_attr},
    AfterbuyKidOrderMatchDto,
};

pub(crate) fn parse_afterbuy_kid_matches(
    html: &str,
    kid_hint: Option<&str>,
) -> Vec<AfterbuyKidOrderMatchDto> {
    fn is_reasonable_order_id(value: &str) -> bool {
        let trimmed = value.trim();
        if trimmed.len() < 4 || trimmed.len() > 16 {
            return false;
        }
        // For KID lookup we only keep numeric order ids to avoid UI element ids like "table9".
        if !trimmed.chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        true
    }

    fn collect_ids_after_pattern(
        source: &str,
        pattern: &str,
        seen: &mut HashSet<String>,
        out: &mut Vec<AfterbuyKidOrderMatchDto>,
    ) {
        let lower = source.to_lowercase();
        let mut start = 0usize;
        while let Some(rel) = lower[start..].find(pattern) {
            let mut pos = start + rel + pattern.len();
            let bytes = source.as_bytes();
            while pos < bytes.len() {
                let ch = bytes[pos] as char;
                if ch == '"'
                    || ch == '\''
                    || ch == '='
                    || ch == ':'
                    || ch == '\\'
                    || ch.is_whitespace()
                {
                    pos += 1;
                    continue;
                }
                break;
            }

            let mut end = pos;
            while end < bytes.len() {
                let ch = bytes[end] as char;
                if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                    end += 1;
                    continue;
                }
                break;
            }

            if end > pos {
                let candidate = source[pos..end].trim().to_string();
                if is_reasonable_order_id(&candidate) && !seen.contains(&candidate) {
                    seen.insert(candidate.clone());
                    out.push(AfterbuyKidOrderMatchDto {
                        title: format!("Order {candidate}"),
                        order_id: candidate,
                    });
                }
            }
            start = end.max(pos + 1);
        }
    }

    fn strip_html_tags(input: &str) -> String {
        let mut out = String::with_capacity(input.len());
        let mut in_tag = false;
        for ch in input.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => {
                    in_tag = false;
                    out.push(' ');
                }
                _ if !in_tag => out.push(ch),
                _ => {}
            }
        }
        out
    }

    fn normalize_spaces(input: &str) -> String {
        input.split_whitespace().collect::<Vec<&str>>().join(" ")
    }

    fn normalize_title(raw: &str) -> String {
        let cleaned = normalize_spaces(&strip_html_tags(&decode_html_entities(raw)));
        let trimmed = cleaned.trim();
        let mut parts = trimmed.splitn(2, ' ');
        let first = parts.next().unwrap_or_default();
        let rest = parts.next().unwrap_or_default().trim();
        let first_lower = first.to_ascii_lowercase();
        let looks_like_qty = first_lower.ends_with('x')
            && first_lower
                .trim_end_matches('x')
                .chars()
                .all(|c| c.is_ascii_digit());
        if looks_like_qty && !rest.is_empty() {
            return rest.to_string();
        }
        trimmed.to_string()
    }

    fn extract_row_title(row_html: &str, order_id: &str) -> String {
        // Main source: title is rendered as <div ... white-space: normal;><b>...</b></div>
        if let Some(marker_pos) = row_html.find("white-space: normal") {
            let tail = &row_html[marker_pos..];
            if let Some(b_open_rel) = tail.find("<b>") {
                let b_content = &tail[b_open_rel + 3..];
                if let Some(b_close_rel) = b_content.find("</b>") {
                    let raw = &b_content[..b_close_rel];
                    let title = normalize_title(raw);
                    if !title.is_empty() {
                        return title;
                    }
                }
            }
        }

        // Fallback: first reasonably long <b>...</b> in row.
        let mut scan = row_html;
        while let Some(b_open) = scan.find("<b>") {
            let content = &scan[b_open + 3..];
            let Some(b_close) = content.find("</b>") else {
                break;
            };
            let raw = &content[..b_close];
            let candidate = normalize_title(raw);
            if candidate.len() >= 8 && candidate != "Order" {
                return candidate;
            }
            scan = &content[b_close + 4..];
        }

        // Last fallback.
        let cleaned = normalize_title(row_html);
        if cleaned.is_empty() {
            format!("Order {order_id}")
        } else {
            cleaned
        }
    }

    let mut out: Vec<AfterbuyKidOrderMatchDto> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let normalized = html.replace("<TR", "<tr").replace("<Tr", "<tr");
    let normalized_lower = normalized.to_lowercase();
    let decoded_html = decode_html_entities(html);

    let mut scan_pos = 0usize;
    while let Some(rel) = normalized_lower[scan_pos..].find("seller-overview-table-frow") {
        let row_start = scan_pos + rel;
        let row_end = if let Some(next_rel) = normalized_lower
            [row_start + "seller-overview-table-frow".len()..]
            .find("seller-overview-table-frow")
        {
            row_start + "seller-overview-table-frow".len() + next_rel
        } else {
            normalized.len()
        };
        let row = &normalized[row_start..row_end];
        let order_id = extract_attr(row, "data-row-item-id")
            .or_else(|| extract_attr(row, "data-row-item-Id"))
            .or_else(|| extract_attr(row, "DATA-ROW-ITEM-ID"))
            .unwrap_or_default()
            .trim()
            .to_string();
        if !is_reasonable_order_id(&order_id) {
            scan_pos = row_end;
            continue;
        }
        if seen.contains(&order_id) {
            scan_pos = row_end;
            continue;
        }

        let title = extract_row_title(row, &order_id);
        seen.insert(order_id.clone());
        out.push(AfterbuyKidOrderMatchDto { order_id, title });
        scan_pos = row_end;
    }

    if out.is_empty() {
        // Fallback: parse any element containing data-row-item-id, even outside expected table rows.
        let mut start = 0usize;
        while let Some(rel) = normalized_lower[start..].find("data-row-item-id=") {
            let pos = start + rel;
            let tail = &normalized[pos..];
            let order_id = extract_attr(tail, "data-row-item-id")
                .or_else(|| extract_attr(tail, "DATA-ROW-ITEM-ID"))
                .unwrap_or_default()
                .trim()
                .to_string();
            if !order_id.is_empty()
                && order_id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                && !seen.contains(&order_id)
            {
                seen.insert(order_id.clone());
                out.push(AfterbuyKidOrderMatchDto {
                    title: format!("Order {order_id}"),
                    order_id,
                });
            }
            start = pos + "data-row-item-id=".len();
        }
    }

    if out.is_empty() {
        // Strict extraction by data-row-item-id in raw/encoded/escaped variants.
        collect_ids_after_pattern(html, "data-row-item-id", &mut seen, &mut out);
        collect_ids_after_pattern(html, "data-row-item-id\\", &mut seen, &mut out);
        collect_ids_after_pattern(html, "data-row-item-id\\u003d", &mut seen, &mut out);
        collect_ids_after_pattern(html, "data-row-item-id\\x3d", &mut seen, &mut out);
        collect_ids_after_pattern(&decoded_html, "data-row-item-id", &mut seen, &mut out);
        collect_ids_after_pattern(&decoded_html, "data-row-item-id\\", &mut seen, &mut out);
        collect_ids_after_pattern(html, "row-item-id", &mut seen, &mut out);
    }

    let _ = kid_hint;

    // Prefer real marketplace order ids (commonly long numeric values).
    // If we found any 9+ digit ids, keep only this subset.
    let has_long_numeric = out
        .iter()
        .any(|item| item.order_id.chars().all(|c| c.is_ascii_digit()) && item.order_id.len() >= 9);
    if has_long_numeric {
        out.retain(|item| {
            item.order_id.chars().all(|c| c.is_ascii_digit()) && item.order_id.len() >= 9
        });
    }

    out
}
