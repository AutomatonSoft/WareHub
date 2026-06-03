SCALAR_UPDATE_KEYS = (
    "source_model",
    "source_sku",
    "source_ean_field",
    "price",
    "quantity",
    "status",
    "manufacturer_id",
    "stock_status_id",
    "tax_class_id",
    "image",
    "date_available",
    "update_user",
)


def extract_scalar_updates(payload: dict) -> dict:
    return {key: payload.get(key) for key in SCALAR_UPDATE_KEYS if key in payload}


def ensure_main_category(categories: list[dict], template_main_category_id):
    normalized = [category for category in categories if category.get("category_id") is not None]
    if not normalized:
        return normalized

    if any(bool(category.get("main_category", False)) for category in normalized):
        return normalized

    preferred = None
    if template_main_category_id is not None:
        try:
            preferred = int(template_main_category_id)
        except (TypeError, ValueError):
            preferred = None

    category_ids = {int(category["category_id"]) for category in normalized}
    fallback_id = preferred if preferred in category_ids else int(normalized[0]["category_id"])
    return [
        {
            **category,
            "main_category": int(category["category_id"]) == fallback_id,
        }
        for category in normalized
    ]
