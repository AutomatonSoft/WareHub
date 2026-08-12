from django.db import migrations, models


PLACEHOLDER_EAN = "0000000000000"


def backfill_main_ean(apps, schema_editor):
    Ean = apps.get_model("database", "Ean")
    Ean.objects.filter(main_ean__isnull=True).update(main_ean=PLACEHOLDER_EAN)
    Ean.objects.filter(main_ean="").update(main_ean=PLACEHOLDER_EAN)


class Migration(migrations.Migration):
    dependencies = [
        ("database", "0028_productattributes_company"),
    ]

    operations = [
        migrations.AddField(
            model_name="ean",
            name="main_ean",
            field=models.CharField(blank=True, max_length=13, null=True),
        ),
        migrations.RunPython(backfill_main_ean, migrations.RunPython.noop),
    ]
