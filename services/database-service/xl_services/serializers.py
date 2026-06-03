from rest_framework import serializers

from .models import (
    ImportedProduct,
    ImportedProductCategory,
    ImportedProductDescription,
    ImportedProductImage,
    ImportedProductSpecial,
    ImportedProductStore,
    XLBatchJob,
    XLBatchJobItem,
)


class ImportedProductDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportedProductDescription
        fields = ("id", "language_id", "name", "description", "tag", "meta_title", "meta_description", "meta_keyword", "is_modified_locally")


class ImportedProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportedProductCategory
        fields = ("id", "category_id", "main_category")


class ImportedProductStoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportedProductStore
        fields = ("id", "store_id")


class ImportedProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportedProductImage
        fields = ("id", "image", "sort_order")


class ImportedProductSpecialSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportedProductSpecial
        fields = ("id", "customer_group_id", "priority", "price", "date_start", "date_end", "is_modified_locally")


class ImportedProductDetailSerializer(serializers.ModelSerializer):
    descriptions = ImportedProductDescriptionSerializer(many=True, read_only=True)
    categories = ImportedProductCategorySerializer(many=True, read_only=True)
    stores = ImportedProductStoreSerializer(many=True, read_only=True)
    images = ImportedProductImageSerializer(many=True, read_only=True)
    specials = ImportedProductSpecialSerializer(many=True, read_only=True)

    class Meta:
        model = ImportedProduct
        fields = "__all__"


class ImportedProductDescriptionPatchSerializer(serializers.Serializer):
    language_id = serializers.IntegerField()
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    tag = serializers.CharField(required=False, allow_blank=True)
    meta_title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    meta_description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    meta_keyword = serializers.CharField(required=False, allow_blank=True)
    is_modified_locally = serializers.BooleanField(required=False, default=False)


class ImportedProductCategoryPatchSerializer(serializers.Serializer):
    category_id = serializers.IntegerField()
    main_category = serializers.BooleanField(required=False, default=False)


class ImportedProductStorePatchSerializer(serializers.Serializer):
    store_id = serializers.IntegerField()


class ImportedProductImagePatchSerializer(serializers.Serializer):
    image = serializers.CharField(max_length=255)
    sort_order = serializers.IntegerField(required=False, default=0)


class ImportedProductSpecialPatchSerializer(serializers.Serializer):
    customer_group_id = serializers.IntegerField(required=False, default=1)
    priority = serializers.IntegerField(required=False, default=0)
    price = serializers.DecimalField(max_digits=15, decimal_places=4)
    date_start = serializers.DateField(required=False, allow_null=True)
    date_end = serializers.DateField(required=False, allow_null=True)
    is_modified_locally = serializers.BooleanField(required=False, default=False)


class ImportedProductPatchSerializer(serializers.Serializer):
    source_model = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    source_sku = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    source_ean_field = serializers.CharField(max_length=14, required=False, allow_blank=True, allow_null=True)
    price = serializers.DecimalField(max_digits=15, decimal_places=4, required=False, allow_null=True)
    quantity = serializers.IntegerField(required=False, allow_null=True)
    status = serializers.BooleanField(required=False)
    manufacturer_id = serializers.IntegerField(required=False, allow_null=True)
    stock_status_id = serializers.IntegerField(required=False, allow_null=True)
    tax_class_id = serializers.IntegerField(required=False, allow_null=True)
    shipping = serializers.BooleanField(required=False)
    subtract = serializers.BooleanField(required=False)
    minimum = serializers.IntegerField(required=False, allow_null=True)
    points = serializers.IntegerField(required=False, allow_null=True)
    sort_order = serializers.IntegerField(required=False, allow_null=True)
    seo_url = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    image = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    date_available = serializers.DateField(required=False, allow_null=True)
    date_modified_in_source = serializers.DateTimeField(required=False, allow_null=True)
    is_modified_locally = serializers.BooleanField(required=False)
    is_pushed_to_source = serializers.BooleanField(required=False)
    last_imported_at = serializers.DateTimeField(required=False, allow_null=True)
    last_pushed_at = serializers.DateTimeField(required=False, allow_null=True)
    update_user = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)
    descriptions = ImportedProductDescriptionPatchSerializer(many=True, required=False)
    categories = ImportedProductCategoryPatchSerializer(many=True, required=False)
    stores = ImportedProductStorePatchSerializer(many=True, required=False)
    images = ImportedProductImagePatchSerializer(many=True, required=False)
    specials = ImportedProductSpecialPatchSerializer(many=True, required=False)
    jv_fields = serializers.DictField(required=False)
    translate_texts = serializers.BooleanField(required=False, default=False)
    translation_source = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False)
    translation_source_language = serializers.CharField(max_length=16, required=False, allow_blank=True)
    locale_by_site_key = serializers.DictField(child=serializers.CharField(max_length=16), required=False)
    language_id_by_locale = serializers.DictField(child=serializers.IntegerField(min_value=1), required=False)
    convert_currency = serializers.BooleanField(required=False, default=False)
    source_currency = serializers.CharField(max_length=8, required=False, allow_blank=True)
    currency_by_site_key = serializers.DictField(child=serializers.CharField(max_length=8), required=False)

    def validate_descriptions(self, value):
        if len([item["language_id"] for item in value]) != len(set([item["language_id"] for item in value])):
            raise serializers.ValidationError("Duplicate language_id in descriptions.")
        return value

    def validate_categories(self, value):
        if len([item["category_id"] for item in value]) != len(set([item["category_id"] for item in value])):
            raise serializers.ValidationError("Duplicate category_id in categories.")
        return value

    def validate_stores(self, value):
        if len([item["store_id"] for item in value]) != len(set([item["store_id"] for item in value])):
            raise serializers.ValidationError("Duplicate store_id in stores.")
        return value

    def validate_images(self, value):
        for item in value:
            if not (item.get("image") or "").strip():
                raise serializers.ValidationError("Image path cannot be empty.")
        return value

    def validate_specials(self, value):
        group_ids = [int(item.get("customer_group_id", 1)) for item in value]
        if len(group_ids) != len(set(group_ids)):
            raise serializers.ValidationError("Duplicate customer_group_id in specials.")
        return value

    def validate_translation_source(self, value):
        allowed = {"name", "description", "tag", "meta_title", "meta_description", "meta_keyword"}
        unknown = [k for k in value.keys() if k not in allowed]
        if unknown:
            raise serializers.ValidationError(f"Unsupported translation_source fields: {', '.join(unknown)}.")
        return value


