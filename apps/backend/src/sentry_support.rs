use std::env;

pub(crate) fn init_sentry(app_env: &str) -> Option<sentry::ClientInitGuard> {
    let dsn = env::var("BACKEND_SENTRY_DSN")
        .ok()
        .or_else(|| env::var("SENTRY_DSN").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())?;
    let traces_sample_rate = parse_sentry_traces_sample_rate(
        env::var("BACKEND_SENTRY_TRACES_SAMPLE_RATE")
            .ok()
            .or_else(|| env::var("SENTRY_TRACES_SAMPLE_RATE").ok()),
    );

    Some(sentry::init((
        dsn,
        sentry::ClientOptions {
            release: sentry::release_name!(),
            environment: Some(app_env.to_string().into()),
            traces_sample_rate,
            ..Default::default()
        },
    )))
}

pub(crate) fn capture_internal_error(message: &str, request_id: &str) {
    if sentry::Hub::current().client().is_none() {
        return;
    }
    sentry::with_scope(
        |scope| {
            scope.set_tag("request_id", request_id.to_string());
            scope.set_tag("error_code", "internal_error");
        },
        || {
            sentry::capture_message(message, sentry::Level::Error);
        },
    );
}

fn parse_sentry_traces_sample_rate(raw: Option<String>) -> f32 {
    raw.and_then(|value| value.trim().parse::<f32>().ok())
        .filter(|value| (0.0..=1.0).contains(value))
        .unwrap_or(0.1)
}

#[cfg(test)]
mod tests {
    use super::parse_sentry_traces_sample_rate;

    #[test]
    fn parse_sentry_traces_sample_rate_accepts_valid_value() {
        let parsed = parse_sentry_traces_sample_rate(Some("0.25".to_string()));
        assert_eq!(parsed, 0.25);
    }

    #[test]
    fn parse_sentry_traces_sample_rate_falls_back_on_invalid_value() {
        let parsed = parse_sentry_traces_sample_rate(Some("2.0".to_string()));
        assert_eq!(parsed, 0.1);
    }
}
