from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("xl_services", "0001_xl_batch_tables"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="XLBatchJob",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("ean", models.CharField(db_index=True, max_length=64)),
                        ("site_family", models.CharField(choices=[("XL", "XL")], db_index=True, max_length=8)),
                        ("status", models.CharField(choices=[("pending", "Pending"), ("applied", "Applied"), ("failed", "Failed")], db_index=True, default="pending", max_length=16)),
                        ("initiated_by", models.CharField(default="system", max_length=150)),
                        ("idempotency_key", models.CharField(blank=True, db_index=True, default="", max_length=255)),
                        ("request_payload", models.JSONField(blank=True, default=dict)),
                        ("result_summary", models.JSONField(blank=True, default=dict)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                    ],
                    options={
                        "db_table": "xl_batch_jobs",
                        "ordering": ["-created_at"],
                    },
                ),
                migrations.CreateModel(
                    name="XLBatchJobItem",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("site", models.CharField(choices=[("XL", "XL"), ("JV", "JV")], db_index=True, max_length=8)),
                        ("site_key", models.CharField(blank=True, db_index=True, default="", max_length=64)),
                        ("domain", models.CharField(blank=True, default="", max_length=255)),
                        ("status", models.CharField(choices=[("pending", "Pending"), ("applied", "Applied"), ("failed", "Failed"), ("skipped", "Skipped")], db_index=True, default="pending", max_length=16)),
                        ("source_product_id", models.BigIntegerField(blank=True, null=True)),
                        ("effective_ean", models.CharField(blank=True, default="", max_length=64)),
                        ("currency_code", models.CharField(blank=True, default="", max_length=8)),
                        ("old_price", models.DecimalField(blank=True, decimal_places=4, max_digits=15, null=True)),
                        ("new_price", models.DecimalField(blank=True, decimal_places=4, max_digits=15, null=True)),
                        ("error_code", models.CharField(blank=True, default="", max_length=128)),
                        ("error_text", models.TextField(blank=True, default="")),
                        ("details", models.JSONField(blank=True, default=dict)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("job", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="xl_services.xlbatchjob")),
                    ],
                    options={
                        "db_table": "xl_batch_job_items",
                        "ordering": ["id"],
                    },
                ),
            ],
        ),
    ]

