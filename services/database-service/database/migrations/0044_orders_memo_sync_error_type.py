from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("database", "0043_order_memo_afterbuy_sync")]

    operations = [
        migrations.AddField(
            model_name="orders",
            name="memo_sync_error_type",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
    ]
