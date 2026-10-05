from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("database", "0052_ean_ebay_dep")]

    operations = [
        migrations.AddField(
            model_name="kid",
            name="archived",
            field=models.BooleanField(default=False, db_index=True),
        ),
    ]
