use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use std::env;

#[derive(Debug, Clone, PartialEq, Eq)]
struct SmtpConfig {
    host: String,
    from: Mailbox,
    port: u16,
    credentials: Option<Credentials>,
    insecure: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SmtpSecurityMode {
    Plaintext,
    TlsWrapper,
    StartTlsRequired,
}

pub(crate) async fn send_password_reset_email(to: &str, code: &str) -> Result<(), String> {
    let smtp = load_smtp_config()?;
    let mut builder = build_smtp_transport_builder(&smtp)?;
    let to: Mailbox = to
        .parse()
        .map_err(|error| format!("invalid reset email address: {error}"))?;

    let subject = "SofortBot password reset code";
    let body = format!("Your password reset code is: {code}\n\nThis code will expire soon.");

    let email = Message::builder()
        .from(smtp.from.clone())
        .to(to)
        .subject(subject)
        .body(body)
        .map_err(|error| format!("failed to build email: {error}"))?;

    if let Some(credentials) = smtp.credentials {
        builder = builder.credentials(credentials);
    }

    let transport = builder.build();

    tokio::task::spawn_blocking(move || transport.send(&email))
        .await
        .map_err(|error| format!("email send task failed: {error}"))?
        .map_err(|error| sanitize_smtp_runtime_error(&error.to_string()))?;

    Ok(())
}

fn load_smtp_config() -> Result<SmtpConfig, String> {
    load_smtp_config_with(|key| env::var(key).ok())
}

fn load_smtp_config_with<F>(get_var: F) -> Result<SmtpConfig, String>
where
    F: Fn(&str) -> Option<String>,
{
    let smtp_host = get_required_env(&get_var, "SMTP_HOST")?;
    let smtp_from = get_required_env(&get_var, "SMTP_FROM")?;
    let smtp_port = get_var("SMTP_PORT")
        .and_then(|value| value.trim().parse::<u16>().ok())
        .unwrap_or(587);
    let smtp_user = get_optional_env(&get_var, "SMTP_USERNAME");
    let smtp_pass = get_optional_env(&get_var, "SMTP_PASSWORD");
    let smtp_insecure = get_var("SMTP_INSECURE")
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes"
            )
        })
        .unwrap_or(false);

    let from: Mailbox = smtp_from
        .parse()
        .map_err(|error| format!("invalid SMTP_FROM address: {error}"))?;

    let credentials = match (smtp_user, smtp_pass) {
        (Some(user), Some(pass)) => Some(Credentials::new(user, pass)),
        (None, None) => None,
        (Some(_), None) => {
            return Err(
                "SMTP_PASSWORD is required when SMTP_USERNAME is set for email delivery"
                    .to_string(),
            )
        }
        (None, Some(_)) => {
            return Err(
                "SMTP_USERNAME is required when SMTP_PASSWORD is set for email delivery"
                    .to_string(),
            )
        }
    };

    Ok(SmtpConfig {
        host: smtp_host,
        from,
        port: smtp_port,
        credentials,
        insecure: smtp_insecure,
    })
}

fn get_required_env<F>(get_var: &F, key: &str) -> Result<String, String>
where
    F: Fn(&str) -> Option<String>,
{
    get_optional_env(get_var, key)
        .ok_or_else(|| format!("{key} is required for email delivery"))
}

