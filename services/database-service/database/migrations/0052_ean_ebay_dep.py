from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("database", "0051_ebay_listing"),
    ]

    operations = [
        migrations.AddField(
            model_name="ean",
            name="ebay_dep",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="eanstatus",
            name="ebay_dep",
            field=models.BooleanField(default=False),
        ),
    ]
