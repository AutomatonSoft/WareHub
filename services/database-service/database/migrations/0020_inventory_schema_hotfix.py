from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0019_reconcile_inventory_schema"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE database_kid
                ADD COLUMN IF NOT EXISTS b_ware boolean NOT NULL DEFAULT false;
                ALTER TABLE database_kid
                ADD COLUMN IF NOT EXISTS commentary text NULL;
                ALTER TABLE database_orders
                ADD COLUMN IF NOT EXISTS payment_status varchar(255) NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