class ImportedProductCreateSerializer(ImportedProductPatchSerializer):
    ean = serializers.CharField(max_length=64, required=False, allow_blank=True)
    source_product_id = serializers.IntegerField(required=False)


class BatchDescriptionChangeSerializer(serializers.Serializer):
    language_id = serializers.IntegerField()
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    tag = serializers.CharField(required=False, allow_blank=True)
    meta_title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    meta_description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    meta_keyword = serializers.CharField(required=False, allow_blank=True)


class BatchCategoryChangeSerializer(serializers.Serializer):
    category_id = serializers.IntegerField()
    main_category = serializers.BooleanField(required=False, default=False)


class BatchStoreChangeSerializer(serializers.Serializer):
    store_id = serializers.IntegerField()


class BatchImageChangeSerializer(serializers.Serializer):
    image = serializers.CharField(max_length=255)
    sort_order = serializers.IntegerField(required=False, default=0)


class BatchSpecialChangeSerializer(serializers.Serializer):
    customer_group_id = serializers.IntegerField(required=False, default=1)
    priority = serializers.IntegerField(required=False, default=0)
    price = serializers.DecimalField(max_digits=15, decimal_places=4)
    date_start = serializers.DateField(required=False, allow_null=True)
    date_end = serializers.DateField(required=False, allow_null=True)


class XLBatchPayloadSerializer(serializers.Serializer):
    site_family = serializers.ChoiceField(choices=[ImportedProduct.Site.XL], default=ImportedProduct.Site.XL)
    site_keys = serializers.ListField(child=serializers.CharField(max_length=64), required=False, allow_empty=True)
    template_site_key = serializers.CharField(max_length=64, required=False, allow_blank=True)
    template_main_category_id = serializers.IntegerField(required=False, allow_null=True)
    default_price = serializers.DecimalField(max_digits=15, decimal_places=4, required=False)
    convert_currency = serializers.BooleanField(required=False, default=True)
    source_currency = serializers.CharField(max_length=8, required=False, allow_blank=True)
    currency_by_site_key = serializers.DictField(child=serializers.CharField(max_length=8), required=False)
    price_by_site_key = serializers.DictField(child=serializers.DecimalField(max_digits=15, decimal_places=4), required=False)
    image_by_site_key = serializers.DictField(
        child=serializers.CharField(max_length=255, allow_blank=True),
        required=False,
    )
    descriptions = BatchDescriptionChangeSerializer(many=True, required=False)
    translate_texts = serializers.BooleanField(required=False, default=False)
    translation_source = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False)
    translation_source_language = serializers.CharField(max_length=16, required=False, allow_blank=True)
    locale_by_site_key = serializers.DictField(child=serializers.CharField(max_length=16), required=False)
    language_id_by_locale = serializers.DictField(child=serializers.IntegerField(min_value=1), required=False)
    source_model = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    source_sku = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    source_ean_field = serializers.CharField(max_length=14, required=False, allow_blank=True, allow_null=True)
    price = serializers.DecimalField(max_digits=15, decimal_places=4, required=False, allow_null=True)
    quantity = serializers.IntegerField(required=False, allow_null=True)
    status = serializers.BooleanField(required=False)
    manufacturer_id = serializers.IntegerField(required=False, allow_null=True)
    stock_status_id = serializers.IntegerField(required=False, allow_null=True)
    tax_class_id = serializers.IntegerField(required=False, allow_null=True)
    image = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    date_available = serializers.DateField(required=False, allow_null=True)
    update_user = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)
    categories = BatchCategoryChangeSerializer(many=True, required=False)
    stores = BatchStoreChangeSerializer(many=True, required=False)
    images = BatchImageChangeSerializer(many=True, required=False)
    specials = BatchSpecialChangeSerializer(many=True, required=False)

    def validate_translation_source(self, value):
        allowed = {"name", "description", "tag", "meta_title", "meta_description", "meta_keyword"}
        unknown = [k for k in value.keys() if k not in allowed]
        if unknown:
            raise serializers.ValidationError(f"Unsupported translation_source fields: {', '.join(unknown)}.")
        return value


class XLBatchJobItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = XLBatchJobItem
        fields = "__all__"


class XLBatchJobSerializer(serializers.ModelSerializer):
    items = XLBatchJobItemSerializer(many=True, read_only=True)

    class Meta:
        model = XLBatchJob
        fields = "__all__"
