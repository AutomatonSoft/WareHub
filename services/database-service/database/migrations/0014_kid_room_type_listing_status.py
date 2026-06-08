from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0013_eanpool_eanusage"),
    ]

    operations = [
        migrations.AddField(
            model_name="kid",
            name="furniture_type",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddField(
            model_name="kid",
            name="listing_status",
            field=models.CharField(db_index=True, default="unlisted", max_length=16),
        ),
        migrations.AddField(
            model_name="kid",
            name="room",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
    ]
