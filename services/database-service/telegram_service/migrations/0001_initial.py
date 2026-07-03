from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="TelegramAccessBinding",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("telegram_user_id", models.BigIntegerField(unique=True)),
                ("chat_id", models.BigIntegerField(db_index=True)),
                ("thread_key", models.CharField(blank=True, default="", max_length=64)),
                ("login", models.CharField(blank=True, default="", max_length=255)),
                ("display_name", models.CharField(blank=True, default="", max_length=255)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("is_admin", models.BooleanField(db_index=True, default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="TelegramActionAudit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("chat_id", models.BigIntegerField(db_index=True)),
                ("telegram_user_id", models.BigIntegerField(db_index=True)),
                ("thread_key", models.CharField(blank=True, default="", max_length=64)),
                ("action", models.CharField(choices=[("delete", "delete"), ("list", "list")], db_index=True, max_length=32)),
                ("kid_number", models.CharField(db_index=True, max_length=255)),
                ("place", models.CharField(blank=True, default="", max_length=255)),
                ("request_id", models.CharField(blank=True, db_index=True, default="", max_length=255)),
                ("status", models.CharField(choices=[("ok", "ok"), ("partial", "partial"), ("failed", "failed"), ("ignored", "ignored")], db_index=True, default="ok", max_length=32)),
                ("result_payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="TelegramConversationState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("chat_id", models.BigIntegerField(db_index=True)),
                ("telegram_user_id", models.BigIntegerField(db_index=True)),
                ("thread_key", models.CharField(blank=True, default="", max_length=64)),
                ("state", models.CharField(choices=[("idle", "idle"), ("awaiting_action", "awaiting_action"), ("awaiting_kid", "awaiting_kid"), ("awaiting_place", "awaiting_place"), ("awaiting_confirmation", "awaiting_confirmation"), ("processing", "processing"), ("completed", "completed"), ("cancelled", "cancelled")], db_index=True, default="idle", max_length=64)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(fields=("chat_id", "telegram_user_id", "thread_key"), name="uniq_telegram_conversation_state_scope"),
                ],
            },
        ),
        migrations.CreateModel(
            name="TelegramUpdateAudit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("update_id", models.BigIntegerField(unique=True)),
                ("chat_id", models.BigIntegerField(blank=True, db_index=True, null=True)),
                ("telegram_user_id", models.BigIntegerField(blank=True, db_index=True, null=True)),
                ("thread_key", models.CharField(blank=True, default="", max_length=64)),
                ("update_type", models.CharField(blank=True, default="", max_length=64)),
                ("status", models.CharField(choices=[("processed", "processed"), ("ignored", "ignored"), ("failed", "failed")], db_index=True, default="processed", max_length=32)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("error_text", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("processed_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
