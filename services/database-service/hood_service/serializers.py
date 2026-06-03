from rest_framework import serializers


class HoodPatchSerializer(serializers.Serializer):
    ean = serializers.CharField(required=False, allow_blank=False)
    account = serializers.ChoiceField(required=False, choices=["jv", "xl"])

    description = serializers.CharField(required=False, allow_blank=True)
    title = serializers.CharField(required=False, allow_blank=True)
    price = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.IntegerField(required=False, allow_null=True)

    categoryID = serializers.CharField(required=False, allow_blank=True)
    condition = serializers.CharField(required=False, allow_blank=True)
    itemMode = serializers.CharField(required=False, allow_blank=True)
    itemNumber = serializers.CharField(required=False, allow_blank=True)

    images = serializers.ListField(
        child=serializers.CharField(allow_blank=False),
        required=False,
    )
    productProperties = serializers.ListField(
        child=serializers.DictField(),
        required=False,
    )

    def validate_images(self, value):
        cleaned = [str(v).strip() for v in value if str(v).strip()]
        if len(cleaned) != len(value):
            raise serializers.ValidationError("images must not contain empty values.")
        return cleaned
