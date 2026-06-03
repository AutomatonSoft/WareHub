use sqlx::PgPool;
use std::env;
use tracing::{info, warn};
use uuid::Uuid;

use crate::auth::hash_password;

pub(crate) async fn ensure_admin_account(db: &PgPool) {
    let bootstrap_enabled = env::var("BOOTSTRAP_ADMIN_ON_STARTUP")
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes"
            )
        })
        .unwrap_or(false);
    if !bootstrap_enabled {
        return;
    }

    let admin_login_raw = env::var("ADMIN_LOGIN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "ravil".to_string());
    let admin_password = match env::var("ADMIN_PASSWORD") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => {
            warn!("ADMIN_PASSWORD is empty, skipping admin bootstrap");
            return;
        }
    };
    let admin_email = env::var("ADMIN_EMAIL")
        .ok()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());
    let admin_username = env::var("ADMIN_USERNAME").unwrap_or_else(|_| "Ravil".to_string());
    let admin_login = admin_login_raw.trim().to_lowercase();

    let existing = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE login = $1")
        .bind(&admin_login)
        .fetch_one(db)
        .await
        .expect("failed to query admin account existence");

    if existing == 0 {
        let password_hash = hash_password(&admin_password).expect("failed to hash admin password");
        sqlx::query(
            r#"
            INSERT INTO users (id, username, login, email, password_hash, role, status, approved_at)
            VALUES ($1, $2, $3, $4, $5, 'admin', 'approved', NOW())
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(&admin_username)
        .bind(&admin_login)
        .bind(admin_email)
        .bind(password_hash)
        .execute(db)
        .await
        .expect("failed to bootstrap admin account");

        info!("admin account bootstrapped");
    } else if env::var("BOOTSTRAP_ADMIN_ENFORCE_ROLE")
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes"
            )
        })
        .unwrap_or(false)
    {
        let _ = sqlx::query(
            r#"
            UPDATE users
            SET role = 'admin', status = 'approved'
            WHERE login = $1
            "#,
        )
        .bind(&admin_login)
        .execute(db)
        .await
        .expect("failed to enforce admin role");
    }
}
