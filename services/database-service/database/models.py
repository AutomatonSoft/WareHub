from django.db.models import (
    Model,
    CASCADE,
    CharField,
    DateTimeField,
    ForeignKey,
    JSONField,
    IntegerField,
    TextField,
    UniqueConstraint,
    BigIntegerField,
    BigAutoField,
    DecimalField,
    OneToOneField,
    BooleanField
)
from .kid_number_utils import normalize_kid_numbers

class Paymant:
    STATUS_CHOICES = [
        ("paid","paid"),
        ("no_paid","no_paid")
    ]

class KidAccount:
    ACCOUNT_CHOICES = [
        ("JV", "JV"),
        ("XL", "XL"),
        ("CH", "CH"),
    ]

class Kid(Model):
    kid_number = JSONField(default=list)
    account = CharField(
        max_length=8,
        choices=KidAccount.ACCOUNT_CHOICES,
        null=True,
        blank=True,
        db_index=True,
    )
    place = CharField(max_length=255, null=True, blank=True)
    store = BooleanField(default=False)
    photo = JSONField(default=list, blank=True)
    room = CharField(max_length=128, null=True, blank=True)
    furniture_type = CharField(max_length=128, null=True, blank=True)
    listing_status = CharField(max_length=16, default="unlisted", db_index=True)
    b_ware = BooleanField(default=False)
    store = BooleanField(default=False)
    commentary = TextField(null=True, blank=True)
    in_transit = BooleanField(default=False)

    def save(self, *args, **kwargs):
        self.kid_number = normalize_kid_numbers(self.kid_number)
        return super().save(*args, **kwargs)


class Ean(Model):
    kid = OneToOneField(Kid, on_delete=CASCADE, related_name="ean")
    main_ean = CharField(max_length=16, null=True, blank=True)
    jv = CharField(max_length=64, null=True, blank=True)
    xl = CharField(max_length=16, null=True, blank=True)
    otto_jv = CharField(max_length=16, null=True, blank=True)
    otto_xl = CharField(max_length=16, null=True, blank=True)
    kaufland_jv = CharField(max_length=16, null=True, blank=True)
    kaufland_xl = CharField(max_length=16, null=True, blank=True)
    hood_jv = CharField(max_length=16, null=True, blank=True)
    hood_xl = CharField(max_length=16, null=True, blank=True)
    ebay_jv = CharField(max_length=16, null=True, blank=True)
    ebay_xl = CharField(max_length=16, null=True, blank=True)

class EanStatus(Model):
    ean = OneToOneField(Kid, on_delete=CASCADE, related_name="status")
    jv = BooleanField(default=False)
    xl = BooleanField(default=False)
    otto_jv = BooleanField(default=False)
    otto_xl = BooleanField(default=False)
    kaufland_jv = BooleanField(default=False)
    kaufland_xl = BooleanField(default=False)
    hood_jv = BooleanField(default=False)
    hood_xl = BooleanField(default=False)
    ebay_jv = BooleanField(default=False)
    ebay_xl = BooleanField(default=False)


class Orders(Model):
    kid = ForeignKey(Kid, on_delete=CASCADE, related_name="orders")
    order_id = CharField(max_length=255, null=False)
    platform = CharField(max_length=255, null=True, blank=True)
    buyer = CharField(max_length=255, null=True, blank=True)
    sku = TextField(null=True, blank=True)
    title = TextField()
    memo = TextField(null=True, blank=True)
    status = CharField(max_length=10, choices=Paymant.STATUS_CHOICES, default="no_paid")
    date = DateTimeField(null=True, blank=True)
    payment_status = CharField(max_length=255, null=True, blank=True)
    additional_items = JSONField(default=list, blank=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["kid", "order_id"],
                             name="unique_order_per_kid"
                             )
                               ]


class IdempotencyRecord(Model):
    scope = CharField(max_length=128)
    idem_key = CharField(max_length=255)
    request_hash = CharField(max_length=64)
    state = CharField(max_length=32, default="processing")
    status_code = IntegerField(null=True, blank=True)
    response_payload = JSONField(default=dict, blank=True)
    error_code = CharField(max_length=128, blank=True, default="")
    expires_at = DateTimeField()
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["scope", "idem_key"], name="uniq_idempotency_scope_key"),
        ]


class EANPoolStatus:
    CHOICES = [
        ("free", "free"),
        ("reserved", "reserved"),
        ("used", "used"),
        ("blocked", "blocked"),
    ]


class EANPool(Model):
    ean = CharField(max_length=64, unique=True, db_index=True)
    status = CharField(max_length=16, choices=EANPoolStatus.CHOICES, default="free", db_index=True)
    reserved_by = CharField(max_length=150, blank=True, default="")
    note = TextField(blank=True, default="")
    reserved_at = DateTimeField(null=True, blank=True)
    used_at = DateTimeField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)


class EANUsage(Model):
    ean = ForeignKey(EANPool, on_delete=CASCADE, related_name="usages")
    site = CharField(max_length=8, db_index=True)
    site_key = CharField(max_length=64, blank=True, default="", db_index=True)
    local_product_id = BigIntegerField(null=True, blank=True)
    source_product_id = BigIntegerField(null=True, blank=True)
    published_at = DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["ean", "site", "site_key"], name="uniq_ean_usage_per_site"),
        ]


class ProductAttributes(Model):
    kid = OneToOneField(Kid, on_delete=CASCADE, related_name="product_attributes")
    quantity = IntegerField(null=True, blank=True)
    company = CharField(max_length=128, null=True, blank=True)
    color = CharField(max_length=128, null=True, blank=True)
    size = CharField(max_length=128, null=True, blank=True)
    material = CharField(max_length=128, null=True, blank=True)
    price = DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    currency = CharField(max_length=8, default="EUR")
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
