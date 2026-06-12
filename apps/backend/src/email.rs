use lettre::message::{header::ContentType, Mailbox, MultiPart, SinglePart};
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

const PASSWORD_RESET_EMAIL_SUBJECT: &str = "Your WareHub password reset code";

pub(crate) async fn send_password_reset_email(
    to: &str,
    code: &str,
    expires_in_minutes: i64,
) -> Result<(), String> {
    let smtp = load_smtp_config()?;
    let mut builder = build_smtp_transport_builder(&smtp)?;
    let to: Mailbox = to
        .parse()
        .map_err(|error| format!("invalid reset email address: {error}"))?;
    let email = build_password_reset_email(&smtp.from, &to, code, expires_in_minutes)?;

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

fn build_password_reset_email(
    from: &Mailbox,
    to: &Mailbox,
    code: &str,
    expires_in_minutes: i64,
) -> Result<Message, String> {
    let plain_body = build_password_reset_plain_text(code, expires_in_minutes);
    let html_body = build_password_reset_html(code, expires_in_minutes);

    Message::builder()
        .from(from.clone())
        .to(to.clone())
        .subject(PASSWORD_RESET_EMAIL_SUBJECT)
        .multipart(
            MultiPart::alternative()
                .singlepart(SinglePart::plain(plain_body))
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_HTML)
                        .body(html_body),
                ),
        )
        .map_err(|error| format!("failed to build email: {error}"))
}

fn build_password_reset_plain_text(code: &str, expires_in_minutes: i64) -> String {
    format!(
        "Reset your WareHub password\n\nUse the code below to reset your password. This code expires in {expires_in_minutes} minutes.\n\n{code}\n\nIf you did not request this, you can safely ignore this email."
    )
}

fn build_password_reset_html(code: &str, expires_in_minutes: i64) -> String {
    format!(
        concat!(
            "<!doctype html>",
            "<html lang=\"en\">",
            "<body style=\"margin:0;padding:0;background:#f3f0e8;font-family:Arial,sans-serif;color:#1f2937;\">",
            "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f3f0e8;padding:32px 16px;\">",
            "<tr><td align=\"center\">",
            "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:560px;background:#ffffff;border:1px solid #e5dfd0;border-radius:24px;overflow:hidden;\">",
            "<tr><td style=\"padding:32px 32px 24px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);color:#ffffff;\">",
            "<div style=\"font-size:12px;letter-spacing:0.16em;text-transform:uppercase;opacity:0.82;\">WareHub</div>",
            "<h1 style=\"margin:12px 0 0;font-size:28px;line-height:1.2;\">Reset your WareHub password</h1>",
            "<p style=\"margin:12px 0 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.86);\">Use the code below to reset your password. This code expires in {expires_in_minutes} minutes.</p>",
            "</td></tr>",
            "<tr><td style=\"padding:32px;\">",
            "<div style=\"margin:0 0 12px;font-size:13px;line-height:1.6;color:#6b7280;\">Password reset code</div>",
            "<div style=\"margin:0 0 24px;padding:18px 20px;border:1px solid #dbe4ff;border-radius:18px;background:#f8fbff;font-size:32px;line-height:1;letter-spacing:0.32em;font-weight:700;text-align:center;color:#0f172a;\">{code}</div>",
            "<p style=\"margin:0 0 16px;font-size:14px;line-height:1.7;color:#4b5563;\">Enter this code in the WareHub password reset form to continue.</p>",
            "<p style=\"margin:0;font-size:13px;line-height:1.7;color:#6b7280;\">If you did not request this, you can safely ignore this email.</p>",
            "</td></tr>",
            "</table>",
            "</td></tr>",
            "</table>",
            "</body>",
            "</html>"
        ),
        code = code,
        expires_in_minutes = expires_in_minutes
    )
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

    #[test]
    fn password_reset_email_uses_warehub_subject_and_multipart_content() {
        let from: Mailbox = "WareHub <no-reply@example.com>"
            .parse()
            .expect("must parse sender");
        let to: Mailbox = "user@example.com".parse().expect("must parse recipient");

        let email = build_password_reset_email(&from, &to, "123456", 10)
            .expect("must build password reset email");
        let formatted =
            String::from_utf8(email.formatted()).expect("formatted email must be valid utf-8");

        assert!(formatted.contains("Subject: Your WareHub password reset code"));
        assert!(formatted.contains("Reset your WareHub password"));
        assert!(formatted.contains("This code expires in 10 minutes."));
        assert!(formatted.contains("123456"));
        assert!(formatted.contains("Content-Type: text/html"));
        assert!(formatted.contains("Content-Type: text/plain"));
    }
}
