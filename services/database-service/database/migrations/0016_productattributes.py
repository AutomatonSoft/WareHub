from django.db import migrations, models
import django.db.models.deletion
from decimal import Decimal, InvalidOperation


def backfill_product_attributes(apps, schema_editor):
    ProductAttributes = apps.get_model("database", "ProductAttributes")
    Kid = apps.get_model("database", "Kid")
    Orders = apps.get_model("database", "Orders")
    db_alias = schema_editor.connection.alias

    for kid in Kid.objects.using(db_alias).all().iterator():
        latest_order = (
            Orders.objects.using(db_alias)
            .filter(kid_id=kid.id)
            .order_by("-date", "-id")
            .first()
        )

        raw_price = (getattr(latest_order, "global_price", "") or "").strip() if latest_order else ""
        normalized_price = raw_price.replace("EUR", "").replace(" ", "").replace(",", ".")
        price_value = None
        if normalized_price:
            try:
                price_value = Decimal(normalized_price)
            except InvalidOperation:
                price_value = None

        ProductAttributes.objects.using(db_alias).update_or_create(
            kid_id=kid.id,
            defaults={
                "price": price_value,
                "currency": "EUR",
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0015_alter_eanpool_id_alter_eanusage_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductAttributes",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("color", models.CharField(blank=True, max_length=128, null=True)),
                ("size", models.CharField(blank=True, max_length=128, null=True)),
                ("material", models.CharField(blank=True, max_length=128, null=True)),
                ("price", models.DecimalField(blank=True, decimal_places=2, max_digits=15, null=True)),
                ("currency", models.CharField(default="EUR", max_length=8)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "kid",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="product_attributes",
                        to="database.kid",
                    ),
                ),
            ],
        ),
        migrations.RunPython(backfill_product_attributes, migrations.RunPython.noop),
    ]
