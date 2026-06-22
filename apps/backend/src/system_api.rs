#[path = "system_afterbuy_health.rs"]
mod system_afterbuy_health;
#[path = "system_health.rs"]
mod system_health;
#[path = "system_openapi.rs"]
mod system_openapi;
#[path = "system_openapi_paths.rs"]
mod system_openapi_paths;
#[path = "system_uploads.rs"]
mod system_uploads;
#[path = "system_uploads_cleanup.rs"]
mod system_uploads_cleanup;

pub(crate) use self::system_afterbuy_health::afterbuy_health;
pub(crate) use self::system_health::{api_meta, healthz, mobile_app_update, readyz};
pub(crate) use self::system_openapi::{openapi_json, scalar_ui};
pub(crate) use self::system_uploads::upload_photo;
pub(crate) use self::system_uploads_cleanup::delete_uploaded_photo_by_url;
