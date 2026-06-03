use std::{future::Future, pin::Pin};

use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub(crate) enum RepoError {
    #[error("unique constraint violation: {0}")]
    UniqueViolation(String),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub(crate) type RepoResult<T> = Result<T, RepoError>;
pub(crate) type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

#[derive(Debug, Clone)]
pub(crate) struct NewUser {
    pub id: Uuid,
    pub username: String,
    pub login: String,
    pub email: String,
    pub first_name: String,
    pub last_name: String,
    pub phone_number: String,
    pub password_hash: String,
}

pub(crate) trait AuthRepository {
    fn is_email_taken<'a>(&'a self, email: &'a str) -> BoxFuture<'a, RepoResult<bool>>;
    fn is_login_taken<'a>(&'a self, login: &'a str) -> BoxFuture<'a, RepoResult<bool>>;
    fn insert_pending_user<'a>(&'a self, user: NewUser) -> BoxFuture<'a, RepoResult<()>>;
}

pub(crate) struct PgAuthRepository<'a> {
    db: &'a PgPool,
}

impl<'a> PgAuthRepository<'a> {
    pub(crate) fn new(db: &'a PgPool) -> Self {
        Self { db }
    }
}

impl<'a> AuthRepository for PgAuthRepository<'a> {
    fn is_email_taken<'b>(&'b self, email: &'b str) -> BoxFuture<'b, RepoResult<bool>> {
        Box::pin(async move {
            let exists = sqlx::query_scalar::<_, i32>(
                "SELECT 1 FROM users WHERE email IS NOT NULL AND LOWER(email) = LOWER($1) LIMIT 1",
            )
            .bind(email)
            .fetch_optional(self.db)
            .await
            .map_err(RepoError::from)?;
            Ok(exists.is_some())
        })
    }

    fn is_login_taken<'b>(&'b self, login: &'b str) -> BoxFuture<'b, RepoResult<bool>> {
        Box::pin(async move {
            let exists =
                sqlx::query_scalar::<_, i32>("SELECT 1 FROM users WHERE login = $1 LIMIT 1")
                    .bind(login)
                    .fetch_optional(self.db)
                    .await
                    .map_err(RepoError::from)?;
            Ok(exists.is_some())
        })
    }

    fn insert_pending_user<'b>(&'b self, user: NewUser) -> BoxFuture<'b, RepoResult<()>> {
        Box::pin(async move {
            let result = sqlx::query(
                r#"
                INSERT INTO users (id, username, login, email, first_name, last_name, phone_number, password_hash, role, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'user', 'pending')
                "#,
            )
            .bind(user.id)
            .bind(user.username)
            .bind(user.login)
            .bind(user.email)
            .bind(user.first_name)
            .bind(user.last_name)
            .bind(user.phone_number)
            .bind(user.password_hash)
            .execute(self.db)
            .await;

            match result {
                Ok(_) => Ok(()),
                Err(sqlx::Error::Database(db_error))
                    if db_error.code().as_deref() == Some("23505") =>
                {
                    let constraint = db_error.constraint().unwrap_or("unknown").to_string();
                    Err(RepoError::UniqueViolation(constraint))
                }
                Err(error) => Err(RepoError::Database(error)),
            }
        })
    }
}
