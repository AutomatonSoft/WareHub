from django.utils import timezone

from .models import ImportedProduct

FULL_PUSH_SCALAR_FIELDS = {
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
}

FULL_PUSH_RELATIONS = {"descriptions", "categories", "stores", "images", "specials"}


def mark_push_pending(product: ImportedProduct) -> None:
    ImportedProduct.all_objects.filter(pk=product.pk).update(
        local_save_status=ImportedProduct.LocalSaveStatus.SAVED,
        source_push_status=ImportedProduct.SourcePushStatus.PENDING,
        source_push_error="",
    )


def mark_push_failed(product: ImportedProduct, error: str) -> None:
    ImportedProduct.all_objects.filter(pk=product.pk).update(
        source_push_status=ImportedProduct.SourcePushStatus.FAILED,
        source_push_error=str(error or ""),
    )


def mark_push_pushed(product: ImportedProduct) -> None:
    ImportedProduct.all_objects.filter(pk=product.pk).update(
        is_pushed_to_source=True,
        last_pushed_at=timezone.now(),
        source_push_status=ImportedProduct.SourcePushStatus.PUSHED,
        source_push_error="",
    )
    product.refresh_from_db()
