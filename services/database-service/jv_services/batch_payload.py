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


def as_category_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return False
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off", "none", "null"}:
            return False
    try:
        return bool(int(value))
    except (TypeError, ValueError):
        return bool(value)


def ensure_main_category(categories: list[dict], template_main_category_id):
    normalized = [category for category in categories if category.get("category_id") is not None]
    if not normalized:
        return normalized

    if any(as_category_bool(category.get("main_category", False)) for category in normalized):
        main_assigned = False
        result = []
        for category in normalized:
            is_main = as_category_bool(category.get("main_category", False)) and not main_assigned
            if is_main:
                main_assigned = True
            result.append({**category, "main_category": is_main})
        return result

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
