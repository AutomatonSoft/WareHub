from django.contrib import admin

from .models import (
    TelegramAccessBinding,
    TelegramActionAudit,
    TelegramConversationState,
    TelegramMarketplaceJob,
    TelegramUpdateAudit,
)


@admin.register(TelegramAccessBinding)
class TelegramAccessBindingAdmin(admin.ModelAdmin):
    list_display = ("telegram_user_id", "chat_id", "login", "email", "status", "last_seen_at")
    search_fields = ("telegram_user_id", "chat_id", "login", "display_name", "email")
    list_filter = ("status", "is_active", "is_admin")


@admin.register(TelegramConversationState)
class TelegramConversationStateAdmin(admin.ModelAdmin):
    list_display = ("chat_id", "telegram_user_id", "thread_key", "state", "updated_at")
    search_fields = ("chat_id", "telegram_user_id", "thread_key")
    list_filter = ("state",)


@admin.register(TelegramUpdateAudit)
class TelegramUpdateAuditAdmin(admin.ModelAdmin):
    list_display = ("update_id", "chat_id", "telegram_user_id", "thread_key", "update_type", "status", "processed_at")
    search_fields = ("update_id", "chat_id", "telegram_user_id", "thread_key", "error_text")
    list_filter = ("status", "update_type")


@admin.register(TelegramActionAudit)
class TelegramActionAuditAdmin(admin.ModelAdmin):
    list_display = ("action", "kid_number", "chat_id", "telegram_user_id", "status", "created_at")
    search_fields = ("kid_number", "chat_id", "telegram_user_id", "request_id")
    list_filter = ("action", "status")


@admin.register(TelegramMarketplaceJob)
class TelegramMarketplaceJobAdmin(admin.ModelAdmin):
    list_display = (
        "job_id",
        "action",
        "kid_number",
        "job_status",
        "delivery_status",
        "notification_sent_at",
    )
    search_fields = ("job_id", "kid_number", "request_id", "chat_id", "telegram_user_id")
    list_filter = ("action", "job_status", "delivery_status")
