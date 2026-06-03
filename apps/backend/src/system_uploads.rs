use std::{env, io::Cursor};
use std::time::Duration;

use axum::{
    extract::{Multipart, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use suppaftp::{types::FileType, FtpStream};
use uuid::Uuid;

use crate::{
    auth::require_approved_user, internal_error, validation_error, AppState, ErrorResponse,
    UploadResponse,
};

#[derive(Debug, Deserialize, Default)]
pub(crate) struct UploadPhotoQuery {
    kind: Option<String>,
    name: Option<String>,
    folder: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum UploadKind {
    Product,
    Avatar,
}

#[derive(Clone, Debug)]
struct UploadStorageConfig {
    backend: String,
    ftp_host: Option<String>,
    ftp_user: Option<String>,
    ftp_pass: Option<String>,
    ftp_port: u16,
    ftp_root_dir: String,
    ftp_storage_root_dir: String,
    ftp_avatar_dir: String,
    ftp_public_base_url: Option<String>,
    ftp_retry_attempts: u8,
    ftp_retry_delay_ms: u64,
}

#[derive(Clone, Debug)]
struct UploadTarget {
    local_dir: String,
    ftp_dir: String,
    public_dir: String,
}

pub(crate) async fn upload_photo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<UploadPhotoQuery>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<UploadResponse>), (StatusCode, Json<ErrorResponse>)> {
    let _user = require_approved_user(&state, &headers).await?;
    let kind = parse_upload_kind(query.kind.as_deref())?;
    let config = load_upload_storage_config();
    let folder = normalize_folder_path(query.folder.as_deref());
    let target = build_upload_target(&state.app_env, kind, &config.ftp_avatar_dir, folder.as_deref());
    let custom_name = normalize_filename_part(query.name.as_deref());

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| internal_error(format!("failed to read multipart field: {error}")))?
    {
        let source_name = field.file_name().unwrap_or("").to_ascii_lowercase();
        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();
        if !is_supported_image(&source_name, &content_type) {
            continue;
        }

        let bytes = field
            .bytes()
            .await
            .map_err(|error| internal_error(format!("failed to read image bytes: {error}")))?;
        validate_image_size(bytes.len())?;

        let extension = detect_extension(&source_name, &content_type);
        let filename = match custom_name.as_deref() {
            Some(prefix) if !prefix.is_empty() => format!("{prefix}.{extension}"),
            _ => format!("{}.{}", Uuid::new_v4(), extension),
        };
        let public_url = store_upload(&config, &target, &filename, bytes.to_vec()).await?;

        return Ok((StatusCode::CREATED, Json(UploadResponse { url: public_url })));
    }

    Err(validation_error(
        "invalid_file",
        "no image file found in multipart payload",
    ))
}

fn parse_upload_kind(value: Option<&str>) -> Result<UploadKind, (StatusCode, Json<ErrorResponse>)> {
    match value.map(str::trim).filter(|raw| !raw.is_empty()) {
        None => Ok(UploadKind::Product),
        Some(raw) if raw.eq_ignore_ascii_case("avatar") => Ok(UploadKind::Avatar),
        Some(raw) if raw.eq_ignore_ascii_case("product") => Ok(UploadKind::Product),
        Some(_) => Err(validation_error(
            "invalid_kind",
            "kind must be one of: product, avatar",
        )),
    }
}

fn load_upload_storage_config() -> UploadStorageConfig {
    UploadStorageConfig {
        backend: env::var("UPLOAD_STORAGE_BACKEND")
            .unwrap_or_else(|_| "local".to_string())
            .trim()
            .to_ascii_lowercase(),
        ftp_host: env::var("UPLOAD_FTP_HOST")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        ftp_user: env::var("UPLOAD_FTP_USER")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        ftp_pass: env::var("UPLOAD_FTP_PASS")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        ftp_port: env::var("UPLOAD_FTP_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(21),
        ftp_root_dir: env::var("UPLOAD_FTP_ROOT_DIR")
            .unwrap_or_else(|_| "warehub".to_string())
            .trim_matches('/')
            .to_string(),
        ftp_storage_root_dir: env::var("UPLOAD_FTP_STORAGE_ROOT_DIR")
            .ok()
            .map(|v| v.trim().trim_matches('/').to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| {
                env::var("UPLOAD_FTP_ROOT_DIR")
                    .unwrap_or_else(|_| "warehub".to_string())
                    .trim_matches('/')
                    .to_string()
            }),
        ftp_avatar_dir: env::var("UPLOAD_FTP_AVATAR_DIR")
            .unwrap_or_else(|_| "avatar".to_string())
            .trim_matches('/')
            .to_string(),
        ftp_public_base_url: env::var("UPLOAD_FTP_PUBLIC_BASE_URL")
            .ok()
            .map(|v| v.trim().trim_end_matches('/').to_string())
            .filter(|v| !v.is_empty()),
        ftp_retry_attempts: env::var("UPLOAD_FTP_RETRY_ATTEMPTS")
            .ok()
            .and_then(|v| v.parse::<u8>().ok())
            .unwrap_or(3)
            .clamp(1, 5),
        ftp_retry_delay_ms: env::var("UPLOAD_FTP_RETRY_DELAY_MS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(700)
            .clamp(100, 5000),
    }
}

fn build_upload_target(
    app_env: &str,
    kind: UploadKind,
    ftp_avatar_dir: &str,
    folder: Option<&str>,
) -> UploadTarget {
    let env_dir = match app_env.to_ascii_lowercase().as_str() {
        "prod" => "prod",
        "dev" => "dev",
        _ => "stage",
    };
    let avatar_dir = ftp_avatar_dir.trim_matches('/');
    let avatar_dir = if avatar_dir.is_empty() {
        "avatar"
    } else {
        avatar_dir
    };

    let base = match kind {
        UploadKind::Product => UploadTarget {
            local_dir: "uploads".to_string(),
            ftp_dir: env_dir.to_string(),
            public_dir: env_dir.to_string(),
        },
        UploadKind::Avatar => UploadTarget {
            local_dir: format!("uploads/{avatar_dir}"),
            ftp_dir: format!("{env_dir}/{avatar_dir}"),
            public_dir: format!("{env_dir}/{avatar_dir}"),
        },
    };

    append_folder_to_target(base, folder)
}

fn is_supported_image(source_name: &str, content_type: &str) -> bool {
    let is_image_by_name = source_name.ends_with(".jpg")
        || source_name.ends_with(".jpeg")
        || source_name.ends_with(".png")
        || source_name.ends_with(".webp")
        || source_name.ends_with(".gif");
    content_type.starts_with("image/") || is_image_by_name
}

fn validate_image_size(size: usize) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    if size == 0 {
        return Err(validation_error("invalid_file", "uploaded image is empty"));
    }
    if size > 10 * 1024 * 1024 {
        return Err(validation_error(
            "invalid_file",
            "image exceeds 10MB upload limit",
        ));
    }
    Ok(())
}

fn detect_extension(source_name: &str, content_type: &str) -> &'static str {
    match content_type {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ if source_name.ends_with(".png") => "png",
        _ if source_name.ends_with(".webp") => "webp",
        _ if source_name.ends_with(".gif") => "gif",
        _ => "jpg",
    }
}

fn normalize_filename_part(value: Option<&str>) -> Option<String> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            out.push(ch);
        } else if ch.is_whitespace() || ch == '.' || ch == '/' || ch == '\\' {
            out.push('_');
        }
    }
    let cleaned = out.trim_matches('_');
    if cleaned.is_empty() {
        return None;
    }
    Some(cleaned.chars().take(80).collect())
}

