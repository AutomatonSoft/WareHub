use serde_json::Value;
use std::{
    env,
    path::{Path as FsPath, PathBuf},
};

fn collect_json_files(root: &FsPath, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_json_files(&path, out);
            continue;
        }
        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("json"))
            .unwrap_or(false)
        {
            out.push(path);
        }
    }
}

fn text_from_json(value: &Value) -> Option<String> {
    match value {
        Value::String(v) => {
            let t = v.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        Value::Number(v) => Some(v.to_string()),
        _ => None,
    }
}

fn key_is_sku_like(key: &str) -> bool {
    matches!(
        key,
        "sku"
            | "scu"
            | "product_sku"
            | "herstellernummer"
            | "manufacturer_no"
            | "article_no"
            | "artikelnummer"
            | "item_no"
            | "itemnumber"
    )
}

fn append_candidate_image_url(dst: &mut Vec<String>, raw: &str) {
    let value = raw.trim();
    if value.is_empty() {
        return;
    }
    if !dst.iter().any(|v| v.eq_ignore_ascii_case(value)) {
        dst.push(value.to_string());
    }
}

fn extract_image_candidates(value: &Value, dst: &mut Vec<String>) {
    match value {
        Value::String(v) => {
            // Some sources store multiple urls in one string.
            for token in v.split(['|', ';', ',']) {
                append_candidate_image_url(dst, token);
            }
        }
        Value::Array(values) => {
            for item in values {
                extract_image_candidates(item, dst);
            }
        }
        Value::Object(map) => {
            for inner in map.values() {
                extract_image_candidates(inner, dst);
            }
        }
        _ => {}
    }
}

fn find_images_in_product_object(map: &serde_json::Map<String, Value>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();

    // 1) Main image: GalleryURL
    if let Some(v) = map.get("GalleryURL").or_else(|| map.get("galleryurl")) {
        extract_image_candidates(v, &mut out);
    }
    // 2) fallback: PictureURL
    if out.is_empty() {
        if let Some(v) = map.get("PictureURL").or_else(|| map.get("pictureurl")) {
            extract_image_candidates(v, &mut out);
        }
    }
    // 3) Additional images: pictureurls
    if let Some(v) = map.get("pictureurls").or_else(|| map.get("PictureURLs")) {
        extract_image_candidates(v, &mut out);
    }

    out
}

fn find_images_for_sku_value(value: &Value, sku_lower: &str) -> Option<Vec<String>> {
    match value {
        Value::Object(map) => {
            let mut is_match = false;
            for (key, v) in map {
                let key_norm = key.trim().to_ascii_lowercase();
                if !key_is_sku_like(&key_norm) {
                    continue;
                }
                if let Some(text) = text_from_json(v) {
                    if text.trim().eq_ignore_ascii_case(sku_lower) {
                        is_match = true;
                        break;
                    }
                }
            }

            if is_match {
                let found = find_images_in_product_object(map);
                if !found.is_empty() {
                    return Some(found);
                }
            }

            for child in map.values() {
                if let Some(found) = find_images_for_sku_value(child, sku_lower) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(items) => {
            for item in items {
                if let Some(found) = find_images_for_sku_value(item, sku_lower) {
                    return Some(found);
                }
            }
            None
        }
        _ => None,
    }
}

fn normalize_found_image_url(raw: &str, base_url: Option<&str>) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") || trimmed.starts_with('/')
    {
        return Some(trimmed.to_string());
    }
    let base = base_url.unwrap_or_default().trim().trim_end_matches('/');
    if base.is_empty() {
        return None;
    }
    Some(format!("{base}/{}", trimmed.trim_start_matches('/')))
}

fn build_sku_lookup_candidates(raw: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let sku = raw.trim();
    if sku.is_empty() {
        return out;
    }
    out.push(sku.to_ascii_lowercase());

    // Afterbuy often prefixes manufacturer numbers with JVM.
    let upper = sku.to_ascii_uppercase();
    if upper.starts_with("JVM") && sku.len() > 3 {
        let stripped = sku[3..].trim();
        if !stripped.is_empty() {
            let normalized = stripped.to_ascii_lowercase();
            if !out.iter().any(|v| v == &normalized) {
                out.push(normalized);
            }
        }
    }

    out
}

pub(crate) async fn find_product_image_url_by_sku(sku: Option<&str>) -> Option<String> {
    let needle = sku?.trim();
    if needle.is_empty() {
        return None;
    }
    let sku_candidates = build_sku_lookup_candidates(needle);
    if sku_candidates.is_empty() {
        return None;
    }
    let base_url = env::var("PRODUCTBASE_IMAGE_BASE_URL").ok();
    let jv_dir = env::var("PRODUCTBASE_JV_JSON_DIR")
        .unwrap_or_else(|_| "/var/lib/productbaseapi/data/JV/JV_LISTER/JV_NEW/JSON".to_string());
    let xl_dir = env::var("PRODUCTBASE_XL_JSON_DIR")
        .unwrap_or_else(|_| "/var/lib/productbaseapi/data/XL/XL_LISTER/XL_NEW/JSON".to_string());

    tokio::task::spawn_blocking(move || {
        let roots = [jv_dir, xl_dir];
        for root in roots {
            let root_path = FsPath::new(&root);
            if !root_path.exists() {
                continue;
            }
            let mut files = Vec::<PathBuf>::new();
            collect_json_files(root_path, &mut files);

            for file in files {
                let Ok(body) = std::fs::read_to_string(&file) else {
                    continue;
                };
                let Ok(json) = serde_json::from_str::<Value>(&body) else {
                    continue;
                };
                for candidate in &sku_candidates {
                    if let Some(raw_urls) = find_images_for_sku_value(&json, candidate) {
                        let mut normalized: Vec<String> = Vec::new();
                        for raw in raw_urls {
                            if let Some(url) = normalize_found_image_url(&raw, base_url.as_deref())
                            {
                                if !normalized.iter().any(|v| v.eq_ignore_ascii_case(&url)) {
                                    normalized.push(url);
                                }
                            }
                        }
                        if normalized.is_empty() {
                            continue;
                        }
                        if normalized.len() == 1 {
                            return normalized.first().cloned();
                        }
                        return serde_json::to_string(&normalized).ok();
                    }
                }
            }
        }
        None
    })
    .await
    .ok()
    .flatten()
}
