from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("jv_services", "0007_rename_batch_tables_to_jv"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel(name="ImportedProductImage"),
                migrations.DeleteModel(name="ImportedProductCategory"),
                migrations.DeleteModel(name="ImportedProductStore"),
                migrations.DeleteModel(name="ImportedProductDescription"),
                migrations.DeleteModel(name="ImportedProductSpecial"),
                migrations.DeleteModel(name="ImportedProduct"),
            ],
        ),
    ]

