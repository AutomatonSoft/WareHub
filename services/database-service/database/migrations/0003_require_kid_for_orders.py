# Generated manually to make Orders.kid required again.

import django.db.models.deletion
from django.db import migrations, models


def delete_orders_without_kid(apps, schema_editor):
    Orders = apps.get_model("database", "Orders")
    Orders.objects.filter(kid__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("database", "0002_alter_orders_date_alter_orders_kid_alter_orders_memo_and_more"),
    ]

    operations = [
        migrations.RunPython(delete_orders_without_kid, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="orders",
            name="kid",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to="database.kid",
            ),
        ),
    ]
