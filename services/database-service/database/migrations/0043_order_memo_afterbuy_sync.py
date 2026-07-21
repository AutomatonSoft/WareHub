from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("database", "0042_expand_orders_and_order_items")]

    operations = [
        migrations.AddField(
            model_name="orders",
            name="afterbuy_profile",
            field=models.CharField(blank=True, db_index=True, max_length=8, null=True),
        ),
        migrations.AddField(
            model_name="orders",
            name="memo_sync_error",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="orders",
            name="memo_last_synced_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="orders",
            name="memo_sync_status",
            field=models.CharField(
                choices=[("synced", "Synced"), ("pending", "Pending"), ("failed", "Failed")],
                default="synced",
                max_length=16,
            ),
        ),
    ]
