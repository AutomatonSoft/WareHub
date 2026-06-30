from rest_framework import serializers

from .models import (
    ImportedProduct,
    JVBatchJob,
    JVBatchJobItem,
    ImportedProductCategory,
    ImportedProductDescription,
    ImportedProductImage,
    ImportedProductSpecial,
    ImportedProductStore,
)


class ImportedProductDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportedProductDescription
        fields = (
            "id",
            "language_id",
            "name",
            "description",
            "tag",
            "meta_title",
            "meta_description",
            "meta_keyword",
            "is_modified_locally",
        )


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
        fields = (
            "id",
            "customer_group_id",
            "priority",
            "price",
            "date_start",
            "date_end",
            "is_modified_locally",
        )


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
    translation_source_language = serializers.CharField(max_length=16, required=False, allow_blank=True)
    locale_by_site_key = serializers.DictField(child=serializers.CharField(max_length=16), required=False)
    convert_currency = serializers.BooleanField(required=False, default=False)
    source_currency = serializers.CharField(max_length=8, required=False, allow_blank=True)

    def validate_descriptions(self, value):
        lang_ids = [item["language_id"] for item in value]
        if len(lang_ids) != len(set(lang_ids)):
            raise serializers.ValidationError("Duplicate language_id in descriptions.")
        return value

    def validate_categories(self, value):
        category_ids = [item["category_id"] for item in value]
        if len(category_ids) != len(set(category_ids)):
            raise serializers.ValidationError("Duplicate category_id in categories.")
        return value

    def validate_stores(self, value):
        store_ids = [item["store_id"] for item in value]
        if len(store_ids) != len(set(store_ids)):
            raise serializers.ValidationError("Duplicate store_id in stores.")
        return value

    def validate_images(self, value):
        for item in value:
            image = (item.get("image") or "").strip()
            if not image:
                raise serializers.ValidationError("Image path cannot be empty.")
        return value

    def validate_specials(self, value):
        group_ids = [int(item.get("customer_group_id", 1)) for item in value]
        if len(group_ids) != len(set(group_ids)):
            raise serializers.ValidationError("Duplicate customer_group_id in specials.")
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


