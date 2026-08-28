from django.db import migrations, models


def copy_legacy_main_ean(apps, schema_editor):
    Ean = apps.get_model("database", "Ean")
    for ean_row in Ean.objects.exclude(main_ean__isnull=True).exclude(main_ean="").iterator():
        update_fields = []
        if not ean_row.main_ean_jv:
            ean_row.main_ean_jv = ean_row.main_ean
            update_fields.append("main_ean_jv")
        if not ean_row.main_ean_xl:
            ean_row.main_ean_xl = ean_row.main_ean
            update_fields.append("main_ean_xl")
        if update_fields:
            ean_row.save(update_fields=update_fields)


def restore_legacy_main_ean(apps, schema_editor):
    Ean = apps.get_model("database", "Ean")
    for ean_row in Ean.objects.filter(main_ean__isnull=True).iterator():
        ean_row.main_ean = ean_row.main_ean_jv or ean_row.main_ean_xl
        ean_row.save(update_fields=["main_ean"])


class Migration(migrations.Migration):
    dependencies = [
        ("database", "0048_alter_kid_in_stock_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="ean",
            name="main_ean_jv",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="ean",
            name="main_ean_xl",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.RunPython(copy_legacy_main_ean, restore_legacy_main_ean),
        migrations.RemoveField(
            model_name="ean",
            name="main_ean",
        ),
    ]
