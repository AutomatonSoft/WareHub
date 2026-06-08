use crate::{afterbuy_html::decode_html_entities, AfterbuyOrderItemDto};

pub(crate) fn parse_afterbuy_order_items_fallback(html: &str) -> Vec<AfterbuyOrderItemDto> {
    fn strip_html_tags(input: &str) -> String {
        let mut out = String::with_capacity(input.len());
        let mut in_tag = false;
        for ch in input.chars() {
            match ch {
                '<' => {
                    in_tag = true;
                    out.push('\n');
                }
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

    fn consume_digits(input: &str) -> (String, &str) {
        let trimmed = input.trim_start();
        let mut end = 0usize;
        for (idx, ch) in trimmed.char_indices() {
            if ch.is_ascii_digit() {
                end = idx + ch.len_utf8();
            } else {
                break;
            }
        }
        if end == 0 {
            return (String::new(), trimmed);
        }
        (trimmed[..end].to_string(), &trimmed[end..])
    }

    fn parse_article_line(line: &str) -> Option<(Option<String>, i32, String)> {
        let nr_idx = line.find("Nr.")?;
        let mut rest = line[nr_idx + 3..].trim_start();
        let (article_no_raw, after_article) = consume_digits(rest);
        let article_no = if article_no_raw.is_empty() {
            None
        } else {
            Some(article_no_raw)
        };
        rest = after_article
            .trim_start_matches(&[':', '-', '.', ')', '('][..])
            .trim_start();

        let (qty_raw, after_qty) = consume_digits(rest);
        let mut quantity = 1i32;
        let mut title_start = rest;
        if !qty_raw.is_empty() {
            if let Ok(parsed) = qty_raw.parse::<i32>() {
                quantity = parsed.clamp(1, 10_000);
            }
            let rem = after_qty.trim_start();
            if rem.starts_with('x') || rem.starts_with('X') || rem.starts_with('?') {
                title_start = rem[1..].trim_start();
            } else {
                title_start = rem;
            }
        }

        let mut title = title_start.to_string();
        for cut in [
            "Verkaufsdatum",
            "Verkaufspreis",
            "SKU:",
            "eBay-Bestellnummer",
        ] {
            if let Some(i) = title.find(cut) {
                title.truncate(i);
            }
        }
        title = normalize_spaces(title.trim());
        Some((article_no, quantity, title))
    }

    fn strip_qty_prefix(value: &str) -> String {
        value
            .trim()
            .trim_start_matches(|c: char| c.is_ascii_digit() || c == 'x' || c == ' ')
            .trim_start()
            .to_string()
    }

    fn is_sku_attribute(title: &str) -> bool {
        strip_qty_prefix(title)
            .to_lowercase()
            .starts_with("herstellernummer")
    }

    fn is_size_attribute(title: &str) -> bool {
        let lower = strip_qty_prefix(title).to_lowercase();
        lower.starts_with("ca.")
            || lower.contains(" x ca.")
            || lower.contains("grГ¶Гџe")
            || lower.contains("gro?e")
            || lower.contains("size")
    }

    fn is_color_attribute(title: &str) -> bool {
        let lower = strip_qty_prefix(title).to_lowercase();
        lower.starts_with("material / farbe")
            || lower.starts_with("farbe")
            || lower.contains("material / color")
            || lower.starts_with("color")
    }

    fn extract_attr_value(title: &str, raw_prefix: &str) -> String {
        let stripped = strip_qty_prefix(title);
        let trimmed = stripped.as_str();
        if let Some(rest) = trimmed.strip_prefix(raw_prefix) {
            return rest.trim_start_matches([':', ' ']).trim().to_string();
        }
        if let Some(pos) = trimmed.find(':') {
            return trimmed[pos + 1..].trim().to_string();
        }
        trimmed.to_string()
    }

    fn looks_like_datetime_line(value: &str) -> bool {
        let t = value.trim();
        if t.len() < 10 || t.len() > 40 {
            return false;
        }
        let digits = t.chars().filter(|c| c.is_ascii_digit()).count();
        digits >= 8 && t.contains('.') && t.contains(':')
    }

    fn is_non_product_title(value: &str) -> bool {
        let lower = value.trim().to_lowercase();
        if lower.is_empty() {
            return true;
        }
        if lower.contains("verkaufspreis")
            || lower.contains("verkaufsdatum")
            || lower.starts_with("sku ")
            || lower.starts_with("sku:")
            || lower.starts_with("ean ")
            || lower.starts_with("ean:")
            || lower.contains("ebay-bestellnummer")
            || lower.contains("management center")
            || lower.starts_with("kundenwunsch")
            || lower.contains(" gratis ")
            || lower.contains(" gratis")
            || lower.starts_with("eur ")
            || lower.contains("window.open(")
            || lower.contains("webkit-keyframes")
            || lower.contains("toolbar=no")
        {
            return true;
        }
        if is_sku_attribute(&lower) || is_size_attribute(&lower) || is_color_attribute(&lower) {
            return true;
        }
        looks_like_datetime_line(&lower)
    }

    fn parse_eur_amount(value: &str) -> Option<f64> {
        let lower = value.to_lowercase();
        let eur_pos = lower.find("eur")?;
        let tail = value[eur_pos + 3..].trim();
        let token = tail.split_whitespace().next()?.trim();
        let normalized = token.replace('.', "").replace(',', ".");
        normalized.parse::<f64>().ok()
    }

    fn is_attribute_item(item: &AfterbuyOrderItemDto) -> bool {
        if is_non_product_title(&item.title) {
            return true;
        }
        if let Some(price) = &item.price {
            if let Some(amount) = parse_eur_amount(price) {
                if amount <= 0.0001 {
                    return true;
                }
            }
        }
        false
    }

    let decoded = decode_html_entities(html);
    let stripped = strip_html_tags(&decoded);
    let lines: Vec<String> = stripped
        .lines()
        .map(normalize_spaces)
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .collect();

    let mut out: Vec<AfterbuyOrderItemDto> = Vec::new();
    let mut idx = 0usize;
    while idx < lines.len() {
        let line = &lines[idx];
        if !line.contains("Nr.") {
            idx += 1;
            continue;
        }

        let Some((article_no, quantity, mut title)) = parse_article_line(line) else {
            idx += 1;
            continue;
        };

        let mut sku: Option<String> = None;
        let mut ean: Option<String> = None;
        let mut price: Option<String> = None;
        let mut sale_date: Option<String> = None;
        let mut size: Option<String> = None;
        let mut color: Option<String> = None;

        let mut j = idx + 1;
        let mut title_candidates: Vec<String> = Vec::new();
        let mut expect_sale_date_value = false;
        let mut expect_price_value = false;
        while j < lines.len() {
            let next = &lines[j];
            if next.contains("Nr.") {
                break;
            }
            let lower = next.to_lowercase();

            let is_meta_line = lower.contains("verkaufspreis")
                || lower.contains("verkaufsdatum")
                || lower.contains("sku:")
                || lower.contains("ebay-bestellnummer")
                || lower.contains("herstellernummer")
                || lower.contains("ean");
            if !is_meta_line {
                let candidate = normalize_spaces(next);
                if candidate.len() >= 3 && !is_non_product_title(&candidate) {
                    title_candidates.push(candidate);
                }
            }

            if let Some(pos) = lower.find("sku:") {
                let raw = next[pos + 4..].trim();
                if !raw.is_empty() {
                    sku = Some(raw.to_string());
                }
            }
            if let Some(pos) = lower.find("ean") {
                let raw = next[pos + 3..].trim_start_matches([':', ' ']);
                let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
                if (8..=14).contains(&digits.len()) {
                    ean = Some(digits);
                }
            }
            if let Some(pos) = lower.find("herstellernummer") {
                let raw = next[pos + "herstellernummer".len()..]
                    .trim_start_matches([':', ' '])
                    .trim();
                if !raw.is_empty() && sku.is_none() {
                    sku = Some(raw.to_string());
                }
            }
            if lower.contains("verkaufspreis") {
                let p = next.trim();
                if !p.is_empty() {
                    price = Some(p.to_string());
                }
                expect_price_value = true;
            }
            if lower.contains("verkaufsdatum") {
                let d = next.trim();
                if !d.is_empty() {
                    sale_date = Some(d.to_string());
                }
                expect_sale_date_value = true;
            } else if expect_sale_date_value && looks_like_datetime_line(next) {
                sale_date = Some(next.trim().to_string());
                expect_sale_date_value = false;
            } else if expect_price_value
                && (lower.contains("eur") || lower.contains("mwst") || lower.contains("provision"))
            {
                price = Some(next.trim().to_string());
                expect_price_value = false;
            }
            if color.is_none()
                && (lower.contains("material / farbe")
                    || lower.contains("farbe")
                    || lower.contains("color"))
            {
                color = Some(next.to_string());
            }
            if size.is_none()
                && (lower.contains(" x ca. ") || lower.contains("gro?e") || lower.contains("size"))
            {
                size = Some(next.to_string());
            }

            j += 1;
        }

        if title.len() < 3 {
            if let Some(candidate) = title_candidates.first() {
                title = candidate.clone();
            }
        }
        if title.len() < 3 {
            idx = j;
            continue;
        }
        let lower_title = title.to_lowercase();
        if size.is_none() && (lower_title.contains("gro?e") || lower_title.contains("size")) {
            size = Some(title.clone());
        }
        if color.is_none() && (lower_title.contains("farbe") || lower_title.contains("color")) {
            color = Some(title.clone());
        }

        let duplicate = out
            .iter()
            .any(|item| item.article_no == article_no && item.title.eq_ignore_ascii_case(&title));
        if duplicate {
            idx = j;
            continue;
        }

        out.push(AfterbuyOrderItemDto {
            article_no,
            sku,
            ean,
            title,
            size,
            color,
            price,
            sale_date,
            quantity,
        });
        idx = j;
    }

    let mut grouped: Vec<AfterbuyOrderItemDto> = Vec::new();
    for item in out {
        let title = item.title.trim().to_string();
        let is_attr = is_attribute_item(&item)
            || is_sku_attribute(&title)
            || is_size_attribute(&title)
            || is_color_attribute(&title);
        if is_attr {
            if let Some(prev) = grouped.last_mut() {
                if prev.sku.is_none() {
                    if let Some(raw_sku) = &item.sku {
                        if !raw_sku.trim().is_empty() {
                            prev.sku = Some(raw_sku.trim().to_string());
                        }
                    }
                }
                if prev.sku.is_none() && is_sku_attribute(&title) {
                    let value = extract_attr_value(&title, "Herstellernummer");
                    if !value.is_empty() {
                        prev.sku = Some(value);
                    }
                }

                if prev.size.is_none() {
                    if let Some(raw_size) = &item.size {
                        if !raw_size.trim().is_empty() {
                            prev.size = Some(raw_size.trim().to_string());
                        }
                    }
                }
                if prev.size.is_none() && is_size_attribute(&title) {
                    let value = extract_attr_value(&title, "ca.");
                    if !value.is_empty() {
                        prev.size = Some(value);
                    }
                }

                if prev.color.is_none() {
                    if let Some(raw_color) = &item.color {
                        if !raw_color.trim().is_empty() {
                            prev.color = Some(raw_color.trim().to_string());
                        }
                    }
                }
                if prev.color.is_none() && is_color_attribute(&title) {
                    let value = extract_attr_value(&title, "Material / Farbe");
                    if !value.is_empty() {
                        prev.color = Some(value);
                    }
                }
            }
            continue;
        }
        grouped.push(item);
    }

    grouped
}
