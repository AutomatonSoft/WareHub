from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="ImportedProduct",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("site", models.CharField(choices=[("XL", "XL"), ("JV", "JV")], db_index=True, default="XL", max_length=8)),
                ("source_product_id", models.BigIntegerField(db_index=True)),
                ("ean", models.CharField(db_index=True, max_length=64)),
                ("source_model", models.CharField(blank=True, max_length=64)),
                ("source_sku", models.CharField(blank=True, max_length=64)),
                ("source_ean_field", models.CharField(blank=True, max_length=14)),
                ("price", models.DecimalField(blank=True, decimal_places=4, max_digits=15, null=True)),
                ("quantity", models.IntegerField(blank=True, null=True)),
                ("status", models.BooleanField(default=False)),
                ("manufacturer_id", models.IntegerField(blank=True, null=True)),
                ("stock_status_id", models.IntegerField(blank=True, null=True)),
                ("tax_class_id", models.IntegerField(blank=True, null=True)),
                ("image", models.CharField(blank=True, max_length=255)),
                ("date_available", models.DateField(blank=True, null=True)),
                ("date_modified_in_source", models.DateTimeField(blank=True, null=True)),
                ("is_modified_locally", models.BooleanField(default=False)),
                ("is_pushed_to_source", models.BooleanField(default=False)),
                ("last_imported_at", models.DateTimeField(blank=True, null=True)),
                ("last_pushed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "imported_products",
                "ordering": ["-updated_at"],
            },
        ),
        migrations.CreateModel(
            name="ImportedProductCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("category_id", models.BigIntegerField(db_index=True)),
                (
                    "product",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="categories", to="jv_services.importedproduct"),
                ),
            ],
            options={
                "db_table": "imported_product_categories",
                "unique_together": {("product", "category_id")},
            },
        ),
        migrations.CreateModel(
            name="ImportedProductDescription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("language_id", models.IntegerField(db_index=True)),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("tag", models.TextField(blank=True)),
                ("meta_title", models.CharField(blank=True, max_length=255)),
                ("meta_description", models.CharField(blank=True, max_length=255)),
                ("meta_keyword", models.TextField(blank=True)),
                ("is_modified_locally", models.BooleanField(default=False)),
                (
                    "product",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="descriptions", to="jv_services.importedproduct"),
                ),
            ],
            options={
                "db_table": "imported_product_descriptions",
                "unique_together": {("product", "language_id")},
            },
        ),
        migrations.CreateModel(
            name="ImportedProductImage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("image", models.CharField(max_length=255)),
                ("sort_order", models.IntegerField(default=0)),
                (
                    "product",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="images", to="jv_services.importedproduct"),
                ),
            ],
            options={
                "db_table": "imported_product_images",
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.CreateModel(
            name="ImportedProductSpecial",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("customer_group_id", models.IntegerField(default=1)),
                ("priority", models.IntegerField(default=0)),
                ("price", models.DecimalField(decimal_places=4, max_digits=15)),
                ("date_start", models.DateField(blank=True, null=True)),
                ("date_end", models.DateField(blank=True, null=True)),
                ("is_modified_locally", models.BooleanField(default=False)),
                (
                    "product",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="specials", to="jv_services.importedproduct"),
                ),
            ],
            options={
                "db_table": "imported_product_specials",
                "ordering": ["priority", "id"],
            },
        ),
        migrations.CreateModel(
            name="ImportedProductStore",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("store_id", models.IntegerField(db_index=True)),
                (
                    "product",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stores", to="jv_services.importedproduct"),
                ),
            ],
            options={
                "db_table": "imported_product_stores",
                "unique_together": {("product", "store_id")},
            },
        ),
        migrations.AddConstraint(
            model_name="importedproduct",
            constraint=models.UniqueConstraint(fields=("site", "source_product_id"), name="uniq_imported_product_site_source_product_id"),
        ),
        migrations.AddConstraint(
            model_name="importedproduct",
            constraint=models.UniqueConstraint(fields=("site", "ean"), name="uniq_imported_product_site_ean"),
        ),
    ]

