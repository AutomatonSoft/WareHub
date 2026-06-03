use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct AuthUser {
    pub id: Uuid,
    pub username: String,
    pub login: String,
    pub role: String,
    pub status: String,
}

#[derive(Debug, FromRow)]
pub(crate) struct UserWithPasswordRow {
    pub id: Uuid,
    pub username: String,
    pub login: String,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub phone_number: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub status: String,
    pub password_hash: String,
}

#[derive(Debug, FromRow)]
pub(crate) struct PasswordResetCodeRow {
    pub id: Uuid,
    pub code_hash: String,
    pub expires_at: DateTime<Utc>,
    pub attempts: i32,
}
