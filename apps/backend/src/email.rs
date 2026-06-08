use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use std::env;

pub(crate) async fn send_password_reset_email(to: &str, code: &str) -> Result<(), String> {
    let smtp_host = env::var("SMTP_HOST")
        .map_err(|_| "SMTP_HOST is required for email delivery".to_string())?;
    let smtp_from = env::var("SMTP_FROM")
        .map_err(|_| "SMTP_FROM is required for email delivery".to_string())?;
    let smtp_port = env::var("SMTP_PORT")
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .unwrap_or(587);
    let smtp_user = env::var("SMTP_USERNAME").ok();
    let smtp_pass = env::var("SMTP_PASSWORD").ok();
    let smtp_insecure = env::var("SMTP_INSECURE")
        .ok()
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
    let to: Mailbox = to
        .parse()
        .map_err(|error| format!("invalid reset email address: {error}"))?;

    let subject = "SofortBot password reset code";
    let body = format!("Your password reset code is: {code}\n\nThis code will expire soon.");

    let email = Message::builder()
        .from(from)
        .to(to)
        .subject(subject)
        .body(body)
        .map_err(|error| format!("failed to build email: {error}"))?;

    let mut builder = if smtp_insecure {
        SmtpTransport::builder_dangerous(&smtp_host).port(smtp_port)
    } else {
        SmtpTransport::relay(&smtp_host)
            .map_err(|error| format!("failed to configure SMTP transport: {error}"))?
            .port(smtp_port)
    };

    if let (Some(user), Some(pass)) = (smtp_user, smtp_pass) {
        builder = builder.credentials(Credentials::new(user, pass));
    }

    let transport = builder.build();

    tokio::task::spawn_blocking(move || transport.send(&email))
        .await
        .map_err(|error| format!("email send task failed: {error}"))?
        .map_err(|error| format!("failed to send reset email: {error}"))?;

    Ok(())
}
