from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ebay_service", "0001_ebayoauthcredential"),
    ]

    operations = [
        migrations.AlterField(
            model_name="ebayoauthcredential",
            name="account",
            field=models.CharField(max_length=32, unique=True),
        ),
    ]
