from copy import deepcopy

from django.utils import timezone

from .models import HoodProductSnapshot


def save_hood_product_snapshot(*, account: str, ean: str, payload: dict) -> HoodProductSnapshot:
    normalized_account = str(account or "").strip().lower()
    normalized_ean = str(ean or "").strip()
    source_items = payload.get("items") if isinstance(payload, dict) else None
    first_item = source_items[0] if isinstance(source_items, list) and source_items and isinstance(source_items[0], dict) else {}
    source_item_id = str(first_item.get("itemID") or "").strip()
    snapshot, _ = HoodProductSnapshot.objects.update_or_create(
        account=normalized_account,
        ean=normalized_ean,
        defaults={
            "payload": deepcopy(payload),
            "source_item_id": source_item_id,
            "restored_at": None,
        },
    )
    return snapshot


def get_hood_product_snapshot_payload(*, account: str, ean: str) -> dict | None:
    snapshot = HoodProductSnapshot.objects.filter(
        account=str(account or "").strip().lower(),
        ean=str(ean or "").strip(),
    ).first()
    if snapshot is None or not isinstance(snapshot.payload, dict):
        return None
    return deepcopy(snapshot.payload)


def mark_hood_product_snapshot_restored(*, account: str, ean: str) -> None:
    HoodProductSnapshot.objects.filter(
        account=str(account or "").strip().lower(),
        ean=str(ean or "").strip(),
    ).update(restored_at=timezone.now())