fn get_optional_env<F>(get_var: &F, key: &str) -> Option<String>
where
    F: Fn(&str) -> Option<String>,
{
    get_var(key).and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn smtp_security_mode(smtp: &SmtpConfig) -> SmtpSecurityMode {
    if smtp.insecure {
        return SmtpSecurityMode::Plaintext;
    }

    if smtp.port == 587 {
        return SmtpSecurityMode::StartTlsRequired;
    }

    SmtpSecurityMode::TlsWrapper
}

fn build_smtp_transport_builder(
    smtp: &SmtpConfig,
) -> Result<lettre::transport::smtp::SmtpTransportBuilder, String> {
    let builder = match smtp_security_mode(smtp) {
        SmtpSecurityMode::Plaintext => SmtpTransport::builder_dangerous(&smtp.host).port(smtp.port),
        SmtpSecurityMode::TlsWrapper => SmtpTransport::relay(&smtp.host)
            .map_err(|error| sanitize_smtp_config_error(&error.to_string()))?
            .port(smtp.port),
        SmtpSecurityMode::StartTlsRequired => SmtpTransport::starttls_relay(&smtp.host)
            .map_err(|error| sanitize_smtp_config_error(&error.to_string()))?
            .port(smtp.port),
    };

    Ok(builder)
}

fn sanitize_smtp_config_error(error: &str) -> String {
    let normalized = error.to_ascii_lowercase();

    if normalized.contains("invalid dns name") || normalized.contains("domain") {
        return "failed to configure SMTP transport: SMTP_HOST is not a valid relay host"
            .to_string();
    }

    if normalized.contains("tls") || normalized.contains("starttls") {
        return "failed to configure SMTP transport: SMTP TLS configuration is invalid"
            .to_string();
    }

    "failed to configure SMTP transport: invalid SMTP transport configuration".to_string()
}

fn sanitize_smtp_runtime_error(error: &str) -> String {
    let normalized = error.to_ascii_lowercase();

    let detail = if normalized.contains("failed to lookup address information")
        || normalized.contains("name or service not known")
        || normalized.contains("dns")
    {
        "SMTP host resolution failed"
    } else if normalized.contains("authentication")
        || normalized.contains("credentials")
        || normalized.contains("invalid login")
    {
        "SMTP authentication failed"
    } else if normalized.contains("starttls")
        || normalized.contains("tls")
        || normalized.contains("ssl")
    {
        "SMTP TLS negotiation failed"
    } else if normalized.contains("sender address rejected")
        || normalized.contains("mail from")
        || normalized.contains("from address")
    {
        "SMTP sender rejected"
    } else if normalized.contains("connection error") {
        "SMTP connection failed"
    } else {
        "SMTP delivery failed"
    };

    format!("failed to send reset email: {detail}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smtp_config_requires_host() {
        let result = load_smtp_config_with(|key| match key {
            "SMTP_FROM" => Some("WareHub <no-reply@example.com>".to_string()),
            _ => None,
        });

        assert_eq!(
            result.unwrap_err(),
            "SMTP_HOST is required for email delivery"
        );
    }

    #[test]
    fn smtp_config_requires_from_address() {
        let result = load_smtp_config_with(|key| match key {
            "SMTP_HOST" => Some("smtp.example.com".to_string()),
            _ => None,
        });

        assert_eq!(
            result.unwrap_err(),
            "SMTP_FROM is required for email delivery"
        );
    }

    #[test]
    fn smtp_config_defaults_port_and_disables_credentials() {
        let config = load_smtp_config_with(|key| match key {
            "SMTP_HOST" => Some("smtp.example.com".to_string()),
            "SMTP_FROM" => Some("WareHub <no-reply@example.com>".to_string()),
            _ => None,
        })
        .expect("must parse config");

        assert_eq!(config.host, "smtp.example.com");
        assert_eq!(config.port, 587);
        assert_eq!(config.credentials, None);
        assert!(!config.insecure);
    }

    #[test]
    fn smtp_config_requires_password_when_username_is_set() {
        let result = load_smtp_config_with(|key| match key {
            "SMTP_HOST" => Some("smtp.example.com".to_string()),
            "SMTP_FROM" => Some("WareHub <no-reply@example.com>".to_string()),
            "SMTP_USERNAME" => Some("mailer".to_string()),
            _ => None,
        });

        assert_eq!(
            result.unwrap_err(),
            "SMTP_PASSWORD is required when SMTP_USERNAME is set for email delivery"
        );
    }

    #[test]
    fn smtp_config_requires_username_when_password_is_set() {
        let result = load_smtp_config_with(|key| match key {
            "SMTP_HOST" => Some("smtp.example.com".to_string()),
            "SMTP_FROM" => Some("WareHub <no-reply@example.com>".to_string()),
            "SMTP_PASSWORD" => Some("secret".to_string()),
            _ => None,
        });

        assert_eq!(
            result.unwrap_err(),
            "SMTP_USERNAME is required when SMTP_PASSWORD is set for email delivery"
        );
    }

    #[test]
    fn smtp_config_enables_insecure_mode_for_truthy_values() {
        let config = load_smtp_config_with(|key| match key {
            "SMTP_HOST" => Some("smtp.example.com".to_string()),
            "SMTP_FROM" => Some("WareHub <no-reply@example.com>".to_string()),
            "SMTP_INSECURE" => Some("yes".to_string()),
            _ => None,
        })
        .expect("must parse config");

        assert!(config.insecure);
    }

    #[test]
    fn smtp_security_mode_uses_starttls_for_port_587() {
        let config = load_smtp_config_with(|key| match key {
            "SMTP_HOST" => Some("smtp.example.com".to_string()),
            "SMTP_FROM" => Some("WareHub <no-reply@example.com>".to_string()),
            "SMTP_PORT" => Some("587".to_string()),
            _ => None,
        })
        .expect("must parse config");

        assert_eq!(smtp_security_mode(&config), SmtpSecurityMode::StartTlsRequired);
    }

    #[test]
    fn smtp_security_mode_uses_tls_wrapper_for_port_465() {
        let config = load_smtp_config_with(|key| match key {
            "SMTP_HOST" => Some("smtp.example.com".to_string()),
            "SMTP_FROM" => Some("WareHub <no-reply@example.com>".to_string()),
            "SMTP_PORT" => Some("465".to_string()),
            _ => None,
        })
        .expect("must parse config");

        assert_eq!(smtp_security_mode(&config), SmtpSecurityMode::TlsWrapper);
    }

    #[test]
    fn smtp_runtime_error_sanitizes_dns_failures() {
        let error = sanitize_smtp_runtime_error(
            "Connection error: failed to lookup address information: Name or service not known",
        );

        assert_eq!(error, "failed to send reset email: SMTP host resolution failed");
    }

    #[test]
    fn smtp_runtime_error_sanitizes_auth_failures() {
        let error = sanitize_smtp_runtime_error("authentication failed");

        assert_eq!(error, "failed to send reset email: SMTP authentication failed");
    }
}
