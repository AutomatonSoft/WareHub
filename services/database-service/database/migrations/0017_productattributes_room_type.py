from django.db import migrations, models


def backfill_room_type_from_kid(apps, schema_editor):
    ProductAttributes = apps.get_model("database", "ProductAttributes")
    Kid = apps.get_model("database", "Kid")
    db_alias = schema_editor.connection.alias

    for kid in Kid.objects.using(db_alias).all().iterator():
        ProductAttributes.objects.using(db_alias).update_or_create(
            kid_id=kid.id,
            defaults={
                "room": getattr(kid, "room", None),
                "furniture_type": getattr(kid, "furniture_type", None),
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0016_productattributes"),
    ]

    operations = [
        migrations.AddField(
            model_name="productattributes",
            name="furniture_type",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddField(
            model_name="productattributes",
            name="room",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.RunPython(backfill_room_type_from_kid, migrations.RunPython.noop),
    ]
