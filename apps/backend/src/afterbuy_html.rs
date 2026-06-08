use std::collections::BTreeMap;

pub(crate) fn extract_form_fields(html: &str) -> BTreeMap<String, String> {
    let normalized = html
        .replace("<INPUT", "<input")
        .replace("<Input", "<input")
        .replace("<TEXTAREA", "<textarea")
        .replace("<TextArea", "<textarea");
    let mut out = BTreeMap::new();
    for chunk in normalized.split("<input") {
        let name = extract_attr(chunk, "name")
            .or_else(|| extract_attr(chunk, "Name"))
            .or_else(|| extract_attr(chunk, "NAME"));
        let value = extract_attr(chunk, "value")
            .or_else(|| extract_attr(chunk, "Value"))
            .or_else(|| extract_attr(chunk, "VALUE"))
            .unwrap_or_default();
        if let Some(name) = name {
            if !name.trim().is_empty() {
                out.insert(name, value);
            }
        }
    }

    for chunk in normalized.split("<textarea") {
        let name = extract_attr(chunk, "name")
            .or_else(|| extract_attr(chunk, "Name"))
            .or_else(|| extract_attr(chunk, "NAME"));
        let Some(name) = name else {
            continue;
        };
        if name.trim().is_empty() {
            continue;
        }
        let value = if let Some(start) = chunk.find('>') {
            let rest = &chunk[start + 1..];
            if let Some(end) = rest.to_lowercase().find("</textarea>") {
                rest[..end].to_string()
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        out.insert(name, value);
    }

    out
}

pub(crate) fn extract_form_action(html: &str, fallback_url: &str) -> String {
    let normalized = html.replace("<FORM", "<form").replace("<Form", "<form");
    for chunk in normalized.split("<form") {
        if let Some(action) = extract_attr(chunk, "action")
            .or_else(|| extract_attr(chunk, "Action"))
            .or_else(|| extract_attr(chunk, "ACTION"))
        {
            if !action.trim().is_empty() {
                if action.starts_with("http://") || action.starts_with("https://") {
                    return action;
                }
                if action.starts_with('/') {
                    if let Ok(base) = reqwest::Url::parse(fallback_url) {
                        if let Ok(joined) = base.join(&action) {
                            return joined.to_string();
                        }
                    }
                }
            }
        }
    }
    fallback_url.to_string()
}

pub(crate) fn extract_form_method(html: &str) -> String {
    let normalized = html.replace("<FORM", "<form").replace("<Form", "<form");
    for chunk in normalized.split("<form") {
        if let Some(method) = extract_attr(chunk, "method")
            .or_else(|| extract_attr(chunk, "Method"))
            .or_else(|| extract_attr(chunk, "METHOD"))
        {
            let m = method.trim().to_lowercase();
            if m == "get" || m == "post" {
                return m;
            }
        }
    }
    "post".to_string()
}

pub(crate) fn extract_html_redirect_target(html: &str, fallback_url: &str) -> Option<String> {
    let lower = html.to_lowercase();

    if let Some(meta_idx) = lower.find("http-equiv=\"refresh\"") {
        let tail = &html[meta_idx..];
        if let Some(content) = extract_attr(tail, "content") {
            let content_lower = content.to_lowercase();
            if let Some(url_idx) = content_lower.find("url=") {
                let candidate = content[url_idx + 4..]
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'');
                if !candidate.is_empty() {
                    if let Ok(absolute) = reqwest::Url::parse(candidate) {
                        return Some(absolute.to_string());
                    }
                    if let Ok(base) = reqwest::Url::parse(fallback_url) {
                        if let Ok(joined) = base.join(candidate) {
                            return Some(joined.to_string());
                        }
                    }
                }
            }
        }
    }

    for marker in [
        "window.location.href=",
        "window.location=",
        "location.href=",
        "location=",
    ] {
        if let Some(idx) = lower.find(marker) {
            let rest = &html[idx + marker.len()..];
            let rest = rest.trim_start();
            let quote = rest.chars().next()?;
            if quote != '"' && quote != '\'' {
                continue;
            }
            let rest = &rest[1..];
            if let Some(end) = rest.find(quote) {
                let candidate = rest[..end].trim();
                if !candidate.is_empty() {
                    if let Ok(absolute) = reqwest::Url::parse(candidate) {
                        return Some(absolute.to_string());
                    }
                    if let Ok(base) = reqwest::Url::parse(fallback_url) {
                        if let Ok(joined) = base.join(candidate) {
                            return Some(joined.to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

pub(crate) fn extract_attr(chunk: &str, attr: &str) -> Option<String> {
    let lower_chunk = chunk.to_lowercase();
    let lower_attr = attr.to_lowercase();
    let bytes = chunk.as_bytes();
    let lower_bytes = lower_chunk.as_bytes();
    let attr_bytes = lower_attr.as_bytes();

    let mut i = 0usize;
    while i + attr_bytes.len() <= lower_bytes.len() {
        if &lower_bytes[i..i + attr_bytes.len()] != attr_bytes {
            i += 1;
            continue;
        }

        // Ensure token boundary before attr name.
        if i > 0 {
            let prev = lower_bytes[i - 1] as char;
            if prev.is_ascii_alphanumeric() || prev == '_' || prev == '-' {
                i += 1;
                continue;
            }
        }

        let mut p = i + attr_bytes.len();
        while p < bytes.len() && (bytes[p] as char).is_ascii_whitespace() {
            p += 1;
        }
        if p >= bytes.len() || bytes[p] != b'=' {
            i += 1;
            continue;
        }
        p += 1;
        while p < bytes.len() && (bytes[p] as char).is_ascii_whitespace() {
            p += 1;
        }
        if p >= bytes.len() {
            return Some(String::new());
        }

        let first = bytes[p] as char;
        if first == '"' || first == '\'' {
            p += 1;
            let start = p;
            while p < bytes.len() && (bytes[p] as char) != first {
                p += 1;
            }
            return Some(decode_html_entities(&chunk[start..p]));
        }

        let start = p;
        while p < bytes.len() {
            let ch = bytes[p] as char;
            if ch.is_ascii_whitespace() || ch == '>' || ch == '/' {
                break;
            }
            p += 1;
        }
        return Some(decode_html_entities(&chunk[start..p]));
    }

    None
}

pub(crate) fn decode_html_entities(value: &str) -> String {
    fn decode_named_entity(name: &str) -> Option<char> {
        match name {
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "amp" => Some('&'),
            "nbsp" => Some(' '),
            "auml" => Some('a'),
            "Auml" => Some('A'),
            "ouml" => Some('o'),
            "Ouml" => Some('O'),
            "uuml" => Some('u'),
            "Uuml" => Some('U'),
            "szlig" => Some('?'),
            _ => None,
        }
    }

    let mut out = String::with_capacity(value.len());
    let chars: Vec<char> = value.chars().collect();
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] != '&' {
            out.push(chars[i]);
            i += 1;
            continue;
        }

        let mut j = i + 1;
        while j < chars.len() && chars[j] != ';' && j - i <= 12 {
            j += 1;
        }
        if j >= chars.len() || chars[j] != ';' {
            out.push(chars[i]);
            i += 1;
            continue;
        }

        let entity: String = chars[i + 1..j].iter().collect();
        let decoded = if let Some(hex) = entity
            .strip_prefix("#x")
            .or_else(|| entity.strip_prefix("#X"))
        {
            u32::from_str_radix(hex, 16).ok().and_then(char::from_u32)
        } else if let Some(dec) = entity.strip_prefix('#') {
            dec.parse::<u32>().ok().and_then(char::from_u32)
        } else {
            decode_named_entity(&entity)
        };

        if let Some(ch) = decoded {
            out.push(ch);
        } else {
            out.push('&');
            out.push_str(&entity);
            out.push(';');
        }
        i = j + 1;
    }

    out
}

pub(crate) fn extract_html_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title>")?;
    let end = lower[start + 7..].find("</title>")?;
    let title = &html[start + 7..start + 7 + end];
    let normalized = title.trim();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_string())
    }
}
