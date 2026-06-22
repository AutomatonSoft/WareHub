use uuid::Uuid;

use super::dto::{RegisterRequest, RegisterResponse};
use super::password::hash_password;
use super::repository::{AuthRepository, NewUser, RepoError};

#[derive(Debug, thiserror::Error)]
pub(crate) enum RegistrationError {
    #[error("email already in use")]
    EmailTaken,
    #[error("login already in use")]
    LoginTaken,
    #[error("username is invalid")]
    InvalidUsername,
    #[error("failed to hash password: {0}")]
    Hashing(String),
    #[error("repository error: {0}")]
    Repository(#[from] RepoError),
}

pub(crate) struct RegistrationService<R: AuthRepository> {
    repo: R,
}

impl<R: AuthRepository> RegistrationService<R> {
    pub(crate) fn new(repo: R) -> Self {
        Self { repo }
    }

    pub(crate) async fn register(
        &self,
        payload: &RegisterRequest,
    ) -> Result<RegisterResponse, RegistrationError> {
        let normalized_email = normalize_email(&payload.email);
        let normalized_login = normalize_login(&payload.login);
        let normalized_first_name = normalize_person_field(&payload.first_name);
        let normalized_last_name = normalize_person_field(&payload.last_name);
        let normalized_phone_number = normalize_phone_number(&payload.phone_number);
        let username = resolve_username(
            payload.username.as_deref(),
            &normalized_first_name,
            &normalized_last_name,
            &normalized_login,
        )?;

        if self.repo.is_email_taken(&normalized_email).await? {
            return Err(RegistrationError::EmailTaken);
        }

        if self.repo.is_login_taken(&normalized_login).await? {
            return Err(RegistrationError::LoginTaken);
        }

        let password_hash = hash_password(&payload.password).map_err(RegistrationError::Hashing)?;

        let user = NewUser {
            id: Uuid::new_v4(),
            username,
            login: normalized_login,
            email: normalized_email,
            first_name: normalized_first_name,
            last_name: normalized_last_name,
            phone_number: normalized_phone_number,
            password_hash,
        };

        match self.repo.insert_pending_user(user).await {
            Ok(()) => Ok(RegisterResponse {
                message: "registration submitted, waiting for admin approval".to_string(),
                status: "pending",
            }),
            Err(RepoError::UniqueViolation(constraint)) => {
                if constraint.contains("users_email") || constraint.contains("users_email_lower") {
                    Err(RegistrationError::EmailTaken)
                } else if constraint.contains("users_login") {
                    Err(RegistrationError::LoginTaken)
                } else {
                    Err(RegistrationError::Repository(RepoError::UniqueViolation(
                        constraint,
                    )))
                }
            }
            Err(error) => Err(RegistrationError::Repository(error)),
        }
    }
}

fn normalize_email(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_login(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_username(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_person_field(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_phone_number(value: &str) -> String {
    value.trim().to_string()
}

fn resolve_username(
    provided: Option<&str>,
    first_name: &str,
    last_name: &str,
    login: &str,
) -> Result<String, RegistrationError> {
    if let Some(username) = provided {
        let normalized = normalize_username(username);
        if is_valid_username(&normalized) {
            return Ok(normalized);
        }
        return Err(RegistrationError::InvalidUsername);
    }

    if let Some(username) = derive_username_from_profile(first_name, last_name, login) {
        return Ok(username);
    }

    Err(RegistrationError::InvalidUsername)
}

pub(super) fn derive_username_from_profile(
    first_name: &str,
    last_name: &str,
    login: &str,
) -> Option<String> {
    let candidate = format!("{} {}", first_name.trim(), last_name.trim())
        .trim()
        .to_string();
    if is_valid_username(&candidate) {
        return Some(candidate);
    }
    if is_valid_username(login) {
        return Some(login.to_string());
    }
    None
}

fn is_valid_username(value: impl AsRef<str>) -> bool {
    let value = value.as_ref().trim();
    let length_ok = value.len() >= 3 && value.len() <= 64;
    let has_visible_content = value.chars().any(|c| !c.is_whitespace());
    let allowed_chars = value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == ' ');

    length_ok && has_visible_content && allowed_chars
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::repository::{BoxFuture, RepoResult};
    use std::collections::HashSet;
    use std::sync::{Arc, Mutex};

    #[derive(Default, Clone)]
    struct MemoryRepo {
        emails: Arc<Mutex<HashSet<String>>>,
        logins: Arc<Mutex<HashSet<String>>>,
    }

    impl AuthRepository for MemoryRepo {
        fn is_email_taken<'a>(&'a self, email: &'a str) -> BoxFuture<'a, RepoResult<bool>> {
            Box::pin(async move {
                let guard = self.emails.lock().unwrap();
                Ok(guard.contains(email))
            })
        }

        fn is_login_taken<'a>(&'a self, login: &'a str) -> BoxFuture<'a, RepoResult<bool>> {
            Box::pin(async move {
                let guard = self.logins.lock().unwrap();
                Ok(guard.contains(login))
            })
        }

        fn insert_pending_user<'a>(&'a self, user: NewUser) -> BoxFuture<'a, RepoResult<()>> {
            Box::pin(async move {
                let mut emails = self.emails.lock().unwrap();
                let mut logins = self.logins.lock().unwrap();
                emails.insert(user.email);
                logins.insert(user.login);
                Ok(())
            })
        }
    }

    fn base_request() -> RegisterRequest {
        RegisterRequest {
            email: "user@example.com".to_string(),
            username: Some("valid_user".to_string()),
            login: "valid_user".to_string(),
            first_name: "Ravil".to_string(),
            last_name: "Khanov".to_string(),
            phone_number: "+77771234567".to_string(),
            password: "ValidPass1".to_string(),
        }
    }

    #[tokio::test]
    async fn register_succeeds_with_unique_credentials() {
        let repo = MemoryRepo::default();
        let service = RegistrationService::new(repo);
        let req = base_request();
        let result = service.register(&req).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn register_rejects_duplicate_email() {
        let repo = MemoryRepo::default();
        let service = RegistrationService::new(repo.clone());
        let req = base_request();
        let _ = service.register(&req).await.unwrap();
        let result = service.register(&req).await;
        assert!(matches!(result, Err(RegistrationError::EmailTaken)));
    }
}
