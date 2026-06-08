mod admin_user_management;
mod dto;
mod guards;
mod handlers;
mod handlers_admin;
mod handlers_password_reset;
mod models;
mod password;
mod profile_handlers;
mod registration_errors;
mod repository;
mod service;
mod validation;

pub(crate) use admin_user_management::admin_delete_user;
pub(crate) use guards::{require_admin_user, require_approved_user};
pub(crate) use handlers::{
    admin_approve_registration, admin_list_pending_registrations, admin_list_users,
    admin_pending_registration_count, admin_reject_registration, admin_update_user_role,
    confirm_password_reset, login_user, logout_user, register_user, request_password_reset,
};
pub(crate) use password::hash_password;
pub(crate) use profile_handlers::{auth_change_password, auth_me, auth_update_me};
