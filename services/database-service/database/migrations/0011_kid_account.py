from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("database", "0010_orders_additional_items"),
    ]

    operations = [
        migrations.AddField(
            model_name="kid",
            name="account",
            field=models.CharField(
                blank=True,
                choices=[("JV", "JV"), ("XL", "XL"), ("CH", "CH")],
                db_index=True,
                max_length=8,
                null=True,
            ),
        ),
    ]

