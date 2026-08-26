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
    BooleanField,
    TextChoices,
    SET_NULL,
)
from django.db.models import Q
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
class StatusProductInStock(TextChoices):
    IN_STOCK = "in_stock", "In stock"
    RETURNED = "returned", "Returned"
    OUT = "out", "Out"

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
    b_ware = BooleanField(default=False)
    store = BooleanField(default=False)
    commentary = TextField(null=True, blank=True)
    section = CharField(max_length=1, null=True, blank=True)
    stock_status = CharField(max_length=16, choices=StatusProductInStock.choices, default=StatusProductInStock.IN_STOCK)
    in_transit = BooleanField(default=False)

    def save(self, *args, **kwargs):
        self.kid_number = normalize_kid_numbers(self.kid_number)
        return super().save(*args, **kwargs)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["place"],
                condition=Q(place__isnull=False) & ~Q(place=""),
                name="uniq_kid_non_empty_place",
            ),
        ]


class Ean(Model):
    kid = OneToOneField(Kid, on_delete=CASCADE, related_name="ean")
    main_ean_jv = CharField(max_length=64, null=True, blank=True)
    main_ean_xl = CharField(max_length=64, null=True, blank=True)
    jv = CharField(max_length=64, null=True, blank=True)
    xl = CharField(max_length=64, null=True, blank=True)
    otto_jv = CharField(max_length=64, null=True, blank=True)
    otto_xl = CharField(max_length=64, null=True, blank=True)
    kaufland_jv = CharField(max_length=64, null=True, blank=True)
    kaufland_xl = CharField(max_length=64, null=True, blank=True)
    hood_jv = CharField(max_length=64, null=True, blank=True)
    hood_xl = CharField(max_length=64, null=True, blank=True)
    ebay_jv = CharField(max_length=64, null=True, blank=True)
    ebay_xl = CharField(max_length=64, null=True, blank=True)
    reserved_jv = CharField(max_length=64, null=True, blank=True)
    reserved_xl = CharField(max_length=64, null=True, blank=True)

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
    MEMO_SYNC_STATUS_CHOICES = (
        ("synced", "Synced"),
        ("pending", "Pending"),
        ("failed", "Failed"),
    )

    kid = ForeignKey(Kid, on_delete=CASCADE, related_name="orders")
    order_id = CharField(max_length=255, null=False)
    platform = CharField(max_length=255, null=True, blank=True)
    buyer = CharField(max_length=255, null=True, blank=True)
    sku = TextField(null=True, blank=True)
    title = TextField()
    memo = TextField(null=True, blank=True)
    status = CharField(max_length=10, choices=Paymant.STATUS_CHOICES, default="no_paid")
    order_date = DateTimeField(null=True, blank=True)
    full_amount = CharField(max_length=255, null=True, blank=True)
    additional_items = JSONField(default=list, blank=True)

    invoice_number = CharField(max_length=255, null=True, blank=True)
    already_paid = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    shipping_tax_rate = DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    delivery_date = DateTimeField(null=True, blank=True)
    invoice_amount = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    paid_amount = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    payment_date = DateTimeField(null=True, blank=True)
    payment_method = CharField(max_length=255, null=True, blank=True)
    payment_id = CharField(max_length=255, null=True, blank=True)
    payment_function = CharField(max_length=255, null=True, blank=True)
    shipping_method = CharField(max_length=255, null=True, blank=True)
    afterbuy_profile = CharField(max_length=8, null=True, blank=True, db_index=True)
    memo_sync_status = CharField(max_length=16, choices=MEMO_SYNC_STATUS_CHOICES, default="synced")
    memo_sync_error = TextField(null=True, blank=True)
    memo_sync_error_type = CharField(max_length=64, null=True, blank=True)
    memo_last_synced_at = DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["kid", "order_id"],
                             name="unique_order_per_kid"
                             )
                               ]


