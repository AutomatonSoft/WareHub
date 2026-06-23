from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0023_alter_orders_kid_ean"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE database_kid
                        ADD COLUMN IF NOT EXISTS furniture_type varchar(128) NULL;

                        UPDATE database_kid AS kid
                        SET furniture_type = attrs.furniture_type
                        FROM database_productattributes AS attrs
                        WHERE attrs.kid_id = kid.id
                          AND attrs.furniture_type IS NOT NULL
                          AND btrim(attrs.furniture_type) <> ''
                          AND (
                              kid.furniture_type IS NULL
                              OR btrim(kid.furniture_type) = ''
                          );
                    """,
                    reverse_sql="""
                        ALTER TABLE database_kid
                        DROP COLUMN IF EXISTS furniture_type;
                    """,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="kid",
                    name="furniture_type",
                    field=models.CharField(blank=True, max_length=128, null=True),
                ),
            ],
        ),
    ]
