from django.utils import timezone

from .models import ImportedProduct


def create_local_product_from_payload(
    *,
    site: str,
    site_key: str,
    source_product_id: int,
    ean: str,
    payload: dict,
    actor: str,
) -> ImportedProduct:
    raw_quantity = payload.get("quantity")
    try:
        normalized_quantity = int(raw_quantity) if raw_quantity is not None else 1
    except (TypeError, ValueError):
        normalized_quantity = 1
    if normalized_quantity <= 0:
        normalized_quantity = 1
    product = ImportedProduct.objects.create(
        site=site,
        site_key=site_key,
        source_product_id=source_product_id,
        ean=ean,
        source_model=str(payload.get("source_model") or "").strip(),
        source_sku=str(payload.get("source_sku") or "").strip(),
        source_ean_field=str(payload.get("source_ean_field") or "").strip(),
        price=payload.get("price"),
        quantity=normalized_quantity,
        status=bool(payload.get("status", False)),
        manufacturer_id=payload.get("manufacturer_id"),
        stock_status_id=payload.get("stock_status_id"),
        tax_class_id=payload.get("tax_class_id"),
        image=str(payload.get("image") or "").strip(),
        date_available=payload.get("date_available"),
        date_modified_in_source=None,
        is_modified_locally=True,
        is_pushed_to_source=False,
        local_save_status=ImportedProduct.LocalSaveStatus.SAVED,
        source_push_status=ImportedProduct.SourcePushStatus.PENDING,
        source_push_error="",
        last_imported_at=timezone.now(),
        last_pushed_at=None,
        user_create=str(actor),
        update_user=str(actor),
    )
    product._jv_fields = payload.get("_jv_fields") if isinstance(payload.get("_jv_fields"), dict) else {}
    return product


def create_local_product_from_source(
    *,
    site: str,
    site_key: str,
    source_product: dict,
    effective_ean: str,
    safe_date_available,
    safe_date_modified,
    actor: str,
) -> ImportedProduct:
    return ImportedProduct.objects.create(
        site=site,
        site_key=site_key,
        source_product_id=source_product["product_id"],
        ean=effective_ean,
        source_model=(source_product.get("model") or "").strip(),
        source_sku=(source_product.get("sku") or "").strip(),
        source_ean_field=(source_product.get("ean") or "").strip(),
        price=source_product.get("price"),
        quantity=source_product.get("quantity"),
        status=bool(source_product.get("status", 0)),
        manufacturer_id=source_product.get("manufacturer_id"),
        stock_status_id=source_product.get("stock_status_id"),
        tax_class_id=source_product.get("tax_class_id"),
        image=(source_product.get("image") or "").strip(),
        date_available=safe_date_available,
        date_modified_in_source=safe_date_modified,
        is_modified_locally=False,
        is_pushed_to_source=False,
        local_save_status=ImportedProduct.LocalSaveStatus.SAVED,
        source_push_status=ImportedProduct.SourcePushStatus.PENDING,
        source_push_error="",
        last_imported_at=timezone.now(),
        user_create=str(actor),
        update_user="",
    )


def update_local_product_from_source(
    *,
    product: ImportedProduct,
    source_product: dict,
    safe_date_available,
    safe_date_modified,
    actor: str,
) -> ImportedProduct:
    ImportedProduct.all_objects.filter(pk=product.pk).update(
        source_model=(source_product.get("model") or "").strip(),
        source_sku=(source_product.get("sku") or "").strip(),
        source_ean_field=(source_product.get("ean") or "").strip(),
        price=source_product.get("price"),
        quantity=source_product.get("quantity"),
        status=bool(source_product.get("status", 0)),
        manufacturer_id=source_product.get("manufacturer_id"),
        stock_status_id=source_product.get("stock_status_id"),
        tax_class_id=source_product.get("tax_class_id"),
        image=(source_product.get("image") or "").strip(),
        date_available=safe_date_available,
        date_modified_in_source=safe_date_modified,
        is_modified_locally=False,
        is_pushed_to_source=False,
        local_save_status=ImportedProduct.LocalSaveStatus.SAVED,
        source_push_status=ImportedProduct.SourcePushStatus.PENDING,
        source_push_error="",
        last_imported_at=timezone.now(),
        update_user=str(actor),
        updated_at=timezone.now(),
    )
    product.refresh_from_db()
    return product
