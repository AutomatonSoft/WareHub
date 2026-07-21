from __future__ import annotations

from datetime import date, datetime

from xl_services.models import (
    ImportedProduct,
    ImportedProductCategory,
    ImportedProductDescription,
    ImportedProductImage,
    ImportedProductSpecial,
    ImportedProductStore,
)


def build_xl_source_payload(snapshot: dict, *, site: str, site_key: str, query_ean: str):
    product_row = snapshot["product"]
    effective_ean = effective_xl_ean_from_source(product_row, fallback=query_ean)
    local_product, local_conflict = resolve_xl_local_product_for_source(
        site=site,
        site_key=site_key,
        source_product_id=product_row["product_id"],
        effective_ean=effective_ean,
    )
    return {
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
        "shipping": bool(product_row.get("shipping", 1)),
        "subtract": bool(product_row.get("subtract", 1)),
        "minimum": product_row.get("minimum"),
        "points": product_row.get("points"),
        "sort_order": product_row.get("sort_order"),
        "seo_url": (snapshot.get("seo_url") or "").strip(),
        "image": (product_row.get("image") or "").strip(),
        "date_available": product_row.get("date_available"),
        "date_modified_in_source": product_row.get("date_modified"),
        "descriptions": snapshot["descriptions"],
        "categories": snapshot["categories"],
        "stores": snapshot["stores"],
        "images": snapshot["images"],
        "specials": snapshot["specials"],
        "xl_attribute_fields": snapshot.get("attributes") if isinstance(snapshot.get("attributes"), list) else [],
        "local_exists": local_product is not None,
        "local_id": local_product.id if local_product else None,
        "local_conflict": local_conflict is not None,
        "local_conflict_id": local_conflict.id if local_conflict else None,
        "local_conflict_source_product_id": local_conflict.source_product_id if local_conflict else None,
        "jv_fields": None,
    }


def effective_xl_ean_from_source(source_product: dict, *, fallback: str):
    source_ean = str(source_product.get("ean") or "").strip()
    source_model = str(source_product.get("model") or "").strip()
    if source_ean and source_ean not in {"0", "1"}:
        return source_ean
    if source_model and any(ch.isdigit() for ch in source_model):
        return source_model
    return fallback


def resolve_xl_local_product_for_source(*, site: str, site_key: str, source_product_id: int, effective_ean: str):
    by_source = ImportedProduct.objects.filter(site=site, site_key=site_key, source_product_id=source_product_id).first()
    if by_source is not None:
        return by_source, None
    by_ean = ImportedProduct.objects.filter(site=site, site_key=site_key, ean=effective_ean).first()
    if by_ean is None:
        return None, None
    if int(by_ean.source_product_id) != int(source_product_id):
        return None, by_ean
    return by_ean, None


def sync_xl_children_from_snapshot(product, snapshot: dict):
    product.descriptions.all().delete()
    product.categories.all().delete()
    product.stores.all().delete()
    product.images.all().delete()
    product.specials.all().delete()

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

    descriptions = dedupe_by_key(snapshot.get("descriptions", []), lambda item: to_int_or_none(item.get("language_id")))
    categories = dedupe_by_key(snapshot.get("categories", []), lambda item: to_int_or_none(item.get("category_id")))
    stores = dedupe_by_key(snapshot.get("stores", []), lambda item: to_int_or_none(item.get("store_id")))
    specials = dedupe_by_key(snapshot.get("specials", []), lambda item: to_int_or_none(item.get("customer_group_id")) or 1)

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
            ImportedProductStore(product=product, store_id=store_id)
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
