use axum::{
    extract::DefaultBodyLimit,
    http::{header, HeaderName, HeaderValue, Method},
    middleware,
    response::Redirect,
    routing::{delete, get, patch, post},
    Router,
};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    services::ServeDir,
    trace::TraceLayer,
};

use crate::{
    admin_approve_registration, admin_delete_user, admin_list_pending_registrations,
    admin_list_users, admin_pending_registration_count, admin_reject_registration,
    admin_update_user_role, afterbuy_health, api_meta, auth_change_password, auth_me,
    auth_update_me, backend_request_log_middleware, confirm_authenticated_password_change,
    confirm_password_reset, create_database_inventory_kid, create_intake, create_service_log, cleanup_removed_intake_photos,
    delete_intake, delete_oldest_intake_by_location, env_flag, fetch_afterbuy_order,
    fetch_afterbuy_orders_by_kid, get_photo_cleanup_retry_queue_status,
    get_label_layout_settings, get_printer_setup_settings, healthz,
    intakes_ws_handler, list_database_inventory_filter_options, list_database_inventory_rows,
    list_intake_delete_audit_logs, list_intakes, list_product_stats,
    list_service_logs, login_user, logout_user, mobile_app_update, openapi_json, readyz,
    refresh_user, register_user, request_authenticated_password_change_code,
    request_password_reset, scalar_ui, service_logs_page,
    mark_database_inventory_out_of_stock, suggest_placement, update_database_inventory_kid_photo, update_intake_photo,
    update_label_layout_settings, update_printer_setup_settings, upload_photo, AppState,
};

pub(crate) fn build_app(state: AppState) -> Router {
    let request_id_header = HeaderName::from_static("x-request-id");
    let log_state = state.clone();

    let api_v1 = Router::new()
        .route("/openapi.json", get(openapi_json))
        .route("/scalar", get(scalar_ui))
        .route("/meta", get(api_meta))
        .route("/mobile/app-update", get(mobile_app_update))
        .route("/logs", get(service_logs_page))
        .route(
            "/logs/:channel",
            get(list_service_logs).post(create_service_log),
        )
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/intakes", post(create_intake).get(list_intakes))
        .route("/inventory/rows", get(list_database_inventory_rows))
        .route(
            "/inventory/filter-options",
            get(list_database_inventory_filter_options),
        )
        .route("/inventory/kids", post(create_database_inventory_kid))
        .route(
            "/inventory/mark-out-of-stock",
            post(mark_database_inventory_out_of_stock),
        )
        .route(
            "/services/kids/mark-out-of-stock/",
            post(mark_database_inventory_out_of_stock),
        )
        .route(
            "/inventory/kids/:kid_ref/photo",
            patch(update_database_inventory_kid_photo),
        )
        .route("/kids", post(create_intake))
        .route("/kids/", post(create_intake))
        .route("/intakes/products/stats", get(list_product_stats))
        .route("/intakes/suggest-placement", post(suggest_placement))
        .route("/intakes/ws", get(intakes_ws_handler))
        .route(
            "/label-layout",
            get(get_label_layout_settings).put(update_label_layout_settings),
        )
        .route(
            "/printer-setup",
            get(get_printer_setup_settings).put(update_printer_setup_settings),
        )
        .route("/intakes/by-location", delete(delete_oldest_intake_by_location))
        .route("/intakes/:intake_id", delete(delete_intake))
        .route("/intakes/:intake_id/photo", patch(update_intake_photo))
        .route("/afterbuy/orders/:order_id", get(fetch_afterbuy_order))
        .route(
            "/afterbuy/kids/:kid_number/orders",
            get(fetch_afterbuy_orders_by_kid),
        )
        .route("/afterbuy/health", get(afterbuy_health))
        .route(
            "/uploads",
            post(upload_photo).layer(DefaultBodyLimit::max(upload_body_limit_bytes())),
        )
        .route("/auth/register", post(register_user))
        .route("/auth/login", post(login_user))
        .route("/auth/logout", post(logout_user))
        .route("/auth/refresh", post(refresh_user))
        .route("/auth/me", get(auth_me).patch(auth_update_me))
        .route("/auth/me/password", post(auth_change_password))
        .route("/auth/me/password/request-code", post(request_authenticated_password_change_code))
        .route("/auth/me/password/confirm", post(confirm_authenticated_password_change))
        .route("/auth/password/reset/request", post(request_password_reset))
        .route("/auth/password/reset/confirm", post(confirm_password_reset))
        .route(
            "/admin/registrations/pending",
            get(admin_list_pending_registrations),
        )
        .route(
            "/admin/registrations/pending/count",
            get(admin_pending_registration_count),
        )
        .route(
            "/admin/registrations/:user_id/approve",
            post(admin_approve_registration),
        )
        .route(
            "/admin/registrations/:user_id/reject",
            post(admin_reject_registration),
        )
        .route("/admin/users", get(admin_list_users))
        .route("/admin/users/:user_id/role", patch(admin_update_user_role));
    let api_v1 = api_v1.route("/admin/users/:user_id", delete(admin_delete_user));
    let api_v1 = api_v1.route(
        "/admin/intakes/photos/cleanup",
        post(cleanup_removed_intake_photos),
    );
    let api_v1 = api_v1.route(
        "/admin/intakes/photos/cleanup/status",
        get(get_photo_cleanup_retry_queue_status),
    );
    let api_v1 = api_v1.route(
        "/admin/audit/intakes/deletions",
        get(list_intake_delete_audit_logs),
    );

    let mut app = Router::new()
        .route("/", get(backend_root_redirect))
        .nest("/api/v1", api_v1);

    let expose_uploads_public = state.app_env == "dev" || env_flag("EXPOSE_UPLOADS_PUBLIC", false);
    if expose_uploads_public {
        app = app.nest_service("/uploads", ServeDir::new("uploads"));
    }

    app.layer(PropagateRequestIdLayer::new(request_id_header.clone()))
        .layer(SetRequestIdLayer::new(request_id_header, MakeRequestUuid))
        .layer(TraceLayer::new_for_http())
        .layer(middleware::from_fn_with_state(
            log_state,
            backend_request_log_middleware,
        ))
        .layer(build_cors_layer(&state))
        .with_state(state)
}

