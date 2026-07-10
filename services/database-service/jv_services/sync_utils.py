import os
from datetime import date, datetime

from .models import (
    ImportedProduct,
    ImportedProductCategory,
    ImportedProductDescription,
    ImportedProductImage,
    ImportedProductSpecial,
    ImportedProductStore,
)

JV_PUBLIC_BASE_BY_SITE_KEY = {
    "JV_DE": "https://www.jvmoebel.de",
    "JV_AT": "https://www.jvmoebel.at",
    "JV_CH": "https://www.jvmoebel.ch",
    "JV_CO_UK": "https://www.jvfurniture.co.uk",
}


def _jv_legacy_code(site_key: str) -> str:
    key = (site_key or "").strip().upper()
    if key.startswith("JV_"):
        return key.split("JV_", 1)[1]
    return ""


def _jv_public_base_for_site_key(site_key: str) -> str:
    code = _jv_legacy_code(site_key)
    if code:
        raw = (os.getenv(f"FTP_{code}_URL") or "").strip()
        if raw:
            if raw.startswith("http://") or raw.startswith("https://"):
                return raw.rstrip("/")
            host = raw.strip("/")
            if host:
                return f"https://www.{host}"
        raw_domain = (os.getenv(f"FTP_{code}_DOMAIN") or os.getenv(f"FTP_{code}_DOMIN") or "").strip()
        if raw_domain:
            host = raw_domain.strip("/")
            if host:
                return f"https://www.{host}"
    return JV_PUBLIC_BASE_BY_SITE_KEY.get((site_key or "").strip().upper(), "")


def _to_public_url_if_relative(path: str, base: str) -> str:
    value = str(path or "").strip()
    if not value:
        return ""
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if not base:
        return value
    return f"{base}/{value.lstrip('/')}"


def add_jv_public_image_urls(payload: dict, *, site_key: str) -> dict:
    if not isinstance(payload, dict):
        return payload
    base = _jv_public_base_for_site_key(site_key)
    image_path = str(payload.get("image") or "").strip()
    payload["image_public_url"] = _to_public_url_if_relative(image_path, base)
    images = payload.get("images") or []
    public_rows = []
    if isinstance(images, list):
        for row in images:
            if not isinstance(row, dict):
                continue
            image_value = str(row.get("image") or "").strip()
            public_rows.append(
                {
                    "image": image_value,
                    "sort_order": row.get("sort_order"),
                    "public_url": _to_public_url_if_relative(image_value, base),
                }
            )
    payload["images_public_urls"] = public_rows
    return payload


def effective_ean_from_source(product_row: dict, fallback: str) -> str:
    source_ean = str(product_row.get("artikelnr") or "").strip()
    print(source_ean)
    source_model = str(product_row.get("model") or "").strip()

    if source_ean and source_ean not in {"0", "1"}:
        return source_ean
    if source_model and any(ch.isdigit() for ch in source_model):
        return source_model
    return fallback


def resolve_local_product_for_source(*, site: str, site_key: str, source_product_id: int, effective_ean: str):
    by_source = ImportedProduct.objects.filter(
        site=site,
        site_key=site_key,
        source_product_id=source_product_id,
    ).first()
    if by_source is not None:
        return by_source, None

    by_ean = ImportedProduct.objects.filter(site=site, site_key=site_key, ean=effective_ean).first()
    if by_ean is None:
        return None, None

    if int(by_ean.source_product_id) != int(source_product_id):
        return None, by_ean
    return by_ean, None


