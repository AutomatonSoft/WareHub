from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("database", "0020_inventory_schema_hotfix"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE database_kid
                        ADD COLUMN IF NOT EXISTS in_transit boolean NOT NULL DEFAULT false;
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="kid",
                    name="in_transit",
                    field=models.BooleanField(default=False),
                ),
            ],
        ),
    ]