fn normalize_folder_path(value: Option<&str>) -> Option<String> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }
    let mut cleaned_parts: Vec<String> = Vec::new();
    for part in raw.split('/') {
        let normalized = normalize_filename_part(Some(part));
        if let Some(part_clean) = normalized.filter(|v| !v.is_empty()) {
            cleaned_parts.push(part_clean);
        }
    }
    if cleaned_parts.is_empty() {
        return None;
    }
    let joined = cleaned_parts.join("/");
    Some(joined.chars().take(160).collect())
}

fn append_folder_to_target(base: UploadTarget, folder: Option<&str>) -> UploadTarget {
    match folder.map(str::trim).filter(|f| !f.is_empty()) {
        Some(folder) => UploadTarget {
            local_dir: format!("{}/{}", base.local_dir, folder),
            ftp_dir: format!("{}/{}", base.ftp_dir, folder),
            public_dir: format!("{}/{}", base.public_dir, folder),
        },
        None => base,
    }
}

async fn store_upload(
    config: &UploadStorageConfig,
    target: &UploadTarget,
    filename: &str,
    bytes: Vec<u8>,
) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    if config.backend == "ftp" {
        return upload_via_ftp(config.clone(), target.clone(), filename.to_string(), bytes).await;
    }
    upload_to_local_disk(target, filename, bytes).await
}

