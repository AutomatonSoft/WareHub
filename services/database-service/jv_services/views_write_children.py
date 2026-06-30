from database.models import EANPool, EANUsage

from .models import (
    ImportedProduct,
    ImportedProductCategory,
    ImportedProductDescription,
    ImportedProductImage,
    ImportedProductSpecial,
    ImportedProductStore,
)


def normalize_images_payload(items) -> list[tuple[str, int]]:
    normalized: list[tuple[str, int]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        image = str(item.get("image") or "").strip()
        if not image:
            continue
        sort_order = int(item.get("sort_order") or 0)
        normalized.append((image, sort_order))
    return normalized


def normalize_images_model(items) -> list[tuple[str, int]]:
    return [
        (str(getattr(img, "image", "") or "").strip(), int(getattr(img, "sort_order", 0) or 0))
        for img in (items or [])
        if str(getattr(img, "image", "") or "").strip()
    ]


def record_ean_usage(
    *,
    ean: str,
    site: str,
    site_key: str,
    product: ImportedProduct,
    source_product_id=None,
) -> None:
    pool_item = EANPool.objects.filter(ean=ean).first()
    if pool_item is None:
        return
    defaults = {"local_product_id": product.id}
    if source_product_id is not None:
        defaults["source_product_id"] = source_product_id
    EANUsage.objects.update_or_create(
        ean=pool_item,
        site=site,
        site_key=site_key,
        defaults=defaults,
    )


def bulk_create_descriptions(product: ImportedProduct, descriptions, *, modified_default: bool) -> None:
    if not descriptions:
        return
    ImportedProductDescription.objects.bulk_create(
        [
            ImportedProductDescription(
                product=product,
                language_id=int(item["language_id"]),
                name=str(item.get("name") or ""),
                description=str(item.get("description") or ""),
                tag=str(item.get("tag") or ""),
                meta_title=str(item.get("meta_title") or ""),
                meta_description=str(item.get("meta_description") or ""),
                meta_keyword=str(item.get("meta_keyword") or ""),
                is_modified_locally=bool(item.get("is_modified_locally", modified_default)),
            )
            for item in descriptions
        ]
    )


def bulk_create_categories(product: ImportedProduct, categories) -> None:
    if not categories:
        return
    ImportedProductCategory.objects.bulk_create(
        [
            ImportedProductCategory(
                product=product,
                category_id=int(item["category_id"]),
                main_category=bool(item.get("main_category", False)),
            )
            for item in categories
        ],
        ignore_conflicts=True,
    )


def bulk_create_stores(product: ImportedProduct, stores) -> None:
    if not stores:
        return
    ImportedProductStore.objects.bulk_create(
        [
            ImportedProductStore(product=product, store_id=int(item["store_id"]))
            for item in stores
        ],
        ignore_conflicts=True,
    )


def bulk_create_images(product: ImportedProduct, images) -> None:
    if not images:
        return
    # Deduplicate by image path (the upstream feed can repeat images) and
    # re-sequence sort_order so the stored gallery has no gaps or duplicates.
    seen: set[str] = set()
    rows: list[ImportedProductImage] = []
    for item in images:
        image = str(item.get("image") or "").strip()
        if not image or image in seen:
            continue
        seen.add(image)
        rows.append(
            ImportedProductImage(product=product, image=image, sort_order=len(rows))
        )
    if rows:
        ImportedProductImage.objects.bulk_create(rows)


def bulk_create_specials(product: ImportedProduct, specials, *, modified_default: bool) -> None:
    if not specials:
        return
    ImportedProductSpecial.objects.bulk_create(
        [
            ImportedProductSpecial(
                product=product,
                customer_group_id=int(item.get("customer_group_id", 1)),
                priority=int(item.get("priority", 0)),
                price=item["price"],
                date_start=item.get("date_start"),
                date_end=item.get("date_end"),
                is_modified_locally=bool(item.get("is_modified_locally", modified_default)),
            )
            for item in specials
        ]
    )


def create_payload_children(product: ImportedProduct, payload: dict) -> None:
    bulk_create_descriptions(product, payload.get("descriptions") or [], modified_default=True)
    bulk_create_categories(product, payload.get("categories") or [])
    bulk_create_stores(product, payload.get("stores") or [])
    bulk_create_images(product, payload.get("images") or [])
    bulk_create_specials(product, payload.get("specials") or [], modified_default=True)
