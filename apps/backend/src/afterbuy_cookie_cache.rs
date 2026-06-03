use axum::{http::StatusCode, Json};

use crate::{internal_error, ErrorResponse};

pub(crate) fn read_cookie_cache(cookie_cache_file: &str) -> Option<String> {
    std::fs::read_to_string(cookie_cache_file)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub(crate) async fn write_cookie_cache(
    cookie_cache_file: &str,
    cookie_header: &str,
) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    if let Some(parent) = std::path::Path::new(cookie_cache_file).parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent).await.map_err(|error| {
                internal_error(format!("failed to create cookie cache dir: {error}"))
            })?;
        }
    }
    tokio::fs::write(cookie_cache_file, cookie_header)
        .await
        .map_err(|error| internal_error(format!("failed to write cookie cache file: {error}")))?;
    Ok(())
}
