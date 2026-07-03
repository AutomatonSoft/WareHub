from django.db import models


class TelegramConversationState(models.Model):
    STATE_CHOICES = [
        ("idle", "idle"),
        ("awaiting_action", "awaiting_action"),
        ("awaiting_kid", "awaiting_kid"),
        ("awaiting_place", "awaiting_place"),
        ("awaiting_main_ean", "awaiting_main_ean"),
        ("awaiting_quantity", "awaiting_quantity"),
        ("awaiting_price", "awaiting_price"),
        ("awaiting_confirmation", "awaiting_confirmation"),
        ("processing", "processing"),
        ("completed", "completed"),
        ("cancelled", "cancelled"),
    ]

    chat_id = models.BigIntegerField(db_index=True)
    telegram_user_id = models.BigIntegerField(db_index=True)
    thread_key = models.CharField(max_length=64, blank=True, default="")
    state = models.CharField(max_length=64, choices=STATE_CHOICES, default="idle", db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["chat_id", "telegram_user_id", "thread_key"],
                name="uniq_telegram_conversation_state_scope",
            ),
        ]


class TelegramAccessBinding(models.Model):
    telegram_user_id = models.BigIntegerField(unique=True)
    chat_id = models.BigIntegerField(db_index=True)
    thread_key = models.CharField(max_length=64, blank=True, default="")
    login = models.CharField(max_length=255, blank=True, default="")
    display_name = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    is_admin = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class TelegramUpdateAudit(models.Model):
    STATUS_CHOICES = [
        ("processed", "processed"),
        ("ignored", "ignored"),
        ("failed", "failed"),
    ]

    update_id = models.BigIntegerField(unique=True)
    chat_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    telegram_user_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    thread_key = models.CharField(max_length=64, blank=True, default="")
    update_type = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="processed", db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    error_text = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(auto_now=True)


class TelegramActionAudit(models.Model):
    ACTION_CHOICES = [
        ("delete", "delete"),
        ("list", "list"),
    ]
    STATUS_CHOICES = [
        ("ok", "ok"),
        ("partial", "partial"),
        ("failed", "failed"),
        ("ignored", "ignored"),
    ]

    chat_id = models.BigIntegerField(db_index=True)
    telegram_user_id = models.BigIntegerField(db_index=True)
    thread_key = models.CharField(max_length=64, blank=True, default="")
    action = models.CharField(max_length=32, choices=ACTION_CHOICES, db_index=True)
    kid_number = models.CharField(max_length=255, db_index=True)
    place = models.CharField(max_length=255, blank=True, default="")
    request_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="ok", db_index=True)
    result_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class TelegramMarketplaceJob(models.Model):
    ACTION_CHOICES = [
        ("delete", "delete"),
        ("list", "list"),
    ]
    DELIVERY_STATUS_CHOICES = [
        ("pending", "pending"),
        ("processing", "processing"),
        ("sent", "sent"),
    ]

    chat_id = models.BigIntegerField(db_index=True)
    telegram_user_id = models.BigIntegerField(db_index=True)
    thread_key = models.CharField(max_length=64, blank=True, default="")
    action = models.CharField(max_length=32, choices=ACTION_CHOICES, db_index=True)
    kid_number = models.CharField(max_length=255, db_index=True)
    place = models.CharField(max_length=255, blank=True, default="")
    request_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    job_id = models.CharField(max_length=255, unique=True)
    job_status = models.CharField(max_length=64, blank=True, default="queued", db_index=True)
    response_status = models.CharField(max_length=64, blank=True, default="")
    delivery_status = models.CharField(
        max_length=32,
        choices=DELIVERY_STATUS_CHOICES,
        default="pending",
        db_index=True,
    )
    result_payload = models.JSONField(default=dict, blank=True)
    error_text = models.TextField(blank=True, default="")
    last_polled_at = models.DateTimeField(null=True, blank=True)
    lease_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    notification_sent_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
