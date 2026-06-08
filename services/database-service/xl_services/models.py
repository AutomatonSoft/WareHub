from django.db import models

from catalog_core.models import (
    ImportedProduct,
    ImportedProductCategory,
    ImportedProductDescription,
    ImportedProductImage,
    ImportedProductSpecial,
    ImportedProductStore,
)


class XLBatchJob(models.Model):
    class SiteFamily(models.TextChoices):
        XL = "XL", "XL"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPLIED = "applied", "Applied"
        FAILED = "failed", "Failed"

    ean = models.CharField(max_length=64, db_index=True)
    site_family = models.CharField(max_length=8, choices=SiteFamily.choices, db_index=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    initiated_by = models.CharField(max_length=150, default="system")
    idempotency_key = models.CharField(max_length=255, blank=True, default="", db_index=True)
    request_payload = models.JSONField(default=dict, blank=True)
    result_summary = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "xl_batch_jobs"
        ordering = ["-created_at"]


class XLBatchJobItem(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPLIED = "applied", "Applied"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    job = models.ForeignKey(XLBatchJob, on_delete=models.CASCADE, related_name="items")
    site = models.CharField(max_length=8, choices=ImportedProduct.Site.choices, db_index=True)
    site_key = models.CharField(max_length=64, blank=True, default="", db_index=True)
    domain = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    source_product_id = models.BigIntegerField(null=True, blank=True)
    effective_ean = models.CharField(max_length=64, blank=True, default="")
    currency_code = models.CharField(max_length=8, blank=True, default="")
    old_price = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    new_price = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    error_code = models.CharField(max_length=128, blank=True, default="")
    error_text = models.TextField(blank=True, default="")
    details = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "xl_batch_job_items"
        ordering = ["id"]
