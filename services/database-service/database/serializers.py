from rest_framework import serializers
from .models import EANPool, EANUsage, Kid, Orders


class KidModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Kid
        fields = "__all__"
        extra_kwargs = {
            "kid_number": {"error_messages": {"required": "Укажите kid_number."}},
        }

    def validate_kid_number(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("kid_number не может быть пустым.")
        return value

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

class KidUserReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Kid
        fields = ("kid_number",)


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
        value = value.strip()
        return value

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
        value = value.strip()
        return value


class OrderUserReadSerializer(serializers.ModelSerializer):
    kid_number = serializers.CharField(source="kid.kid_number", read_only=True)

    class Meta:
        model = Orders
        fields = ("order_id", "kid_number")


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


class EANPoolTakeNextSerializer(serializers.Serializer):
    reserved_by = serializers.CharField(max_length=150, required=False, allow_blank=True)


class EANUsageMarkSerializer(serializers.Serializer):
    ean = serializers.CharField(max_length=64)
    site = serializers.CharField(max_length=8)
    site_key = serializers.CharField(max_length=64, required=False, allow_blank=True)
    local_product_id = serializers.IntegerField(required=False)
    source_product_id = serializers.IntegerField(required=False)
