from decimal import Decimal, InvalidOperation

from rest_framework import serializers
from .models import Product


class UrlListOrStringField(serializers.ListField):
    """Accepts either a list of URLs or a single URL string."""

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = [data] if data.strip() else []
        return super().to_internal_value(data)


class DecimalStringField(serializers.Field):
    default_error_messages = {"invalid": "A decimal value is required."}

    def to_internal_value(self, data):
        try:
            value = Decimal(str(data))
        except (InvalidOperation, TypeError, ValueError):
            self.fail("invalid")
        if not value.is_finite():
            self.fail("invalid")
        normalized = format(value.normalize(), "f")
        if "." in normalized:
            normalized = normalized.rstrip("0").rstrip(".")
        return normalized or "0"

    def to_representation(self, value):
        return str(value)


KAUFLAND_PRODUCT_WRITE_FIELDS = (
    "category",
    "title",
    "mpn",
    "short_description",
    "description",
    "picture",
    "manufacturer",
    "product_dimensions",
    "colour",
    "length",
    "width",
    "height",
    "material",
    "storefront",
    "product_safety_contact",
    "category_detail",
    "material_composition",
    "abnehmbarer_bezug",
    "parts_of_animal_origin",
    "price",
    "unit_id",
    "picture_urls",
    "size",
    "color",
    "delivery",
)


class KauflandProductWriteFieldsSerializer(serializers.Serializer):
    category = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
    title = serializers.CharField(required=False, allow_blank=True)
    mpn = serializers.CharField(required=False, allow_blank=True)
    short_description = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
    description = serializers.CharField(required=False, allow_blank=True)
    picture = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
    manufacturer = serializers.CharField(required=False, allow_blank=True)
    product_dimensions = serializers.CharField(required=False, allow_blank=True)
    colour = serializers.CharField(required=False, allow_blank=True)
    length = serializers.CharField(required=False, allow_blank=True)
    width = serializers.CharField(required=False, allow_blank=True)
    height = serializers.CharField(required=False, allow_blank=True)
    material = serializers.CharField(required=False, allow_blank=True)
    storefront = serializers.CharField(required=False, allow_blank=True)
    product_safety_contact = serializers.ListField(child=serializers.DictField(), required=False, allow_empty=True)
    category_detail = serializers.ListField(child=serializers.DictField(), required=False, allow_empty=True)
    material_composition = serializers.CharField(required=False, allow_blank=True)
    abnehmbarer_bezug = serializers.CharField(required=False, allow_blank=True)
    parts_of_animal_origin = serializers.CharField(required=False, allow_blank=True)
    price = serializers.IntegerField(required=False)
    unit_id = serializers.IntegerField(required=False)
    picture_urls = UrlListOrStringField(child=serializers.URLField(), required=False, allow_empty=True)
    size = serializers.CharField(required=False, allow_blank=True)
    color = serializers.CharField(required=False, allow_blank=True)
    delivery = serializers.IntegerField(required=False)


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = "__all__"


class KauflandChangeByEANSerializer(KauflandProductWriteFieldsSerializer):
    ean = serializers.CharField(max_length=64)
    controller = serializers.ChoiceField(choices=["jv", "xl"], required=True)
    changed_fields = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)


class KauflandDeleteByEANSerializer(serializers.Serializer):
    ean = serializers.CharField(max_length=64)
    controller = serializers.ChoiceField(choices=["jv", "xl"], required=True)


class KauflandControllerSerializer(serializers.Serializer):
    controller = serializers.ChoiceField(choices=["jv", "xl"], required=True)


DEFAULT_KAUFLAND_STOREFRONTS = ("de", "cz", "sk", "pl", "at", "fr", "it")


class KauflandCreateByEANSerializer(serializers.Serializer):
    ean = serializers.CharField(max_length=64)
    controller = serializers.ChoiceField(choices=["jv", "xl"], required=True)
    title = serializers.CharField()
    description = serializers.CharField()
    picture = UrlListOrStringField(child=serializers.URLField(), required=False, allow_empty=True)
    price = DecimalStringField()
    size = serializers.CharField()
    color = serializers.CharField()
    material = serializers.CharField()
    delivery = serializers.IntegerField()
    height = DecimalStringField()
    length = DecimalStringField()
    width = DecimalStringField()
    amount = serializers.IntegerField(required=False, default=20, min_value=1)
    id_offer = serializers.CharField(required=False, allow_blank=True)
    storefronts = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list(DEFAULT_KAUFLAND_STOREFRONTS),
        allow_empty=False,
    )
    picture_urls = UrlListOrStringField(child=serializers.URLField(), required=False, allow_empty=True)

    def validate(self, attrs):
        if not attrs.get("picture") and not attrs.get("picture_urls"):
            raise serializers.ValidationError({"picture": "Provide at least one picture or picture_urls value."})
        if not attrs.get("id_offer"):
            attrs["id_offer"] = attrs["ean"]
        return attrs
