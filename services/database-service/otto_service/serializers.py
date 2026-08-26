from rest_framework import serializers

from .models import OttoProductJV, OttoProductXL
from .product_mapper import build_otto_url


class OttoProductJVSerializer(serializers.ModelSerializer):
    ottoUrl = serializers.SerializerMethodField()
    imageUrl = serializers.SerializerMethodField()

    def get_ottoUrl(self, instance) -> str | None:
        return build_otto_url(instance.moin)

    def get_imageUrl(self, instance) -> str | None:
        return instance.otto_image_url

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop("otto_image_url", None)
        return data

    class Meta:
        model = OttoProductJV
        fields = "__all__"


class OttoProductXLSerializer(serializers.ModelSerializer):
    ottoUrl = serializers.SerializerMethodField()
    imageUrl = serializers.SerializerMethodField()

    def get_ottoUrl(self, instance) -> str | None:
        return build_otto_url(instance.moin)

    def get_imageUrl(self, instance) -> str | None:
        return instance.otto_image_url

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop("otto_image_url", None)
        return data

    class Meta:
        model = OttoProductXL
        fields = "__all__"


class OttoProductPayloadSerializer(serializers.Serializer):
    productReference = serializers.CharField(max_length=255)
    sku = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    ean = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    pzn = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    mpn = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    moin = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    quantity = serializers.IntegerField(required=False, min_value=0)
    releaseDate = serializers.DateTimeField(required=False, allow_null=True)
    shippingProfileId = serializers.UUIDField(required=False)

    productDescription = serializers.JSONField(required=False)
    mediaAssets = serializers.JSONField(required=False)
    order = serializers.JSONField(required=False)
    pricing = serializers.JSONField(required=False)
    logistics = serializers.JSONField(required=False)
    compliance = serializers.JSONField(required=False)
