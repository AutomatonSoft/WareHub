from rest_framework import serializers

from .kid_number_utils import normalize_kid_numbers, primary_kid_number
from .models import EANPool, EANUsage, Ean, Kid, Orders, ProductAttributes


class KidModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Kid
        fields = "__all__"
        extra_kwargs = {
            "kid_number": {"error_messages": {"required": "Укажите kid_number."}},
        }

    def validate_kid_number(self, value):
        normalized = normalize_kid_numbers(value)
        if not normalized:
            raise serializers.ValidationError("kid_number не может быть пустым.")
        return normalized

    def validate_account(self, value):
        if value in (None, ""):
            return None
        value = str(value).strip().upper()
        allowed = {choice[0] for choice in Kid._meta.get_field("account").choices}
        if value not in allowed:
            allowed_text = ", ".join(sorted(allowed))
            raise serializers.ValidationError(
                f"Некорректный account. Допустимые значения: {allowed_text}."
            )
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["kid_number"] = primary_kid_number(instance.kid_number)
        return data


class KidUserReadSerializer(serializers.ModelSerializer):
    kid_number = serializers.SerializerMethodField()

    class Meta:
        model = Kid
        fields = ("kid_number",)

    def get_kid_number(self, obj):
        return primary_kid_number(obj.kid_number)


class KidCompositePatchSerializer(KidModelSerializer):
    class Meta(KidModelSerializer.Meta):
        model = Kid
        fields = (
            "kid_number",
            "account",
            "place",
            "store",
            "photo",
            "room",
            "furniture_type",
            "listing_status",
            "b_ware",
            "commentary",
            "in_transit",
        )


class OrderModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Orders
        fields = "__all__"
        extra_kwargs = {
            "kid": {"error_messages": {"required": "Укажите kid."}},
            "order_id": {"error_messages": {"required": "Укажите order_id."}},
            "status": {"error_messages": {"required": "Укажите status."}},
            "title": {"error_messages": {"required": "Укажите title."}},
        }

    def validate_order_id(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("order_id не может быть пустым.")
        return value

    def validate_kid(self, value):
        if value is None:
            raise serializers.ValidationError("Order не может существовать без Kid.")
        return value

    def validate_sku(self, value):
        if value in (None, ""):
            return value
        return value.strip()

    def validate_status(self, value):
        value = (value or "").strip().lower()
        allowed_statuses = {choice[0] for choice in Orders._meta.get_field("status").choices}
        if value not in allowed_statuses:
            allowed = ", ".join(sorted(allowed_statuses))
            raise serializers.ValidationError(
                f"Некорректный status. Допустимые значения: {allowed}."
            )
        return value

    def validate_title(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("title не может быть пустым.")
        return value

    def validate_memo(self, value):
        if value in (None, ""):
            return value
        return value.strip()


class OrderUserReadSerializer(serializers.ModelSerializer):
    kid_number = serializers.SerializerMethodField()

    class Meta:
        model = Orders
        fields = ("order_id", "kid_number")

    def get_kid_number(self, obj):
        return primary_kid_number(obj.kid.kid_number)


class EanPatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ean
        exclude = ("kid",)


class ProductAttributesPatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductAttributes
        exclude = ("kid", "created_at", "updated_at")


class OrderCompositePatchItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    order_id = serializers.CharField(required=False, allow_blank=False, max_length=255)
    platform = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=255)
    buyer = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=255)
    sku = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    title = serializers.CharField(required=False, allow_blank=False)
    memo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status = serializers.CharField(required=False, allow_blank=False, max_length=10)
    date = serializers.DateTimeField(required=False, allow_null=True)
    payment_status = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=255)
    additional_items = serializers.JSONField(required=False)

    def validate(self, attrs):
        if len(attrs) == 1 and "id" in attrs:
            raise serializers.ValidationError("Order update must include at least one field besides id.")
        return attrs


class KidCompositeUpdateRequestSerializer(serializers.Serializer):
    kid = KidCompositePatchSerializer(required=False)
    ean = EanPatchSerializer(required=False)
    product_attributes = ProductAttributesPatchSerializer(required=False)
    orders = OrderCompositePatchItemSerializer(many=True, required=False)

    def validate(self, attrs):
        if not any(key in attrs for key in ("kid", "ean", "product_attributes", "orders")):
            raise serializers.ValidationError("At least one of kid, ean, product_attributes, orders is required.")
        return attrs


class EANPoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = EANPool
        fields = "__all__"


class EANUsageSerializer(serializers.ModelSerializer):
    ean = serializers.CharField(source="ean.ean", read_only=True)

    class Meta:
        model = EANUsage
        fields = ("id", "ean", "site", "site_key", "local_product_id", "source_product_id", "published_at")


class EANPoolImportSerializer(serializers.Serializer):
    eans = serializers.ListField(child=serializers.CharField(max_length=64), required=False, allow_empty=True)
    text = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        eans = attrs.get("eans") or []
        text = (attrs.get("text") or "").strip()
        if not eans and not text:
            raise serializers.ValidationError("Передайте eans[] или text со списком EAN.")
        return attrs


class EANPoolReserveSerializer(serializers.Serializer):
    ean = serializers.CharField(max_length=64)
    reserved_by = serializers.CharField(max_length=150, required=False, allow_blank=True)


class MarketplaceDeactivateByEANSerializer(serializers.Serializer):
    ean = serializers.CharField(max_length=64)
    site_keys = serializers.ListField(
        child=serializers.CharField(max_length=64),
        allow_empty=False,
    )
    inactive = serializers.BooleanField(required=False, default=True)
    payloads = serializers.DictField(required=False, default=dict)

    def validate_ean(self, value):
        normalized = str(value or "").strip()
        if not normalized:
            raise serializers.ValidationError("ean не может быть пустым.")
        return normalized

    def validate_site_keys(self, value):
        normalized = []
        for item in value:
            site_key = str(item or "").strip().upper()
            if not site_key:
                raise serializers.ValidationError("site_keys не должен содержать пустые значения.")
            normalized.append(site_key)
        return normalized

    def validate_payloads(self, value):
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("payloads должен быть объектом вида {SITE_KEY: {...}}.")
        normalized = {}
        for key, payload in value.items():
            site_key = str(key or "").strip().upper()
            if not site_key:
                raise serializers.ValidationError("payloads содержит пустой ключ.")
            if not isinstance(payload, dict):
                raise serializers.ValidationError(f"payloads['{site_key}'] должен быть объектом.")
            normalized[site_key] = payload
        return normalized


class MarketplaceDeactivateByKidSerializer(serializers.Serializer):
    kid_number = serializers.CharField(max_length=255)
    inactive = serializers.BooleanField(required=False, default=True)
    place = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    payloads = serializers.DictField(required=False, default=dict)

    def validate_kid_number(self, value):
        normalized = str(value or "").strip()
        if not normalized:
            raise serializers.ValidationError("kid_number не может быть пустым.")
        return normalized

    def validate_place(self, value):
        if value in (None, ""):
            return None
        return str(value).strip()


class MarketplaceJVDeactivateByKidSerializer(serializers.Serializer):
    kid_number = serializers.CharField(max_length=255)
    inactive = serializers.BooleanField(required=False, default=True)
    place = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)

    def validate_kid_number(self, value):
        normalized = str(value or "").strip()
        if not normalized:
            raise serializers.ValidationError("kid_number не может быть пустым.")
        return normalized

    def validate_place(self, value):
        if value in (None, ""):
            return None
        return str(value).strip()


class MarketplaceHoodDeactivateByKidSerializer(serializers.Serializer):
    kid_number = serializers.CharField(max_length=255)
    inactive = serializers.BooleanField(required=False, default=True)
    place = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)

    def validate_kid_number(self, value):
        normalized = str(value or "").strip()
        if not normalized:
            raise serializers.ValidationError("kid_number не может быть пустым.")
        return normalized

    def validate_place(self, value):
        if value in (None, ""):
            return None
        return str(value).strip()


class EANPoolTakeNextSerializer(serializers.Serializer):
    reserved_by = serializers.CharField(max_length=150, required=False, allow_blank=True)


class EANUsageMarkSerializer(serializers.Serializer):
    ean = serializers.CharField(max_length=64)
    site = serializers.CharField(max_length=8)
    site_key = serializers.CharField(max_length=64, required=False, allow_blank=True)
    local_product_id = serializers.IntegerField(required=False)
    source_product_id = serializers.IntegerField(required=False)
