from django.db import models


class BaseHoodApiResponse(models.Model):
    class LocalSaveStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        SAVED = "saved", "Saved"
        FAILED = "failed", "Failed"

    class ExternalPushStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PUSHED = "pushed", "Pushed"
        FAILED = "failed", "Failed"

    status = models.CharField(max_length=64, null=True, blank=True)
    message = models.TextField(null=True, blank=True)
    errors = models.JSONField(default=list, blank=True)
    success = models.BooleanField(default=False)

    account = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    ean = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    source_file_ignored = models.CharField(max_length=255, null=True, blank=True)
    local_save_status = models.CharField(
        max_length=16,
        choices=LocalSaveStatus.choices,
        default=LocalSaveStatus.PENDING,
        db_index=True,
    )
    external_push_status = models.CharField(
        max_length=16,
        choices=ExternalPushStatus.choices,
        default=ExternalPushStatus.PENDING,
        db_index=True,
    )
    external_push_error = models.TextField(blank=True, default="")

    raw_payload = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.account or 'no-account'} | {self.status or 'unknown-status'}"


class BaseHoodItem(models.Model):
    item_id = models.CharField(max_length=255, db_index=True)
    description = models.TextField(blank=True, default="")
    price = models.CharField(max_length=255, null=True, blank=True)
    quantity = models.IntegerField(null=True, blank=True)

    category_id = models.CharField(max_length=255, null=True, blank=True)
    condition = models.CharField(max_length=64, null=True, blank=True)
    item_mode = models.CharField(max_length=64, null=True, blank=True)
    item_number = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    title = models.TextField(null=True, blank=True)

    images = models.JSONField(default=list, blank=True)
    product_properties = models.JSONField(default=list, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.item_id} ({self.item_number or 'no-item-number'})"


class HoodApiResponseJV(BaseHoodApiResponse):
    class Meta(BaseHoodApiResponse.Meta):
        verbose_name = "Hood API Response JV"
        verbose_name_plural = "Hood API Responses JV"


class HoodApiResponseXL(BaseHoodApiResponse):
    class Meta(BaseHoodApiResponse.Meta):
        verbose_name = "Hood API Response XL"
        verbose_name_plural = "Hood API Responses XL"


class HoodItemJV(BaseHoodItem):
    response = models.ForeignKey(
        HoodApiResponseJV,
        on_delete=models.CASCADE,
        related_name="items_jv",
    )

    class Meta(BaseHoodItem.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["response", "item_id"],
                name="unique_hood_item_jv_per_response",
            ),
        ]
        verbose_name = "Hood Item JV"
        verbose_name_plural = "Hood Items JV"


class HoodItemXL(BaseHoodItem):
    response = models.ForeignKey(
        HoodApiResponseXL,
        on_delete=models.CASCADE,
        related_name="items_xl",
    )

    class Meta(BaseHoodItem.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["response", "item_id"],
                name="unique_hood_item_xl_per_response",
            ),
        ]
        verbose_name = "Hood Item XL"
        verbose_name_plural = "Hood Items XL"


class HoodProductSnapshot(models.Model):
    account = models.CharField(max_length=16)
    ean = models.CharField(max_length=255)
    payload = models.JSONField(default=dict)
    source_item_id = models.CharField(max_length=255, blank=True, default="")
    saved_at = models.DateTimeField(auto_now=True)
    restored_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["account", "ean"],
                name="unique_hood_product_snapshot_account_ean",
            ),
        ]
        ordering = ["-saved_at"]

    def __str__(self) -> str:
        return f"{self.account}:{self.ean}"
