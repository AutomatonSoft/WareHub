from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0012_idempotencyrecord"),
    ]

    operations = [
        migrations.CreateModel(
            name="EANPool",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ean", models.CharField(db_index=True, max_length=64, unique=True)),
                ("status", models.CharField(choices=[("free", "free"), ("reserved", "reserved"), ("used", "used"), ("blocked", "blocked")], db_index=True, default="free", max_length=16)),
                ("reserved_by", models.CharField(blank=True, default="", max_length=150)),
                ("note", models.TextField(blank=True, default="")),
                ("reserved_at", models.DateTimeField(blank=True, null=True)),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="EANUsage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("site", models.CharField(db_index=True, max_length=8)),
                ("site_key", models.CharField(blank=True, db_index=True, default="", max_length=64)),
                ("local_product_id", models.BigIntegerField(blank=True, null=True)),
                ("source_product_id", models.BigIntegerField(blank=True, null=True)),
                ("published_at", models.DateTimeField(auto_now_add=True)),
                ("ean", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="usages", to="database.eanpool")),
            ],
        ),
        migrations.AddConstraint(
            model_name="eanusage",
            constraint=models.UniqueConstraint(fields=("ean", "site", "site_key"), name="uniq_ean_usage_per_site"),
        ),
    ]