class JVBatchPayloadSerializer(serializers.Serializer):
    site_family = serializers.ChoiceField(choices=[ImportedProduct.Site.JV], default=ImportedProduct.Site.JV)
    site_keys = serializers.ListField(
        child=serializers.CharField(max_length=64),
        required=False,
        allow_empty=True,
    )
    template_site_key = serializers.CharField(max_length=64, required=False, allow_blank=True)
    template_main_category_id = serializers.IntegerField(required=False, allow_null=True)
    default_price = serializers.DecimalField(max_digits=15, decimal_places=4, required=False)
    convert_currency = serializers.BooleanField(required=False, default=True)
    source_currency = serializers.CharField(max_length=8, required=False, allow_blank=True)
    currency_by_site_key = serializers.DictField(
        child=serializers.CharField(max_length=8),
        required=False,
    )
    price_by_site_key = serializers.DictField(
        child=serializers.DecimalField(max_digits=15, decimal_places=4),
        required=False,
    )
    image_by_site_key = serializers.DictField(
        child=serializers.CharField(max_length=255, allow_blank=True),
        required=False,
    )
    categories_by_site_key = serializers.DictField(required=False)
    descriptions = BatchDescriptionChangeSerializer(many=True, required=False)
    translate_texts = serializers.BooleanField(required=False, default=False)
    translation_source = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False)
    translation_source_language = serializers.CharField(max_length=16, required=False, allow_blank=True)
    locale_by_site_key = serializers.DictField(child=serializers.CharField(max_length=16), required=False)
    language_id_by_locale = serializers.DictField(child=serializers.IntegerField(min_value=1), required=False)
    jv_fields = serializers.DictField(required=False)
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

    def validate_descriptions(self, value):
        lang_ids = [item["language_id"] for item in value]
        if len(lang_ids) != len(set(lang_ids)):
            raise serializers.ValidationError("Duplicate language_id in descriptions.")
        return value

    def validate_categories(self, value):
        ids = [item["category_id"] for item in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Duplicate category_id in categories.")
        return value

    def validate_categories_by_site_key(self, value):
        normalized = {}
        for raw_site_key, rows in (value or {}).items():
            site_key = str(raw_site_key or "").strip().upper()
            if not site_key:
                continue
            if not isinstance(rows, list):
                raise serializers.ValidationError(f"{site_key}: expected a list of categories.")
            category_ids = []
            normalized_rows = []
            for row in rows:
                if not isinstance(row, dict):
                    raise serializers.ValidationError(f"{site_key}: category row must be an object.")
                try:
                    category_id = int(row.get("category_id"))
                except (TypeError, ValueError):
                    raise serializers.ValidationError(f"{site_key}: category_id must be an integer.")
                category_ids.append(category_id)
                normalized_rows.append(
                    {
                        "category_id": category_id,
                        "main_category": bool(row.get("main_category", False)),
                    }
                )
            if len(category_ids) != len(set(category_ids)):
                raise serializers.ValidationError(f"{site_key}: duplicate category_id in categories.")
            normalized[site_key] = normalized_rows
        return normalized

    def validate_stores(self, value):
        ids = [item["store_id"] for item in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Duplicate store_id in stores.")
        return value

    def validate_images(self, value):
        for item in value:
            image = (item.get("image") or "").strip()
            if not image:
                raise serializers.ValidationError("Image path cannot be empty.")
        return value

    def validate_specials(self, value):
        group_ids = [int(item.get("customer_group_id", 1)) for item in value]
        if len(group_ids) != len(set(group_ids)):
            raise serializers.ValidationError("Duplicate customer_group_id in specials.")
        return value

    def validate_translation_source(self, value):
        allowed = {
            "name",
            "description",
            "tag",
            "meta_title",
            "meta_description",
            "meta_keyword",
            # JV aliases for admin content fields.
            "bezeichnung",
            "BESCHREIBUNG",
            "kurzbeschreibung",
            "KURZBESCHREIBUNG",
            "short_description_real",
        }
        unknown = [k for k in value.keys() if k not in allowed]
        if unknown:
            raise serializers.ValidationError(f"Unsupported translation_source fields: {', '.join(unknown)}.")
        return value

    def validate_translation_source_language(self, value):
        normalized = str(value or "").strip().lower()
        if normalized in {"", "auto"}:
            return "auto"
        if len(normalized) > 8:
            raise serializers.ValidationError("translation_source_language is too long.")
        return normalized

    def validate_site_keys(self, value):
        normalized = []
        seen = set()
        for raw in value:
            site_key = str(raw or "").strip().upper()
            if not site_key:
                continue
            if site_key in seen:
                continue
            seen.add(site_key)
            normalized.append(site_key)
        return normalized

    def validate_template_site_key(self, value):
        return str(value or "").strip().upper()


class JVBatchJobItemSerializer(serializers.ModelSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        details = data.get("details") or {}
        if not isinstance(details, dict):
            return data

        status_value = str(data.get("status") or "").strip().lower()
        phase_value = str(details.get("progress_phase") or "").strip().lower()
        message_value = str(details.get("progress_message") or "").strip()

        if status_value == "applied" and (
            phase_value != "applied"
            or message_value.lower() == "queued in worker."
        ):
            details["progress_phase"] = "applied"
            details["progress_message"] = "Applied to source DB."
        elif status_value == "failed" and (
            phase_value != "failed"
            or message_value.lower() == "queued in worker."
        ):
            details["progress_phase"] = "failed"
            details["progress_message"] = str(data.get("error_text") or "Apply failed.").strip()
        elif status_value == "skipped" and (
            phase_value != "skipped"
            or message_value.lower() == "queued in worker."
        ):
            details["progress_phase"] = "skipped"
            details["progress_message"] = str(data.get("error_text") or "Skipped.").strip()
        elif status_value == "pending" and not phase_value:
            details["progress_phase"] = "queued"
            details["progress_message"] = message_value or "Queued in worker."

        data["details"] = details
        return data

    class Meta:
        model = JVBatchJobItem
        fields = "__all__"


class JVBatchJobSerializer(serializers.ModelSerializer):
    items = JVBatchJobItemSerializer(many=True, read_only=True)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        summary = data.get("result_summary") or {}
        if not isinstance(summary, dict):
            summary = {}

        status_value = str(data.get("status") or "").strip().lower()
        phase_value = str(summary.get("progress_phase") or "").strip().lower()
        message_value = str(summary.get("progress_message") or "").strip()

        if status_value == "applied" and phase_value != "completed":
            summary["progress_phase"] = "completed"
            summary["progress_message"] = message_value or "Batch apply completed."
        elif status_value == "failed" and phase_value != "failed":
            summary["progress_phase"] = "failed"
            summary["progress_message"] = message_value or "Batch apply completed with failures."
        elif status_value == "running" and not phase_value:
            summary["progress_phase"] = "applying"
            summary["progress_message"] = message_value or "Worker is applying site updates."
        elif status_value == "pending" and not phase_value:
            summary["progress_phase"] = "queued"
            summary["progress_message"] = message_value or "Batch job queued."

        data["result_summary"] = summary
        return data

    class Meta:
        model = JVBatchJob
        fields = "__all__"
