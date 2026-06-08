from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ("database", "0018_alter_productattributes_id"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE database_orders
                        ADD COLUMN IF NOT EXISTS payment_status varchar(255) NULL;
                        ALTER TABLE database_orders
                        DROP COLUMN IF EXISTS global_price;
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE database_kid
                        ADD COLUMN IF NOT EXISTS b_ware boolean NOT NULL DEFAULT false;
                        ALTER TABLE database_kid
                        ADD COLUMN IF NOT EXISTS commentary text NULL;
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="orders",
                    name="payment_status",
                    field=models.CharField(max_length=255, null=True, blank=True),
                ),
                migrations.RemoveField(
                    model_name="orders",
                    name="global_price",
                ),
                migrations.AddField(
                    model_name="kid",
                    name="b_ware",
                    field=models.BooleanField(default=False),
                ),
                migrations.AddField(
                    model_name="kid",
                    name="commentary",
                    field=models.TextField(null=True, blank=True),
                ),
            ],
        ),
    ]