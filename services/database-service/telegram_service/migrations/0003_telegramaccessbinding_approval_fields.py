from django.db import migrations, models


def backfill_binding_statuses(apps, schema_editor):
    binding_model = apps.get_model("telegram_service", "TelegramAccessBinding")
    for binding in binding_model.objects.all().iterator():
        binding.status = "approved" if binding.is_active else "revoked"
        binding.requested_at = binding.created_at
        if binding.is_active:
            binding.approved_at = binding.updated_at
        else:
            binding.revoked_at = binding.updated_at
        binding.save(
            update_fields=[
                "status",
                "requested_at",
                "approved_at",
                "revoked_at",
            ]
        )


class Migration(migrations.Migration):
    dependencies = [
        ("telegram_service", "0002_telegrammarketplacejob"),
    ]

    operations = [
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="approved_by",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="last_seen_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="requested_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="revoked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="revoked_by",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="status",
            field=models.CharField(
                choices=[("pending", "pending"), ("approved", "approved"), ("revoked", "revoked")],
                db_index=True,
                default="pending",
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="telegramaccessbinding",
            name="telegram_user_id",
            field=models.BigIntegerField(),
        ),
        migrations.RunPython(backfill_binding_statuses, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="telegramaccessbinding",
            constraint=models.UniqueConstraint(
                fields=("telegram_user_id", "chat_id"),
                name="uniq_telegram_access_binding_scope",
            ),
        ),
    ]
