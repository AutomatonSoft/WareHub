import logging

from django.db.models import Q
from django.utils import timezone

from database.models import EbayListing

from .client import EbayApiError, EbayOAuthClient
from .listing_operations import execute_listing_operation

logger = logging.getLogger(__name__)
_MAX_RELIST_REDIRECTS = 5
_LEGACY_RELIST_PENDING = "sofort_relist_pending"


def toggle_ebay_listing(*, account: str, ean: str, inactive: bool) -> dict:
    matches = list(EbayListing.objects.filter(
        Q(sku=ean) | Q(source_ean=ean), account=account, marketplace_id="EBAY_DE",
    ).order_by("pk")[:2])
    if len(matches) != 1:
        raise EbayApiError(
            "Load and reconcile the eBay listing first." if not matches else "Multiple eBay listings match this EAN; select and reconcile the listing first.",
            status_code=409, operation="resolve_toggle_listing",
            details={"ean": ean, "account": account, "item_ids": [listing.item_id for listing in matches]},
        )
    listing = matches[0]
    client = EbayOAuthClient()
    if listing.listing_mode == EbayListing.ListingMode.INVENTORY:
        if not listing.offer_id:
            raise EbayApiError("The Inventory listing has no offer ID.", status_code=409)
        current = client.offer(account=account, offer_id=listing.offer_id)
        remote_status = str(current.get("status") or "").upper()
        if remote_status not in {"PUBLISHED", "UNPUBLISHED"}:
            raise EbayApiError("eBay returned an unknown offer status.", status_code=502)
        active = remote_status == "PUBLISHED"
        inactive_status = EbayListing.ListingStatus.WITHDRAWN
    else:
        if not listing.item_id:
            raise EbayApiError("The legacy listing has no Item ID.", status_code=409)
        current = client.listing(account=account, item_id=listing.item_id, marketplace_id=listing.marketplace_id)
        for _redirect in range(_MAX_RELIST_REDIRECTS):
            relisted_id = str(current.get("relisted_item_id") or "").strip()
            if not relisted_id:
                break
            listing.item_id = relisted_id
            current = client.listing(account=account, item_id=relisted_id, marketplace_id=listing.marketplace_id)
        else:
            raise EbayApiError("Too many legacy relist redirects; reconcile the current listing first.", status_code=409)
        if current.get("listing_type") != "FixedPriceItem" or current.get("has_variations"):
            raise EbayApiError("Sofort List toggles support only non-variation legacy fixed-price listings.", status_code=409)
        remote_status = str(current.get("listing_status") or "").lower()
        if remote_status not in {"active", "ended", "completed"}:
            raise EbayApiError("eBay returned an unknown legacy listing status.", status_code=502)
        active = remote_status == "active"
        inactive_status = EbayListing.ListingStatus.ENDED
    if listing.last_operation == _LEGACY_RELIST_PENDING and not active:
        raise EbayApiError("A legacy relist is still unresolved. Reconcile its result before retrying.", status_code=409)
    if active == (not inactive):
        listing.status = EbayListing.ListingStatus.ACTIVE if active else inactive_status
        if listing.last_operation == _LEGACY_RELIST_PENDING:
            listing.last_operation = "relist" if active else "unpublish"
        listing.save(update_fields=["status", "item_id", "last_operation", "updated_at"])
        return {"status": listing.status, "listing_mode": listing.listing_mode, "item_id": listing.item_id, "offer_id": listing.offer_id, "noop": True}
    if listing.listing_mode == EbayListing.ListingMode.LEGACY and not inactive:
        if listing.last_operation == _LEGACY_RELIST_PENDING or not EbayListing.objects.filter(
            pk=listing.pk, last_operation=listing.last_operation, updated_at=listing.updated_at,
        ).update(last_operation=_LEGACY_RELIST_PENDING, updated_at=timezone.now()):
            raise EbayApiError("A legacy relist is already pending. Reconcile its result before retrying to avoid duplicate listings.", status_code=409)
    return execute_listing_operation(
        account=account, marketplace_id=listing.marketplace_id,
        operation="unpublish" if inactive else "relist", listing_mode=listing.listing_mode,
        sku=listing.sku, item_id=listing.item_id, source_ean=listing.source_ean,
    )


def apply_ebay_active_state(*, account: str, ean: str, inactive: bool) -> dict:
    result = {"site_key": f"EBAY_{account.upper()}", "channel": "EBAY"}
    try:
        payload = toggle_ebay_listing(account=account, ean=ean, inactive=inactive)
    except EbayApiError as error:
        logger.warning("EBAY_TOGGLE_FAILED account=%s ean=%s inactive=%s operation=%s status_code=%s", account, ean, inactive, error.operation, error.status_code)
        return {**result, "ok": False, "status_code": error.status_code or 502, "details": {
            "code": "marketplace_ebay_toggle_failed", "detail": str(error),
            "ean": ean, "inactive": inactive, "operation": error.operation, "upstream": error.details,
        }}
    return {**result, "ok": True, "status_code": 200, "details": {
        "code": "marketplace_ebay_toggle_noop" if payload.get("noop") else "marketplace_ebay_toggle_applied",
        "ean": ean, "inactive": inactive, "listing": payload,
    }}
