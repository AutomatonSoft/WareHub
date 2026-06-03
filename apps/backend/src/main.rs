#![recursion_limit = "256"]

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::{env, net::SocketAddr, sync::Arc};
use tokio::sync::{broadcast, RwLock};
use tokio::time::{interval, sleep, Duration, MissedTickBehavior};
use tracing::{error, info, warn};

include!("app_modules.rs");

#[tokio::main]
async fn main() {
    let _ = dotenvy::from_filename("../sofortbot-infra/.env");
    let _ = dotenvy::dotenv();
    setup_tracing();

    let app_env = env::var("APP_ENV").unwrap_or_else(|_| "dev".to_string());
    let _sentry_guard = init_sentry(&app_env);
    let app_port = env::var("APP_PORT").unwrap_or_else(|_| "8932".to_string());
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL is required");
    let db_connect_retries = env::var("DB_CONNECT_RETRIES")
        .ok()
        .and_then(|raw| raw.parse::<u32>().ok())
        .filter(|value| *value >= 1)
        .unwrap_or(10);
    let db_connect_delay_ms = env::var("DB_CONNECT_RETRY_DELAY_MS")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .filter(|value| *value >= 50)
        .unwrap_or(1000);

    let skip_db_migrations = env::var("SKIP_DB_MIGRATIONS")
        .ok()
        .map(|raw| {
            let normalized = raw.trim().to_ascii_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        })
        .unwrap_or(false);

    let db = connect_postgres_with_retry(
        &database_url,
        10,
        db_connect_retries,
        Duration::from_millis(db_connect_delay_ms),
    )
    .await
    .expect("failed to connect to postgres");

    if skip_db_migrations {
        warn!("SKIP_DB_MIGRATIONS is enabled; runtime sqlx migrations are skipped");
    } else {
        sqlx::migrate!("./migrations")
            .run(&db)
            .await
            .expect("failed to run database migrations");
    }
    let _ = purge_expired_inactive_intakes(&db).await;

    ensure_admin_account(&db).await;

    let addr: SocketAddr = format!("0.0.0.0:{app_port}")
        .parse()
        .expect("invalid APP_PORT value");

    let (intake_events, _) = broadcast::channel::<IntakeEventMessage>(512);
    let state = AppState {
        app_env,
        db,
        intake_events,
        logs: Arc::new(RwLock::new(InMemoryLogs::default())),
    };
    append_service_log(
        &state,
        "backend",
        "info",
        "backend service initialized",
        None,
    )
    .await;
    spawn_orphan_photo_cleanup_task(state.clone());

    let app = build_app(state);

    info!(%addr, "starting sofortbot-backend");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind TCP listener");
    axum::serve(listener, app)
        .await
        .expect("axum server failed");
}

async fn connect_postgres_with_retry(
    database_url: &str,
    max_connections: u32,
    retries: u32,
    delay: Duration,
) -> Result<PgPool, sqlx::Error> {
    let mut attempt = 1_u32;
    loop {
        match PgPoolOptions::new()
            .max_connections(max_connections)
            .connect(database_url)
            .await
        {
            Ok(pool) => {
                if attempt > 1 {
                    info!(attempt, "postgres connection recovered");
                }
                return Ok(pool);
            }
            Err(error) => {
                if attempt >= retries {
                    error!(attempt, retries, %error, "postgres connection failed");
                    return Err(error);
                }
                warn!(
                    attempt,
                    retries,
                    %error,
                    delay_ms = delay.as_millis() as u64,
                    "postgres not ready, retrying"
                );
                sleep(delay).await;
                attempt = attempt.saturating_add(1);
            }
        }
    }
}

fn setup_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,sofortbot_backend=debug,tower_http=info".into());
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .with_current_span(true)
        .with_span_list(true)
        .init();
}

fn spawn_orphan_photo_cleanup_task(state: AppState) {
    let enabled = env_flag("AUTO_ORPHAN_PHOTO_CLEANUP_ENABLED", true);
    if !enabled {
        return;
    }

    let retention_days = env::var("AUTO_ORPHAN_PHOTO_CLEANUP_RETENTION_DAYS")
        .ok()
        .and_then(|raw| raw.parse::<i64>().ok())
        .unwrap_or(7)
        .clamp(1, 3650);
    let limit_per_run = env::var("AUTO_ORPHAN_PHOTO_CLEANUP_LIMIT")
        .ok()
        .and_then(|raw| raw.parse::<i64>().ok())
        .unwrap_or(200)
        .clamp(1, 5000);
    let interval_minutes = env::var("AUTO_ORPHAN_PHOTO_CLEANUP_INTERVAL_MINUTES")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(60)
        .clamp(5, 24 * 60);

    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(interval_minutes * 60));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
        ticker.tick().await;

        loop {
            match run_auto_orphan_photo_cleanup(&state, retention_days, limit_per_run).await {
                Ok(stats) => {
                    if stats.scanned > 0 || stats.failed_files > 0 {
                        info!(
                            scanned = stats.scanned,
                            deleted_files = stats.deleted_files,
                            failed_files = stats.failed_files,
                            cleared_rows = stats.cleared_rows,
                            retention_days,
                            limit_per_run,
                            "auto orphan photo cleanup completed"
                        );
                    }
                }
                Err(error) => {
                    warn!(%error, retention_days, limit_per_run, "auto orphan photo cleanup failed");
                }
            }
            ticker.tick().await;
        }
    });
}

#[cfg(test)]
mod main_tests;
