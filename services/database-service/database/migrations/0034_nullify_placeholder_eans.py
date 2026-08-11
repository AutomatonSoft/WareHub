from django.db import migrations


PLACEHOLDER_EAN = "0000000000000"
EAN_FIELDS = (
    "main_ean",
    "jv",
    "xl",
    "otto_jv",
    "otto_xl",
    "kaufland_jv",
    "kaufland_xl",
    "hood_jv",
    "hood_xl",
    "ebay_jv",
    "ebay_xl",
)


def nullify_placeholder_eans(apps, schema_editor):
    Ean = apps.get_model("database", "Ean")
    db_alias = schema_editor.connection.alias

    for ean_row in Ean.objects.using(db_alias).all().iterator():
        update_fields: list[str] = []
        for field_name in EAN_FIELDS:
            current_value = getattr(ean_row, field_name, None)
            normalized = str(current_value or "").strip()
            if normalized in ("", PLACEHOLDER_EAN):
                if current_value is not None:
                    setattr(ean_row, field_name, None)
                    update_fields.append(field_name)
        if update_fields:
            ean_row.save(using=db_alias, update_fields=update_fields)


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0033_alter_ean_ebay_jv_alter_ean_ebay_xl_and_more"),
    ]

    operations = [
        migrations.RunPython(nullify_placeholder_eans, migrations.RunPython.noop),
    ]