def build_source_payload(snapshot: dict, site: str, site_key: str, query_ean: str) -> dict:
    product_row = snapshot["product"]
    effective_ean = effective_ean_from_source(product_row, fallback=query_ean)
    local_product, local_conflict = resolve_local_product_for_source(
        site=site,
        site_key=site_key,
        source_product_id=product_row["product_id"],
        effective_ean=effective_ean,
    )
    jv_fields = snapshot.get("jv_fields") if str(site or "").upper() == ImportedProduct.Site.JV else None
    payload = {
        "site": site,
        "site_key": site_key,
        "ean": effective_ean,
        "source_product_id": product_row["product_id"],
        "source_sku": (product_row.get("sku") or "").strip(),
        "source_model": (product_row.get("model") or "").strip(),
        "source_ean_field": (product_row.get("ean") or "").strip(),
        "price": product_row.get("price"),
        "quantity": product_row.get("quantity"),
        "status": bool(product_row.get("status", 0)),
        "manufacturer_id": product_row.get("manufacturer_id"),
        "stock_status_id": product_row.get("stock_status_id"),
        "tax_class_id": product_row.get("tax_class_id"),
        "image": (product_row.get("image") or "").strip(),
        "date_available": product_row.get("date_available"),
        "date_modified_in_source": product_row.get("date_modified"),
        "descriptions": snapshot["descriptions"],
        "categories": snapshot["categories"],
        "stores": snapshot["stores"],
        "images": snapshot["images"],
        "specials": snapshot["specials"],
        "local_exists": local_product is not None,
        "local_id": local_product.id if local_product else None,
        "local_conflict": local_conflict is not None,
        "local_conflict_id": local_conflict.id if local_conflict else None,
        "local_conflict_source_product_id": local_conflict.source_product_id if local_conflict else None,
        "jv_fields": jv_fields if isinstance(jv_fields, dict) else None,
    }
    if str(site or "").upper() == ImportedProduct.Site.JV:
        return add_jv_public_image_urls(payload, site_key=site_key)
    return payload


def dedupe_by_key(items: list[dict], key_fn):
    seen = set()
    result = []
    for item in items:
        key = key_fn(item)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def to_int_or_none(value):
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def to_date_or_none(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text or text.startswith("0000-00-00"):
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def sync_children_from_snapshot(product: ImportedProduct, snapshot: dict):
    product.descriptions.all().delete()
    product.categories.all().delete()
    product.stores.all().delete()
    product.images.all().delete()
    product.specials.all().delete()

    descriptions = dedupe_by_key(
        snapshot.get("descriptions", []),
        lambda item: to_int_or_none(item.get("language_id")),
    )
    categories = dedupe_by_key(
        snapshot.get("categories", []),
        lambda item: to_int_or_none(item.get("category_id")),
    )
    stores = dedupe_by_key(
        snapshot.get("stores", []),
        lambda item: to_int_or_none(item.get("store_id")),
    )
    specials = dedupe_by_key(
        snapshot.get("specials", []),
        lambda item: to_int_or_none(item.get("customer_group_id")) or 1,
    )

    ImportedProductDescription.objects.bulk_create(
        [
            ImportedProductDescription(
                product=product,
                language_id=language_id,
                name=item.get("name") or "",
                description=item.get("description") or "",
                tag=item.get("tag") or "",
                meta_title=item.get("meta_title") or "",
                meta_description=item.get("meta_description") or "",
                meta_keyword=item.get("meta_keyword") or "",
                is_modified_locally=False,
            )
            for item in descriptions
            for language_id in [to_int_or_none(item.get("language_id"))]
            if language_id is not None
        ],
        ignore_conflicts=True,
    )

    ImportedProductCategory.objects.bulk_create(
        [
            ImportedProductCategory(
                product=product,
                category_id=category_id,
                main_category=bool(item.get("main_category", 0)),
            )
            for item in categories
            for category_id in [to_int_or_none(item.get("category_id"))]
            if category_id is not None
        ],
        ignore_conflicts=True,
    )

    ImportedProductStore.objects.bulk_create(
        [
            ImportedProductStore(
                product=product,
                store_id=store_id,
            )
            for item in stores
            for store_id in [to_int_or_none(item.get("store_id"))]
            if store_id is not None
        ],
        ignore_conflicts=True,
    )

    ImportedProductImage.objects.bulk_create(
        [
            ImportedProductImage(
                product=product,
                image=item.get("image") or "",
                sort_order=to_int_or_none(item.get("sort_order")) or 0,
            )
            for item in snapshot.get("images", [])
            if (item.get("image") or "").strip()
        ]
    )

    ImportedProductSpecial.objects.bulk_create(
        [
            ImportedProductSpecial(
                product=product,
                customer_group_id=to_int_or_none(item.get("customer_group_id")) or 1,
                priority=to_int_or_none(item.get("priority")) or 0,
                price=item["price"],
                date_start=to_date_or_none(item.get("date_start")),
                date_end=to_date_or_none(item.get("date_end")),
                is_modified_locally=False,
            )
            for item in specials
            if item.get("price") is not None
        ]
    )
