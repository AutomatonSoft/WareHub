from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("database", "0049_replace_main_ean_with_main_ean_jv_and_main_ean_xl"),
    ]

    operations = [
        migrations.AddField(
            model_name="ean",
            name="temu",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="eanstatus",
            name="temu",
            field=models.BooleanField(default=False),
        ),
    ]
