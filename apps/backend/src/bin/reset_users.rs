use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use dotenvy::dotenv;
use rand_core::OsRng;
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::env;
use uuid::Uuid;

fn require_env(key: &str) -> String {
    env::var(key).unwrap_or_else(|_| panic!("missing required env var: {key}"))
}

fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("failed to hash password")
        .to_string()
}

fn normalize_email(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_login(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_username(login: &str, username: &str) -> String {
    let candidate = username.trim();
    if candidate.is_empty() {
        login.to_string()
    } else {
        candidate.to_string()
    }
}

async fn reset_users(pool: &PgPool) {
    let mut tx = pool.begin().await.expect("failed to start tx");
    sqlx::query("DELETE FROM auth_tokens")
        .execute(&mut *tx)
        .await
        .expect("failed to clear auth_tokens");
    sqlx::query("DELETE FROM users")
        .execute(&mut *tx)
        .await
        .expect("failed to clear users");

    let admin_login_raw = env::var("ADMIN_LOGIN").unwrap_or_else(|_| "ravil".to_string());
    let admin_password = require_env("ADMIN_PASSWORD");
    let admin_username_raw = env::var("ADMIN_USERNAME").unwrap_or_else(|_| "Ravil".to_string());
    let admin_email_raw = require_env("ADMIN_EMAIL");

    let admin_login = normalize_login(&admin_login_raw);
    let admin_username = normalize_username(&admin_login, &admin_username_raw);
    let admin_email = normalize_email(&admin_email_raw);
    let password_hash = hash_password(&admin_password);

    sqlx::query(
        r#"
        INSERT INTO users (id, username, login, email, password_hash, role, status, approved_at)
        VALUES ($1, $2, $3, $4, $5, 'admin', 'approved', NOW())
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(admin_username)
    .bind(admin_login)
    .bind(admin_email)
    .bind(password_hash)
    .execute(&mut *tx)
    .await
    .expect("failed to insert admin user");

    tx.commit().await.expect("failed to commit tx");
}

#[tokio::main]
async fn main() {
    dotenvy::from_filename("../sofortbot-infra/.env").ok();
    dotenv().ok();
    let database_url = require_env("DATABASE_URL");
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
        .expect("failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("failed to run migrations");

    reset_users(&pool).await;
    println!("All users removed. Admin account created.");
}
