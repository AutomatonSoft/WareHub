from django.db import migrations, models


def convert_in_stock_to_stock_status(apps, schema_editor):
    table_name = schema_editor.quote_name("database_kid")
    old_column_name = schema_editor.quote_name("in_stock")
    new_column_name = schema_editor.quote_name("stock_status")

    with schema_editor.connection.cursor() as cursor:
        if schema_editor.connection.vendor == "postgresql":
            cursor.execute(f"ALTER TABLE {table_name} ALTER COLUMN {old_column_name} DROP DEFAULT")
            cursor.execute(
                f"ALTER TABLE {table_name} ALTER COLUMN {old_column_name} TYPE varchar(16) "
                f"USING CASE WHEN {old_column_name} THEN 'in_stock' ELSE 'out' END"
            )
            cursor.execute(f"ALTER TABLE {table_name} RENAME COLUMN {old_column_name} TO {new_column_name}")
            cursor.execute(f"ALTER TABLE {table_name} ALTER COLUMN {new_column_name} SET DEFAULT 'in_stock'")
            return

        cursor.execute(
            f"UPDATE {table_name} SET {old_column_name} = CASE "
            f"WHEN {old_column_name} IN (1, '1', 'true', 'True', 'in_stock') THEN 'in_stock' "
            f"ELSE 'out' END"
        )
        cursor.execute(f"ALTER TABLE {table_name} RENAME COLUMN {old_column_name} TO {new_column_name}")


def convert_stock_status_to_in_stock(apps, schema_editor):
    table_name = schema_editor.quote_name("database_kid")
    old_column_name = schema_editor.quote_name("stock_status")
    new_column_name = schema_editor.quote_name("in_stock")

    with schema_editor.connection.cursor() as cursor:
        if schema_editor.connection.vendor == "postgresql":
            cursor.execute(f"ALTER TABLE {table_name} ALTER COLUMN {old_column_name} DROP DEFAULT")
            cursor.execute(
                f"ALTER TABLE {table_name} ALTER COLUMN {old_column_name} TYPE boolean "
                f"USING {old_column_name} = 'in_stock'"
            )
            cursor.execute(f"ALTER TABLE {table_name} RENAME COLUMN {old_column_name} TO {new_column_name}")
            cursor.execute(f"ALTER TABLE {table_name} ALTER COLUMN {new_column_name} SET DEFAULT true")
            return

        cursor.execute(
            f"UPDATE {table_name} SET {old_column_name} = CASE "
            f"WHEN {old_column_name} = 'in_stock' THEN 1 ELSE 0 END"
        )
        cursor.execute(f"ALTER TABLE {table_name} RENAME COLUMN {old_column_name} TO {new_column_name}")


class Migration(migrations.Migration):
    dependencies = [
        ("database", "0047_kid_in_stock"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(convert_in_stock_to_stock_status, convert_stock_status_to_in_stock)],
            state_operations=[
                migrations.RenameField(model_name="kid", old_name="in_stock", new_name="stock_status"),
                migrations.AlterField(
                    model_name="kid",
                    name="stock_status",
                    field=models.CharField(
                        choices=[("in_stock", "In stock"), ("returned", "Returned"), ("out", "Out")],
                        default="in_stock",
                        max_length=16,
                    ),
                ),
            ],
        ),
    ]
