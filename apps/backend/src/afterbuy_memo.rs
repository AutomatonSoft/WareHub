use crate::afterbuy_html::decode_html_entities;

pub(crate) fn parse_afterbuy_memo(html: &str) -> Option<String> {
    fn normalize_memo_lines(input: &str) -> Option<String> {
        fn strip_html_chunks(mut value: String) -> String {
            while let Some(start) = value.find('<') {
                let Some(end_rel) = value[start..].find('>') else {
                    break;
                };
                let end = start + end_rel + 1;
                value.replace_range(start..end, " ");
            }
            value
        }

        let normalized = input
            .lines()
            .map(|line| strip_html_chunks(line.trim().to_string()))
            .map(|line| line.trim().trim_end_matches("</").trim().to_string())
            .map(|line| if line == "</" { String::new() } else { line })
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty())
            .collect::<Vec<String>>()
            .join("\n");
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    }

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

    let html_lower = html.to_lowercase();
    if let Some(textarea_pos) = html_lower.find("<textarea rows=\"5\" name=\"memo\"") {
        if let Some(open_end_rel) = html[textarea_pos..].find('>') {
            let content_start = textarea_pos + open_end_rel + 1;
            if let Some(close_rel) = html_lower[content_start..].find("</textarea>") {
                let content_end = content_start + close_rel;
                let raw_content = &html[content_start..content_end];
                let decoded = decode_html_entities(raw_content);
                if let Some(memo) = normalize_memo_lines(&decoded) {
                    return Some(memo);
                }
            }
        }
    }

    if let Some(memo_idx) = html_lower.find("memo (angaben vorhanden)") {
        if let Some(textarea_rel) = html_lower[memo_idx..].find("<textarea") {
            let textarea_start = memo_idx + textarea_rel;
            if let Some(open_end_rel) = html[textarea_start..].find('>') {
                let content_start = textarea_start + open_end_rel + 1;
                if let Some(close_rel) = html_lower[content_start..].find("</textarea>") {
                    let content_end = content_start + close_rel;
                    let raw_content = &html[content_start..content_end];
                    let decoded = decode_html_entities(raw_content);
                    if let Some(memo) = normalize_memo_lines(&decoded) {
                        return Some(memo);
                    }
                }
            }
        }
    }

    let decoded = decode_html_entities(html);
    let stripped = strip_html_tags(&decoded);
    let lines: Vec<String> = stripped
        .lines()
        .map(normalize_spaces)
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .collect();

    let mut memo_lines: Vec<String> = Vec::new();
    for line in &lines {
        let lower = line.to_lowercase();
        if lower.contains("kundenwunsch")
            || lower.contains("klient")
            || lower.contains("sitzflР“В¤che")
            || lower.contains("sitzflaeche")
        {
            memo_lines.push(line.clone());
        }
    }

    if memo_lines.is_empty() {
        return None;
    }

    memo_lines.dedup();
    normalize_memo_lines(&memo_lines.join("\n"))
}