async fn upload_to_local_disk(
    target: &UploadTarget,
    filename: &str,
    bytes: Vec<u8>,
) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    tokio::fs::create_dir_all(&target.local_dir)
        .await
        .map_err(|error| internal_error(format!("failed to create uploads dir: {error}")))?;

    let disk_path = format!("{}/{}", target.local_dir, filename);
    tokio::fs::write(&disk_path, &bytes)
        .await
        .map_err(|error| internal_error(format!("failed to store uploaded image: {error}")))?;

    Ok(format!(
        "/uploads/{}",
        disk_path
            .strip_prefix("uploads/")
            .unwrap_or(filename)
            .replace('\\', "/")
    ))
}

async fn upload_via_ftp(
    config: UploadStorageConfig,
    target: UploadTarget,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let host = config.ftp_host.clone().ok_or_else(|| {
        internal_error("UPLOAD_FTP_HOST is required when UPLOAD_STORAGE_BACKEND=ftp".to_string())
    })?;
    let user = config.ftp_user.clone().ok_or_else(|| {
        internal_error("UPLOAD_FTP_USER is required when UPLOAD_STORAGE_BACKEND=ftp".to_string())
    })?;
    let pass = config.ftp_pass.clone().ok_or_else(|| {
        internal_error("UPLOAD_FTP_PASS is required when UPLOAD_STORAGE_BACKEND=ftp".to_string())
    })?;
    let filename_for_upload = filename.clone();
    let storage_root_dir = config.ftp_storage_root_dir.clone();
    let ftp_dir = target.ftp_dir.clone();
    let mut last_error = String::new();
    for attempt in 1..=config.ftp_retry_attempts {
        let host_attempt = host.clone();
        let user_attempt = user.clone();
        let pass_attempt = pass.clone();
        let storage_root_dir_attempt = storage_root_dir.clone();
        let ftp_dir_attempt = ftp_dir.clone();
        let filename_attempt = filename_for_upload.clone();
        let bytes_attempt = bytes.clone();
        let ftp_port = config.ftp_port;

        let result = tokio::task::spawn_blocking(move || -> Result<(), String> {
            let mut ftp =
                FtpStream::connect((host_attempt.as_str(), ftp_port)).map_err(|e| e.to_string())?;
            ftp.login(&user_attempt, &pass_attempt)
                .map_err(|e| e.to_string())?;
            ftp.transfer_type(FileType::Binary)
                .map_err(|e| e.to_string())?;

            let remote_base = if storage_root_dir_attempt.is_empty() {
                ftp_dir_attempt.clone()
            } else {
                format!("{}/{}", storage_root_dir_attempt, ftp_dir_attempt)
            };
            ensure_ftp_path(&mut ftp, &remote_base)?;
            ftp.cwd(&remote_base).map_err(|e| e.to_string())?;
            let _ = ftp.rm(&filename_attempt);
            ftp.put_file(&filename_attempt, &mut Cursor::new(bytes_attempt))
                .map_err(|e| e.to_string())?;
            ftp.quit().map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
        .map_err(|error| internal_error(format!("ftp upload task failed: {error}")))?;

        match result {
            Ok(()) => {
                last_error.clear();
                break;
            }
            Err(error) => {
                last_error = error;
                if attempt < config.ftp_retry_attempts {
                    tokio::time::sleep(Duration::from_millis(config.ftp_retry_delay_ms)).await;
                }
            }
        }
    }

    if !last_error.is_empty() {
        return Err(internal_error(format!("ftp upload failed: {last_error}")));
    }

    if let Some(base) = config.ftp_public_base_url {
        return Ok(format!("{}/{}/{}", base, target.public_dir, filename));
    }
    Ok(format!(
        "ftp://{}:{}/{}/{}/{}",
        config.ftp_host.unwrap_or_default(),
        config.ftp_port,
        config.ftp_root_dir,
        target.public_dir,
        filename
    ))
}

fn ensure_ftp_path(ftp: &mut FtpStream, dir: &str) -> Result<(), String> {
    let cleaned = dir.trim_matches('/');
    if cleaned.is_empty() {
        return Ok(());
    }
    for segment in cleaned.split('/') {
        if segment.is_empty() {
            continue;
        }
        if ftp.cwd(segment).is_ok() {
            continue;
        }
        ftp.mkdir(segment).map_err(|e| e.to_string())?;
        ftp.cwd(segment).map_err(|e| e.to_string())?;
    }
    ftp.cwd("/").map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        build_upload_target, normalize_filename_part, normalize_folder_path, UploadKind,
    };

    #[test]
    fn build_upload_target_uses_dev_for_dev_env() {
        let target = build_upload_target("dev", UploadKind::Product, "avatar", None);
        assert_eq!(target.ftp_dir, "dev");
        assert_eq!(target.public_dir, "dev");
    }

    #[test]
    fn build_upload_target_uses_stage_for_unknown_env() {
        let target = build_upload_target("qa", UploadKind::Product, "avatar", None);
        assert_eq!(target.ftp_dir, "stage");
        assert_eq!(target.public_dir, "stage");
    }

    #[test]
    fn build_upload_target_uses_avatar_subdir() {
        let target = build_upload_target("prod", UploadKind::Avatar, "avatar", None);
        assert_eq!(target.ftp_dir, "prod/avatar");
        assert_eq!(target.local_dir, "uploads/avatar");
    }

    #[test]
    fn build_upload_target_appends_folder_for_product_uploads() {
        let target = build_upload_target(
            "stage",
            UploadKind::Product,
            "avatar",
            Some("A1/KID_123-1"),
        );
        assert_eq!(target.ftp_dir, "stage/A1/KID_123-1");
        assert_eq!(target.public_dir, "stage/A1/KID_123-1");
        assert_eq!(target.local_dir, "uploads/A1/KID_123-1");
    }

    #[test]
    fn normalize_filename_part_keeps_safe_characters() {
        let value = normalize_filename_part(Some("1-KID_123_photo 1"));
        assert_eq!(value.as_deref(), Some("1-KID_123_photo_1"));
    }

    #[test]
    fn normalize_filename_part_rejects_empty_result() {
        let value = normalize_filename_part(Some("...."));
        assert!(value.is_none());
    }

    #[test]
    fn normalize_folder_path_keeps_safe_hierarchy() {
        let value = normalize_folder_path(Some("A-12/KID 123/slot.05"));
        assert_eq!(value.as_deref(), Some("A-12/KID_123/slot_05"));
    }

    #[test]
    fn load_config_clamps_ftp_retry_defaults() {
        let config = super::load_upload_storage_config();
        assert!((1..=5).contains(&config.ftp_retry_attempts));
        assert!((100..=5000).contains(&config.ftp_retry_delay_ms));
    }
}