class OrderItem(Model):
    """One immutable Afterbuy sold-item position belonging to an order."""

    order = ForeignKey(Orders, on_delete=CASCADE, related_name="items")
    afterbuy_item_id = CharField(max_length=255)
    article_number = CharField(max_length=255, blank=True, default="")
    alternative_item_number = CharField(max_length=255, blank=True, default="")
    alternative_item_number_1 = CharField(max_length=255, blank=True, default="")
    platform_item_id = CharField(max_length=255, blank=True, default="")
    platform_order_id = CharField(max_length=255, blank=True, default="")
    title = TextField(blank=True, default="")
    quantity = IntegerField(null=True, blank=True)
    item_price = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    original_item_price = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    currency = CharField(max_length=8, blank=True, default="")
    item_shipping_amount = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    eco_fee = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    tax_rate = DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    tax_collected_by = CharField(max_length=255, blank=True, default="")
    item_weight = DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    item_end_date = DateTimeField(null=True, blank=True)
    afterbuy_item_modified_at = DateTimeField(null=True, blank=True)
    platform_name = CharField(max_length=255, blank=True, default="")
    user_defined_flag = CharField(max_length=255, blank=True, default="")
    internal_item_type = CharField(max_length=255, blank=True, default="")
    item_details_done = BooleanField(default=False)
    is_amazon_invoiced = BooleanField(default=False)
    is_external_invoice = BooleanField(default=False)
    ebay_transaction_id = CharField(max_length=255, blank=True, default="")
    is_ebay_plus_transaction = BooleanField(default=False)
    ebay_feedback_completed = BooleanField(default=False)
    ebay_feedback_received = BooleanField(default=False)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        db_table = "database_order_items"
        constraints = [
            UniqueConstraint(
                fields=["order", "afterbuy_item_id"],
                name="unique_afterbuy_item_per_order",
            )
        ]


class Client(Model):
    """Afterbuy buyer and shipping details associated with one warehouse KID."""

    kid = OneToOneField(Kid, on_delete=CASCADE, related_name="client")

    afterbuy_user_id = CharField(max_length=255, blank=True, default="", db_index=True)
    afterbuy_user_id_alt = CharField(max_length=255, blank=True, default="")
    user_id_platform = CharField(max_length=255, blank=True, default="")

    billing_first_name = CharField(max_length=255, blank=True, default="")
    billing_last_name = CharField(max_length=255, blank=True, default="")
    billing_title = CharField(max_length=255, blank=True, default="")
    billing_company = CharField(max_length=255, blank=True, default="")
    billing_street = CharField(max_length=255, blank=True, default="")
    billing_street_2 = CharField(max_length=255, blank=True, default="")
    billing_postal_code = CharField(max_length=32, blank=True, default="")
    billing_city = CharField(max_length=255, blank=True, default="")
    billing_state_or_province = CharField(max_length=255, blank=True, default="")
    billing_country = CharField(max_length=255, blank=True, default="")
    billing_country_iso = CharField(max_length=8, blank=True, default="")
    billing_phone = CharField(max_length=128, blank=True, default="")
    billing_fax = CharField(max_length=128, blank=True, default="")
    billing_email = CharField(max_length=320, blank=True, default="")
    billing_is_merchant = BooleanField(default=False)
    billing_tax_id_number = CharField(max_length=255, blank=True, default="")

    shipping_first_name = CharField(max_length=255, blank=True, default="")
    shipping_last_name = CharField(max_length=255, blank=True, default="")
    shipping_company = CharField(max_length=255, blank=True, default="")
    shipping_street = CharField(max_length=255, blank=True, default="")
    shipping_street_2 = CharField(max_length=255, blank=True, default="")
    shipping_postal_code = CharField(max_length=32, blank=True, default="")
    shipping_city = CharField(max_length=255, blank=True, default="")
    shipping_state_or_province = CharField(max_length=255, blank=True, default="")
    shipping_phone = CharField(max_length=128, blank=True, default="")
    shipping_country = CharField(max_length=255, blank=True, default="")
    shipping_country_iso = CharField(max_length=8, blank=True, default="")
    shipping_tax_id_number = CharField(max_length=255, blank=True, default="")

    contains_ebay_plus_transaction = BooleanField(default=False)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        db_table = "database_client"


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


class InventoryChangeLog(Model):
    """Append-only audit trail for inventory changes initiated from WareHub."""

    kid = ForeignKey(Kid, null=True, blank=True, on_delete=SET_NULL, related_name="change_logs")
    kid_number = CharField(max_length=255, blank=True, default="")
    place = CharField(max_length=255, blank=True, default="")
    actor_login = CharField(max_length=255, blank=True, default="")
    actor_name = CharField(max_length=255, blank=True, default="")
    action = CharField(max_length=64, db_index=True)
    changes = JSONField(default=list, blank=True)
    metadata = JSONField(default=dict, blank=True)
    created_at = DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
