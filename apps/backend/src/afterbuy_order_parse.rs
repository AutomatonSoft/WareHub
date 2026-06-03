use crate::{
    afterbuy_order_parse_fallback::parse_afterbuy_order_items_fallback,
    afterbuy_html::decode_html_entities,
    AfterbuyOrderItemDto,
};

pub(crate) fn parse_afterbuy_order_items(html: &str) -> Vec<AfterbuyOrderItemDto> {
    fn normalize_spaces(input: &str) -> String {
        input.split_whitespace().collect::<Vec<&str>>().join(" ")
    }

    fn parse_eur_amount_panel(value: &str) -> Option<f64> {
        let lower = value.to_lowercase();
        let eur_pos = lower.find("eur")?;
        let tail = value[eur_pos + 3..].trim();
        let token = tail.split_whitespace().next()?.trim();
        let normalized = token.replace('.', "").replace(',', ".");
        normalized.parse::<f64>().ok()
    }

    fn extract_between<'a>(
        source: &'a str,
        from_marker: &str,
        end_marker: &str,
    ) -> Option<&'a str> {
        let start = source.find(from_marker)? + from_marker.len();
        let end_rel = source[start..].find(end_marker)?;
        Some(&source[start..start + end_rel])
    }

    fn panel_title(chunk: &str) -> Option<String> {
        let anchor = chunk.find("ab-content-head-padding").unwrap_or(0);
        let scoped = &chunk[anchor..];
        let raw = extract_between(scoped, "<strong>", "</strong>")?;
        let normalized = normalize_spaces(raw.trim());
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    }

    fn panel_sale_date(chunk: &str) -> Option<String> {
        let raw = extract_between(chunk, "Verkaufsdatum <strong>", "</strong>")?;
        let normalized = normalize_spaces(raw.trim());
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    }

    fn panel_price_text(chunk: &str) -> Option<String> {
        let footer_pos = chunk.find("panel-footer").unwrap_or(0);
        let footer = &chunk[footer_pos..];
        let mut search = 0usize;
        while let Some(rel) = footer[search..].find("<strong>") {
            let start = search + rel + "<strong>".len();
            let Some(end_rel) = footer[start..].find("</strong>") else {
                break;
            };
            let end = start + end_rel;
            let candidate = normalize_spaces(footer[start..end].trim());
            if candidate.to_lowercase().contains("eur") {
                return Some(candidate);
            }
            search = end + "</strong>".len();
        }
        None
    }

    fn parse_qty_title(input: &str) -> (i32, String) {
        let normalized = normalize_spaces(input.trim());
        let parts: Vec<&str> = normalized.splitn(3, ' ').collect();
        if parts.len() >= 3
            && parts[0].chars().all(|c| c.is_ascii_digit())
            && parts[1].eq_ignore_ascii_case("x")
        {
            let qty = parts[0].parse::<i32>().unwrap_or(1).clamp(1, 10_000);
            return (qty, parts[2].trim().to_string());
        }
        (1, normalized)
    }

    fn starts_with_attr(title: &str) -> bool {
        let lower = title.to_lowercase();
        lower.starts_with("herstellernummer")
            || lower.starts_with("ca.")
            || lower.starts_with("material / farbe")
            || lower.starts_with("farbe")
            || lower.starts_with("kundenwunsch")
            || lower.contains(" gratis")
            || lower.contains("pflegemittel")
    }

    // Preferred parser for Afterbuy "panel panel-default" blocks.
    let decoded_html = decode_html_entities(html);
    if decoded_html.contains("panel panel-default") {
        let mut parsed: Vec<AfterbuyOrderItemDto> = Vec::new();
        for chunk in decoded_html
            .split("<div class=\"panel panel-default\">")
            .skip(1)
        {
            let Some(raw_title) = panel_title(chunk) else {
                continue;
            };
            let (qty, title) = parse_qty_title(&raw_title);
            if title.is_empty() {
                continue;
            }

            let price_text = panel_price_text(chunk);
            let amount = price_text
                .as_deref()
                .and_then(parse_eur_amount_panel)
                .unwrap_or(0.0);
            let is_main = amount > 0.0001 && !starts_with_attr(&title);

            if is_main {
                parsed.push(AfterbuyOrderItemDto {
                    article_no: None,
                    sku: None,
                    ean: None,
                    title,
                    size: None,
                    color: None,
                    price: price_text,
                    sale_date: panel_sale_date(chunk),
                    quantity: qty,
                });
                continue;
            }

            let Some(last) = parsed.last_mut() else {
                continue;
            };
            let low_title = title.to_lowercase();
            if low_title.starts_with("herstellernummer") && last.sku.is_none() {
                let v = title
                    .split_once(':')
                    .map(|(_, b)| b.trim().to_string())
                    .unwrap_or_else(|| {
                        title.replacen("Herstellernummer", "", 1).trim().to_string()
                    });
                if !v.is_empty() {
                    last.sku = Some(v);
                }
            } else if (low_title.starts_with("ca.") || low_title.contains(" x "))
                && last.size.is_none()
            {
                last.size = Some(title);
            } else if (low_title.starts_with("material / farbe") || low_title.starts_with("farbe"))
                && last.color.is_none()
            {
                let v = title
                    .split_once(':')
                    .map(|(_, b)| b.trim().to_string())
                    .unwrap_or(title);
                if !v.is_empty() {
                    last.color = Some(v);
                }
            }
        }
        if !parsed.is_empty() {
            return parsed;
        }
    }

    parse_afterbuy_order_items_fallback(html)
}
