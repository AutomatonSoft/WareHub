from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("telegram_service", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="TelegramMarketplaceJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("chat_id", models.BigIntegerField(db_index=True)),
                ("telegram_user_id", models.BigIntegerField(db_index=True)),
                ("thread_key", models.CharField(blank=True, default="", max_length=64)),
                ("action", models.CharField(choices=[("delete", "delete"), ("list", "list")], db_index=True, max_length=32)),
                ("kid_number", models.CharField(db_index=True, max_length=255)),
                ("place", models.CharField(blank=True, default="", max_length=255)),
                ("request_id", models.CharField(blank=True, db_index=True, default="", max_length=255)),
                ("job_id", models.CharField(max_length=255, unique=True)),
                ("job_status", models.CharField(blank=True, db_index=True, default="queued", max_length=64)),
                ("response_status", models.CharField(blank=True, default="", max_length=64)),
                (
                    "delivery_status",
                    models.CharField(
                        choices=[("pending", "pending"), ("processing", "processing"), ("sent", "sent")],
                        db_index=True,
                        default="pending",
                        max_length=32,
                    ),
                ),
                ("result_payload", models.JSONField(blank=True, default=dict)),
                ("error_text", models.TextField(blank=True, default="")),
                ("last_polled_at", models.DateTimeField(blank=True, null=True)),
                ("lease_expires_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("notification_sent_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
