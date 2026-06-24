from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0025_move_room_type_to_kid_only"),
    ]

    operations = [
        migrations.AddField(
            model_name="productattributes",
            name="quantity",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.RunSQL(
            sql="""
                UPDATE database_productattributes
                SET currency = 'EUR'
                WHERE currency IS NULL OR btrim(currency) = '' OR currency <> 'EUR';
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
