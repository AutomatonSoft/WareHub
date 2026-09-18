from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("database", "0050_ean_temu"),
    ]

    operations = [
        migrations.CreateModel(
            name="EbayListing",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("account", models.CharField(db_index=True, max_length=16)),
                ("marketplace_id", models.CharField(default="EBAY_DE", max_length=32)),
                ("listing_mode", models.CharField(choices=[("inventory", "Inventory API"), ("legacy", "Trading API")], max_length=16)),
                ("source_ean", models.CharField(blank=True, db_index=True, default="", max_length=64)),
                ("sku", models.CharField(blank=True, default="", max_length=64)),
                ("offer_id", models.CharField(blank=True, default="", max_length=64)),
                ("item_id", models.CharField(blank=True, default="", max_length=64)),
                ("legacy_ean_to_variation_sku", models.JSONField(blank=True, default=dict)),
                ("merchant_location_key", models.CharField(blank=True, default="", max_length=50)),
                ("status", models.CharField(choices=[("active", "Active"), ("withdrawn", "Withdrawn"), ("ended", "Ended"), ("unknown", "Unknown")], default="unknown", max_length=16)),
                ("last_operation", models.CharField(blank=True, default="", max_length=32)),
                ("last_error", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddConstraint(
            model_name="ebaylisting",
            constraint=models.UniqueConstraint(condition=~Q(("sku", "")), fields=("account", "marketplace_id", "sku"), name="uniq_ebay_listing_account_marketplace_sku"),
        ),
        migrations.AddConstraint(
            model_name="ebaylisting",
            constraint=models.UniqueConstraint(condition=~Q(("item_id", "")), fields=("account", "marketplace_id", "item_id"), name="uniq_ebay_listing_account_marketplace_item_id"),
        ),
    ]
