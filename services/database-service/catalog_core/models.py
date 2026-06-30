from django.core.exceptions import ValidationError
from django.db import models


class ProtectedDeleteQuerySet(models.QuerySet):
    def delete(self, *args, **kwargs):
        raise ValidationError("ImportedProduct records are protected and cannot be deleted.")


class ProtectedDeleteManager(models.Manager):
    def get_queryset(self):
        return ProtectedDeleteQuerySet(self.model, using=self._db)


class ImportedProduct(models.Model):
    class Site(models.TextChoices):
        XL = "XL", "XL"
        JV = "JV", "JV"

    class LocalSaveStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        SAVED = "saved", "Saved"
        FAILED = "failed", "Failed"

    class SourcePushStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PUSHED = "pushed", "Pushed"
        FAILED = "failed", "Failed"

    site = models.CharField(max_length=8, choices=Site.choices, default=Site.XL, db_index=True)
    site_key = models.CharField(max_length=64, blank=True, default="", db_index=True)
    source_product_id = models.BigIntegerField(db_index=True)
    ean = models.CharField(max_length=64, db_index=True)
    source_model = models.CharField(max_length=64, blank=True)
    source_sku = models.CharField(max_length=64, blank=True)
    source_ean_field = models.CharField(max_length=14, blank=True)
    price = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    quantity = models.IntegerField(null=True, blank=True)
    status = models.BooleanField(default=False)
    manufacturer_id = models.IntegerField(null=True, blank=True)
    stock_status_id = models.IntegerField(null=True, blank=True)
    tax_class_id = models.IntegerField(null=True, blank=True)
    shipping = models.BooleanField(default=True)
    subtract = models.BooleanField(default=True)
    minimum = models.IntegerField(null=True, blank=True)
    points = models.IntegerField(null=True, blank=True)
    sort_order = models.IntegerField(null=True, blank=True)
    seo_url = models.CharField(max_length=255, blank=True, default="")
    image = models.CharField(max_length=255, blank=True)
    date_available = models.DateField(null=True, blank=True)
    date_modified_in_source = models.DateTimeField(null=True, blank=True)
    is_modified_locally = models.BooleanField(default=False)
    is_pushed_to_source = models.BooleanField(default=False)
    local_save_status = models.CharField(max_length=16, choices=LocalSaveStatus.choices, default=LocalSaveStatus.PENDING, db_index=True)
    source_push_status = models.CharField(max_length=16, choices=SourcePushStatus.choices, default=SourcePushStatus.PENDING, db_index=True)
    source_push_error = models.TextField(blank=True, default="")
    last_imported_at = models.DateTimeField(null=True, blank=True)
    last_pushed_at = models.DateTimeField(null=True, blank=True)
    user_create = models.CharField(max_length=150, default="system")
    update_user = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ProtectedDeleteManager()
    all_objects = models.Manager()

    class Meta:
        db_table = "imported_products"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(fields=["site", "site_key", "source_product_id"], name="uniq_imported_product_site_site_key_source_product_id"),
            # Product identity is the article number (source_model / artikelnr), NOT the EAN:
            # one EAN can carry many products (e.g. a main item plus several Sofort colour
            # variants), each with its own artikelnr. Enforced only when source_model is set
            # (XL rows may leave it blank, and blanks must not collide with each other).
            models.UniqueConstraint(
                fields=["site", "site_key", "source_model"],
                condition=models.Q(source_model__gt=""),
                name="uniq_imported_product_site_site_key_source_model",
            ),
        ]


class ImportedProductDescription(models.Model):
    product = models.ForeignKey(ImportedProduct, on_delete=models.CASCADE, related_name="descriptions")
    language_id = models.IntegerField(db_index=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    tag = models.TextField(blank=True)
    meta_title = models.CharField(max_length=255, blank=True)
    meta_description = models.CharField(max_length=255, blank=True)
    meta_keyword = models.TextField(blank=True)
    is_modified_locally = models.BooleanField(default=False)

    class Meta:
        db_table = "imported_product_descriptions"
        unique_together = ("product", "language_id")


class ImportedProductCategory(models.Model):
    product = models.ForeignKey(ImportedProduct, on_delete=models.CASCADE, related_name="categories")
    category_id = models.BigIntegerField(db_index=True)
    main_category = models.BooleanField(default=False)

    class Meta:
        db_table = "imported_product_categories"
        unique_together = ("product", "category_id")


class ImportedProductStore(models.Model):
    product = models.ForeignKey(ImportedProduct, on_delete=models.CASCADE, related_name="stores")
    store_id = models.IntegerField(db_index=True)

    class Meta:
        db_table = "imported_product_stores"
        unique_together = ("product", "store_id")


class ImportedProductImage(models.Model):
    product = models.ForeignKey(ImportedProduct, on_delete=models.CASCADE, related_name="images")
    image = models.CharField(max_length=255)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "imported_product_images"
        ordering = ["sort_order", "id"]


class ImportedProductSpecial(models.Model):
    product = models.ForeignKey(ImportedProduct, on_delete=models.CASCADE, related_name="specials")
    customer_group_id = models.IntegerField(default=1)
    priority = models.IntegerField(default=0)
    price = models.DecimalField(max_digits=15, decimal_places=4)
    date_start = models.DateField(null=True, blank=True)
    date_end = models.DateField(null=True, blank=True)
    is_modified_locally = models.BooleanField(default=False)

    class Meta:
        db_table = "imported_product_specials"
        ordering = ["priority", "id"]
