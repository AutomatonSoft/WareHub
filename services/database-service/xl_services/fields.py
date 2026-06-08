"""Shared XL/OpenCart field groups used by API, batch and source push flows."""

XL_RELATION_FIELDS = frozenset(
    {
        "descriptions",
        "categories",
        "stores",
        "images",
        "specials",
    }
)

XL_SCALAR_FIELDS = frozenset(
    {
        "source_model",
        "source_sku",
        "source_ean_field",
        "price",
        "quantity",
        "status",
        "manufacturer_id",
        "stock_status_id",
        "tax_class_id",
        "shipping",
        "subtract",
        "minimum",
        "points",
        "sort_order",
        "seo_url",
        "image",
        "date_available",
        "update_user",
    }
)

XL_SOURCE_PUSH_SCALAR_FIELDS = frozenset(field for field in XL_SCALAR_FIELDS if field != "update_user")
