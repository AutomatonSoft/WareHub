from rest_framework import serializers
from .models import Product


class UrlListOrStringField(serializers.ListField):
    """Accepts either a list of URLs or a single URL string."""

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = [data] if data.strip() else []
        return super().to_internal_value(data)


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = "__all__"


class KauflandChangeByEANSerializer(serializers.Serializer):
    ean = serializers.CharField(max_length=64)
    title = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    picture_urls = UrlListOrStringField(
        child=serializers.URLField(),
        required=False,
        allow_empty=True,
    )
    unit_id = serializers.IntegerField(required=False)
    storefront = serializers.CharField(max_length=32, required=False, allow_blank=True)
    price = serializers.CharField(max_length=64, required=False, allow_blank=True)
    controller = serializers.ChoiceField(choices=["jv", "xl"], required=True)


class KauflandDeleteByEANSerializer(serializers.Serializer):
    ean = serializers.CharField(max_length=64)
    controller = serializers.ChoiceField(choices=["jv", "xl"], required=True)


class KauflandCreateByEANSerializer(serializers.Serializer):
    ean = serializers.CharField(max_length=64)
    controller = serializers.ChoiceField(choices=["jv", "xl"], required=True)
    title = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=True, allow_blank=True)
    picture = serializers.ListField(
        required=True,
        allow_empty=True,
        child=serializers.CharField(),
    )
    price = serializers.IntegerField(required=True)
    size = serializers.CharField(required=True, allow_blank=False)
    color = serializers.CharField(required=True, allow_blank=False)
    material = serializers.CharField(required=True, allow_blank=False)
    delivery = serializers.IntegerField(required=True)
    height = serializers.IntegerField(required=True)
    length = serializers.IntegerField(required=True)
    width = serializers.IntegerField(required=True)
