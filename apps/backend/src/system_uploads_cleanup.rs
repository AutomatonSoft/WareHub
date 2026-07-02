use std::env;

use suppaftp::{types::FileType, FtpStream};

#[derive(Clone, Debug)]
struct CleanupConfig {
    backend: String,
    ftp_host: Option<String>,
    ftp_user: Option<String>,
    ftp_pass: Option<String>,
    ftp_port: u16,
    ftp_root_dir: String,
    ftp_storage_root_dir: String,
    ftp_public_base_url: Option<String>,
}

pub(crate) async fn delete_uploaded_photo_by_url(photo_url: &str) -> Result<(), String> {
    let config = load_cleanup_config();
    let Some(relative_path) = extract_relative_public_path(photo_url, &config) else {
        return Ok(());
    };

    if config.backend == "ftp" {
        return delete_via_ftp(config, &relative_path).await;
    }
    delete_on_local_disk(&relative_path).await
}

fn load_cleanup_config() -> CleanupConfig {
    CleanupConfig {
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
        ftp_public_base_url: env::var("UPLOAD_FTP_PUBLIC_BASE_URL")
            .ok()
            .map(|v| v.trim().trim_end_matches('/').to_string())
            .filter(|v| !v.is_empty()),
    }
}

fn extract_relative_public_path(photo_url: &str, config: &CleanupConfig) -> Option<String> {
    let value = photo_url.trim();
    if value.is_empty() {
        return None;
    }

    let normalized = if let Some(rest) = value.strip_prefix("/uploads/") {
        rest.to_string()
    } else if let Some(base) = &config.ftp_public_base_url {
        if let Some(rest) = value.strip_prefix(&(base.to_string() + "/")) {
            rest.to_string()
        } else {
            parse_managed_ftp_relative_path(value, &config.ftp_root_dir)?
        }
    } else if value.starts_with("ftp://") {
        parse_managed_ftp_relative_path(value, &config.ftp_root_dir)?
    } else {
        return None;
    };

    sanitize_relative_path(&normalized)
}

fn parse_managed_ftp_relative_path(value: &str, ftp_root_dir: &str) -> Option<String> {
    if !value.starts_with("ftp://") {
        return None;
    }
    let after_scheme = value.split_once("://")?.1;
    let slash_pos = after_scheme.find('/')?;
    let path = after_scheme[(slash_pos + 1)..].to_string();
    if ftp_root_dir.is_empty() {
        return Some(path);
    }
    let prefix = format!("{}/", ftp_root_dir.trim_matches('/'));
    let rest = path.strip_prefix(&prefix)?;
    Some(rest.to_string())
}

fn sanitize_relative_path(path: &str) -> Option<String> {
    let mut parts = Vec::new();
    for part in path.split('/') {
        let trimmed = part.trim();
        if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
            continue;
        }
        parts.push(trimmed);
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

async fn delete_on_local_disk(relative_path: &str) -> Result<(), String> {
    let local_path = format!("uploads/{}", relative_path.replace('\\', "/"));
    match tokio::fs::remove_file(local_path).await {
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("local delete failed: {error}")),
    }
}

async fn delete_via_ftp(config: CleanupConfig, relative_path: &str) -> Result<(), String> {
    let host = config
        .ftp_host
        .clone()
        .ok_or_else(|| "UPLOAD_FTP_HOST is required when UPLOAD_STORAGE_BACKEND=ftp".to_string())?;
    let user = config
        .ftp_user
        .clone()
        .ok_or_else(|| "UPLOAD_FTP_USER is required when UPLOAD_STORAGE_BACKEND=ftp".to_string())?;
    let pass = config
        .ftp_pass
        .clone()
        .ok_or_else(|| "UPLOAD_FTP_PASS is required when UPLOAD_STORAGE_BACKEND=ftp".to_string())?;

    let remote_full_path = if config.ftp_storage_root_dir.is_empty() {
        relative_path.to_string()
    } else {
        format!("{}/{}", config.ftp_storage_root_dir, relative_path)
    };
    let (remote_dir, remote_file) = split_remote_path(&remote_full_path);

    let result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut ftp = FtpStream::connect((host.as_str(), config.ftp_port)).map_err(|e| e.to_string())?;
        ftp.login(&user, &pass).map_err(|e| e.to_string())?;
        ftp.transfer_type(FileType::Binary).map_err(|e| e.to_string())?;
        if !remote_dir.is_empty() {
            match ftp.cwd(&remote_dir) {
                Ok(_) => {}
                Err(error) if is_ftp_not_found_error(&error.to_string()) => {
                    let _ = ftp.quit();
                    return Ok(());
                }
                Err(error) => return Err(error.to_string()),
            }
        }
        if let Err(error) = ftp.rm(&remote_file) {
            if !is_ftp_not_found_error(&error.to_string()) {
                return Err(error.to_string());
            }
        }
        ftp.quit().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|error| format!("ftp delete task failed: {error}"))?;

    result
}

fn split_remote_path(path: &str) -> (String, String) {
    match path.rsplit_once('/') {
        Some((dir, file)) => (dir.to_string(), file.to_string()),
        None => ("".to_string(), path.to_string()),
    }
}

fn is_ftp_not_found_error(error: &str) -> bool {
    let normalized = error.to_ascii_lowercase();
    normalized.contains("[550]") || normalized.contains("no such file or directory")
}

#[cfg(test)]
mod tests {
    use super::{extract_relative_public_path, is_ftp_not_found_error, CleanupConfig};

    fn cfg(base: Option<&str>) -> CleanupConfig {
        CleanupConfig {
            backend: "ftp".to_string(),
            ftp_host: None,
            ftp_user: None,
            ftp_pass: None,
            ftp_port: 21,
            ftp_root_dir: "warehub".to_string(),
            ftp_storage_root_dir: "warehub".to_string(),
            ftp_public_base_url: base.map(|v| v.to_string()),
        }
    }

    #[test]
    fn extract_relative_public_path_from_uploads_url() {
        let path = extract_relative_public_path("/uploads/dev/A1/photo.jpg", &cfg(None));
        assert_eq!(path.as_deref(), Some("dev/A1/photo.jpg"));
    }

    #[test]
    fn extract_relative_public_path_from_ftp_public_url() {
        let path = extract_relative_public_path(
            "https://cdn.example.com/dev/A1/photo.jpg",
            &cfg(Some("https://cdn.example.com")),
        );
        assert_eq!(path.as_deref(), Some("dev/A1/photo.jpg"));
    }

    #[test]
    fn ftp_not_found_detection_matches_expected_errors() {
        assert!(is_ftp_not_found_error(
            "Invalid response: [550] 550 mediawarehub.veloxdesk.com/warehub/stage/avatar: No such file or directory"
        ));
        assert!(is_ftp_not_found_error("No such file or directory"));
        assert!(!is_ftp_not_found_error("authentication failed"));
    }
}
