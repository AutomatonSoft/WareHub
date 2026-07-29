from django.db import models


class OttoProductJV(models.Model):
    product_reference = models.CharField(max_length=255, unique=True, db_index=True)
    sku = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    ean = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    pzn = models.CharField(max_length=255, null=True, blank=True)
    mpn = models.CharField(max_length=255, null=True, blank=True)
    moin = models.CharField(max_length=255, null=True, blank=True)
    otto_image_url = models.URLField(max_length=2048, null=True, blank=True)
    release_date = models.DateTimeField(null=True, blank=True)

    product_description = models.JSONField(default=dict, blank=True)
    media_assets = models.JSONField(default=list, blank=True)
    order_data = models.JSONField(default=dict, blank=True)
    pricing = models.JSONField(default=dict, blank=True)
    logistics = models.JSONField(default=dict, blank=True)
    compliance = models.JSONField(default=dict, blank=True)

    raw_payload = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "OTTO Product"
        verbose_name_plural = "OTTO Products"

    def __str__(self) -> str:
        return f"{self.product_reference} ({self.sku or 'no-sku'})"


class OttoProductXL(models.Model):
    product_reference = models.CharField(max_length=255, unique=True, db_index=True)
    sku = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    ean = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    pzn = models.CharField(max_length=255, null=True, blank=True)
    mpn = models.CharField(max_length=255, null=True, blank=True)
    moin = models.CharField(max_length=255, null=True, blank=True)
    otto_image_url = models.URLField(max_length=2048, null=True, blank=True)
    release_date = models.DateTimeField(null=True, blank=True)

    product_description = models.JSONField(default=dict, blank=True)
    media_assets = models.JSONField(default=list, blank=True)
    order_data = models.JSONField(default=dict, blank=True)
    pricing = models.JSONField(default=dict, blank=True)
    logistics = models.JSONField(default=dict, blank=True)
    compliance = models.JSONField(default=dict, blank=True)

    raw_payload = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "OTTO Product"
        verbose_name_plural = "OTTO Products"

    def __str__(self) -> str:
        return f"{self.product_reference} ({self.sku or 'no-sku'})"