async fn backend_root_redirect() -> Redirect {
    Redirect::temporary("/api/v1/scalar")
}

const DEFAULT_UPLOAD_MAX_BODY_BYTES: usize = 12 * 1024 * 1024;
const MIN_UPLOAD_MAX_BODY_BYTES: usize = 1024 * 1024;
const MAX_UPLOAD_MAX_BODY_BYTES: usize = 50 * 1024 * 1024;

fn upload_body_limit_bytes() -> usize {
    parse_upload_body_limit_bytes(std::env::var("UPLOAD_MAX_BODY_BYTES").ok().as_deref())
}

fn parse_upload_body_limit_bytes(raw: Option<&str>) -> usize {
    raw.and_then(|value| value.trim().parse::<usize>().ok())
        .map(|value| value.clamp(MIN_UPLOAD_MAX_BODY_BYTES, MAX_UPLOAD_MAX_BODY_BYTES))
        .unwrap_or(DEFAULT_UPLOAD_MAX_BODY_BYTES)
}

fn build_cors_layer(state: &AppState) -> CorsLayer {
    let mut layer = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::ACCEPT,
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            HeaderName::from_static("x-request-id"),
        ])
        .allow_credentials(true);

    let configured_origins = std::env::var("CORS_ALLOW_ORIGINS").unwrap_or_default();
    let origins: Vec<HeaderValue> = configured_origins
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .filter_map(|item| HeaderValue::from_str(item).ok())
        .collect();

    if !origins.is_empty() {
        layer = layer.allow_origin(AllowOrigin::list(origins));
    } else if matches!(state.app_env.as_str(), "dev" | "local") {
        layer = layer.allow_origin(AllowOrigin::list(default_dev_cors_origins()));
    }

    layer
}

fn default_dev_cors_origins() -> Vec<HeaderValue> {
    [
        "http://localhost:8931",
        "http://127.0.0.1:8931",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    .into_iter()
    .filter_map(|origin| HeaderValue::from_str(origin).ok())
    .collect()
}

#[cfg(test)]
mod tests {
    use super::parse_upload_body_limit_bytes;

    #[test]
    fn upload_body_limit_uses_default_when_missing() {
        assert_eq!(parse_upload_body_limit_bytes(None), 12 * 1024 * 1024);
    }

    #[test]
    fn upload_body_limit_reads_value() {
        assert_eq!(
            parse_upload_body_limit_bytes(Some("16777216")),
            16 * 1024 * 1024
        );
    }

    #[test]
    fn upload_body_limit_clamps_invalid_range() {
        assert_eq!(parse_upload_body_limit_bytes(Some("512")), 1024 * 1024);
        assert_eq!(
            parse_upload_body_limit_bytes(Some("999999999")),
            50 * 1024 * 1024
        );
    }
}
