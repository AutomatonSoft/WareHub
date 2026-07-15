from rest_framework import serializers
from .models import Product


class UrlListOrStringField(serializers.ListField):
    """Accepts either a list of URLs or a single URL string."""

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = [data] if data.strip() else []
        return super().to_internal_value(data)


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


class KauflandCreateByEANSerializer(KauflandProductWriteFieldsSerializer):
    ean = serializers.CharField(max_length=64)
    controller = serializers.ChoiceField(choices=["jv", "xl"], required=True)
