from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import Q

from database.models import EbayListing

from .client import EbayApiError, EbayOAuthClient


_INVENTORY_OPERATIONS = frozenset({"fetch", "publish", "update", "unpublish", "relist"})
_LEGACY_OPERATIONS = frozenset({"fetch", "update", "unpublish", "relist"})


def execute_listing_operation(
    *,
    account: str,
    marketplace_id: str,
    operation: str,
    listing_mode: str,
    sku: str = "",
    item_id: str = "",
    source_ean: str = "",
    variation_sku: str = "",
    inventory_item: dict[str, Any] | None = None,
    offer: dict[str, Any] | None = None,
    quantity: int | None = None,
    price: str | None = None,
    currency: str = "EUR",
) -> dict[str, Any]:
    if listing_mode == EbayListing.ListingMode.INVENTORY:
        return _execute_inventory_operation(
            account=account,
            marketplace_id=marketplace_id,
            operation=operation,
            sku=sku,
            source_ean=source_ean,
            inventory_item=inventory_item,
            offer=offer,
            quantity=quantity,
            price=price,
            currency=currency,
        )
    if listing_mode == EbayListing.ListingMode.LEGACY:
        return _execute_legacy_operation(
            account=account,
            marketplace_id=marketplace_id,
            operation=operation,
            item_id=item_id,
            source_ean=source_ean,
            variation_sku=variation_sku,
            quantity=quantity,
            price=price,
            currency=currency,
        )
    raise EbayApiError("listing_mode must be inventory or legacy.", status_code=400)


def reconcile_legacy_listing(
    *,
    account: str,
    marketplace_id: str,
    source_ean: str,
    page: int,
    limit: int,
) -> dict[str, Any]:
    client = EbayOAuthClient()
    page_data = client.active_listings(account=account, marketplace_id=marketplace_id, page=page, limit=limit)
    matches = _legacy_ean_matches(listings=page_data.get("listings", []), source_ean=source_ean)
    if not matches:
        raise EbayApiError(
            "No active legacy listing with this EAN was found on the requested page.",
            status_code=404,
            details={"source_ean": source_ean, "page": page, "total_pages": page_data.get("total_pages", "0")},
            operation="get_active_listings",
        )
    if len(matches) > 1:
        raise EbayApiError(
            "Multiple active legacy listings match this EAN; select an item ID explicitly.",
            status_code=409,
            details={"source_ean": source_ean, "item_ids": [str(match[0].get("item_id") or "").strip() for match in matches]},
            operation="get_active_listings",
        )
    matched_listing, variation_sku = matches[0]
    item_id = str(matched_listing.get("item_id") or "").strip()
    if not item_id:
        raise EbayApiError(
            "eBay active listing lookup returned a listing without item ID.",
            status_code=502,
            details=matched_listing,
            operation="get_active_listings",
        )
    with transaction.atomic():
        listing, _ = EbayListing.objects.get_or_create(
            account=account,
            marketplace_id=marketplace_id,
            item_id=item_id,
            defaults={"listing_mode": EbayListing.ListingMode.LEGACY},
        )
        listing.listing_mode = EbayListing.ListingMode.LEGACY
        listing.source_ean = source_ean
        listing.legacy_ean_to_variation_sku = {**(listing.legacy_ean_to_variation_sku or {}), source_ean: variation_sku}
        listing.status = EbayListing.ListingStatus.ACTIVE
        listing.last_error = {}
        listing.save()
    return {
        "account": account,
        "marketplace_id": marketplace_id,
        "listing_mode": EbayListing.ListingMode.LEGACY,
        "source_ean": source_ean,
        "item_id": item_id,
        "variation_sku": variation_sku,
        "status": listing.status,
        "page": page,
        "total_pages": page_data.get("total_pages", "0"),
    }


def _legacy_ean_matches(*, listings: object, source_ean: str) -> list[tuple[dict[str, Any], str]]:
    matches: list[tuple[dict[str, Any], str]] = []
    for listing in listings if isinstance(listings, list) else []:
        if not isinstance(listing, dict):
            continue
        if source_ean in (listing.get("identifiers") or {}).get("EAN", []):
            matches.append((listing, ""))
            continue
        for variation in listing.get("variations", []):
            if not isinstance(variation, dict) or source_ean not in (variation.get("identifiers") or {}).get("EAN", []):
                continue
            variation_sku = str(variation.get("sku") or "").strip()
            if not variation_sku:
                raise EbayApiError(
                    "Legacy variation with this EAN has no SKU and cannot be updated safely.",
                    status_code=409,
                    details={"source_ean": source_ean, "item_id": listing.get("item_id")},
                    operation="get_active_listings",
                )
            matches.append((listing, variation_sku))
    return matches


def _execute_inventory_operation(
    *,
    account: str,
    marketplace_id: str,
    operation: str,
    sku: str,
    source_ean: str,
    inventory_item: dict[str, Any] | None,
    offer: dict[str, Any] | None,
    quantity: int | None,
    price: str | None,
    currency: str,
) -> dict[str, Any]:
    if operation not in _INVENTORY_OPERATIONS:
        raise EbayApiError("Unsupported Inventory API listing operation.", status_code=400)
    if not sku:
        raise EbayApiError("sku is required for Inventory API listings.", status_code=400)
    listing = EbayListing.objects.filter(account=account, marketplace_id=marketplace_id, sku=sku).first()
    client = EbayOAuthClient()

    if operation == "fetch":
        return {
            "account": account,
            "marketplace_id": marketplace_id,
            "listing_mode": EbayListing.ListingMode.INVENTORY,
            "operation": operation,
            "sku": sku,
            "status": listing.status if listing is not None else EbayListing.ListingStatus.UNKNOWN,
            "inventory_item": client.inventory_item(account=account, sku=sku),
            "offers": client.offers_by_sku(account=account, sku=sku, marketplace_id=marketplace_id),
        }

    if operation == "publish":
        if not isinstance(inventory_item, dict) or not isinstance(offer, dict):
            raise EbayApiError("inventory_item and offer are required to publish an Inventory API listing.", status_code=400)
        normalized_offer = _prepare_inventory_offer(
            offer=offer,
            sku=sku,
            marketplace_id=marketplace_id,
            quantity=quantity,
            price=price,
            currency=currency,
        )
        _validate_inventory_publish_payload(inventory_item=inventory_item, offer=normalized_offer)
        client.create_or_replace_inventory_item(
            account=account,
            sku=sku,
            item=inventory_item,
            marketplace_id=marketplace_id,
        )
        if listing is None:
            existing_offers = client.offers_by_sku(account=account, sku=sku, marketplace_id=marketplace_id)
            if len(existing_offers) > 1:
                raise EbayApiError(
                    "Multiple eBay offers exist for this SKU and marketplace; manual reconciliation is required.",
                    status_code=409,
                    details={"offer_ids": [str(entry.get("offerId") or "").strip() for entry in existing_offers]},
                    operation="get_offers_by_sku",
                )
            if existing_offers:
                existing_offer = existing_offers[0]
                existing_offer_id = str(existing_offer.get("offerId") or "").strip()
                if not existing_offer_id:
                    raise EbayApiError("eBay offer lookup returned an offer without offerId.", status_code=502, details=existing_offer, operation="get_offers_by_sku")
                listing = EbayListing(
                    account=account,
                    marketplace_id=marketplace_id,
                    listing_mode=EbayListing.ListingMode.INVENTORY,
                    sku=sku,
                    offer_id=existing_offer_id,
                    item_id=str(existing_offer.get("listingId") or "").strip(),
                    merchant_location_key=str(existing_offer.get("merchantLocationKey") or "").strip(),
                )
        if listing is not None and listing.offer_id:
            client.update_offer(account=account, offer_id=listing.offer_id, offer=normalized_offer)
            offer_id = listing.offer_id
        else:
            created_offer = client.create_offer(account=account, offer=normalized_offer)
            offer_id = str(created_offer.get("offerId") or "").strip()
            if not offer_id:
                raise EbayApiError("eBay create offer response does not contain offerId.", status_code=502, details=created_offer, operation="create_offer")
        published = client.publish_offer(account=account, offer_id=offer_id)
        return _save_listing(
            listing=listing,
            account=account,
            marketplace_id=marketplace_id,
            listing_mode=EbayListing.ListingMode.INVENTORY,
            source_ean=source_ean,
            sku=sku,
            offer_id=offer_id,
            item_id=str(published.get("listingId") or "").strip(),
            merchant_location_key=str(normalized_offer.get("merchantLocationKey") or "").strip(),
            status=EbayListing.ListingStatus.ACTIVE,
            operation=operation,
            result={"offer_id": offer_id, "listing_id": str(published.get("listingId") or "").strip()},
        )

    if listing is None and operation in {"update", "unpublish", "relist"}:
        listing = _discover_inventory_listing(client=client, account=account, marketplace_id=marketplace_id, sku=sku)
    if listing is None or not listing.offer_id:
        raise EbayApiError("No persisted Inventory API offer exists for this account, marketplace, and SKU.", status_code=409)
    if operation == "update":
        merchant_location_key = listing.merchant_location_key
        if inventory_item is not None:
            current_inventory_item = client.inventory_item(account=account, sku=sku)
            client.create_or_replace_inventory_item(
                account=account,
                sku=sku,
                item=_merge_inventory_item(current=current_inventory_item, patch=inventory_item),
                marketplace_id=marketplace_id,
            )
        if offer is not None:
            current_offer = client.offer(account=account, offer_id=listing.offer_id)
            merged_offer = _merge_inventory_offer(current=current_offer, patch=offer, sku=sku, marketplace_id=marketplace_id)
            client.update_offer(
                account=account,
                offer_id=listing.offer_id,
                offer=merged_offer,
            )
            merchant_location_key = str(merged_offer.get("merchantLocationKey") or "").strip()
        if quantity is not None or price is not None:
            client.bulk_update_price_quantity(
                account=account,
                sku=sku,
                offer_id=listing.offer_id,
                quantity=quantity,
                price=price,
                currency=currency,
            )
        if inventory_item is None and offer is None and quantity is None and price is None:
            raise EbayApiError("inventory_item, offer, quantity, or price is required for an Inventory API update.", status_code=400)
        return _save_listing(
            listing=listing,
            account=account,
            marketplace_id=marketplace_id,
            listing_mode=EbayListing.ListingMode.INVENTORY,
            source_ean=source_ean,
            sku=sku,
            offer_id=listing.offer_id,
            item_id=listing.item_id,
            merchant_location_key=merchant_location_key,
            status=listing.status,
            operation=operation,
            result={"offer_id": listing.offer_id, "listing_id": listing.item_id},
        )
    if operation == "unpublish":
        client.withdraw_offer(account=account, offer_id=listing.offer_id)
        return _save_listing(
            listing=listing,
            account=account,
            marketplace_id=marketplace_id,
            listing_mode=EbayListing.ListingMode.INVENTORY,
            source_ean=source_ean,
            sku=sku,
            offer_id=listing.offer_id,
            item_id=listing.item_id,
            merchant_location_key=listing.merchant_location_key,
            status=EbayListing.ListingStatus.WITHDRAWN,
            operation=operation,
            result={"offer_id": listing.offer_id, "listing_id": listing.item_id},
        )

    published = client.publish_offer(account=account, offer_id=listing.offer_id)
    return _save_listing(
        listing=listing,
        account=account,
        marketplace_id=marketplace_id,
        listing_mode=EbayListing.ListingMode.INVENTORY,
        source_ean=source_ean,
        sku=sku,
        offer_id=listing.offer_id,
        item_id=str(published.get("listingId") or listing.item_id).strip(),
        merchant_location_key=listing.merchant_location_key,
        status=EbayListing.ListingStatus.ACTIVE,
        operation=operation,
        result={"offer_id": listing.offer_id, "listing_id": str(published.get("listingId") or listing.item_id).strip()},
    )


def _prepare_inventory_offer(
    *,
    offer: dict[str, Any],
    sku: str,
    marketplace_id: str,
    quantity: int | None,
    price: str | None,
    currency: str,
) -> dict[str, Any]:
    normalized_offer = dict(offer)
    normalized_offer["sku"] = sku
    normalized_offer["marketplaceId"] = marketplace_id
    if quantity is not None:
        normalized_offer["availableQuantity"] = quantity
    if price is not None:
        pricing_summary = dict(normalized_offer.get("pricingSummary") or {})
        pricing_summary["price"] = {"currency": currency, "value": price}
        normalized_offer["pricingSummary"] = pricing_summary
    return normalized_offer


def _validate_inventory_publish_payload(*, inventory_item: dict[str, Any], offer: dict[str, Any]) -> None:
    product = inventory_item.get("product") if isinstance(inventory_item.get("product"), dict) else {}
    availability = inventory_item.get("availability") if isinstance(inventory_item.get("availability"), dict) else {}
    ship_to = availability.get("shipToLocationAvailability") if isinstance(availability.get("shipToLocationAvailability"), dict) else {}
    policies = offer.get("listingPolicies") if isinstance(offer.get("listingPolicies"), dict) else {}
    pricing = offer.get("pricingSummary") if isinstance(offer.get("pricingSummary"), dict) else {}
    price = pricing.get("price") if isinstance(pricing.get("price"), dict) else {}
    missing: list[str] = []
    if not inventory_item.get("condition"):
        missing.append("inventory_item.condition")
    for field in ("title", "description", "aspects", "imageUrls"):
        if not product.get(field):
            missing.append(f"inventory_item.product.{field}")
    if "quantity" not in ship_to and "availableQuantity" not in offer:
        missing.append("inventory_item.availability.shipToLocationAvailability.quantity or offer.availableQuantity")
    for field in ("format", "categoryId", "merchantLocationKey", "listingDuration"):
        if not offer.get(field):
            missing.append(f"offer.{field}")
    for field in ("fulfillmentPolicyId", "paymentPolicyId", "returnPolicyId"):
        if not policies.get(field):
            missing.append(f"offer.listingPolicies.{field}")
    if not price.get("currency") or not price.get("value"):
        missing.append("offer.pricingSummary.price")
    if missing:
        raise EbayApiError(
            "Inventory API publish payload is missing fields required by eBay.",
            status_code=400,
            details={"missing_fields": missing},
            operation="publish_offer",
        )


def _discover_inventory_listing(*, client: EbayOAuthClient, account: str, marketplace_id: str, sku: str) -> EbayListing:
    offers = client.offers_by_sku(account=account, sku=sku, marketplace_id=marketplace_id)
    if not offers:
        raise EbayApiError("No eBay Inventory API offer exists for this account, marketplace, and SKU.", status_code=404, operation="get_offers_by_sku")
    if len(offers) > 1:
        raise EbayApiError(
            "Multiple eBay offers exist for this SKU and marketplace; manual reconciliation is required.",
            status_code=409,
            details={"offer_ids": [str(offer.get("offerId") or "").strip() for offer in offers]},
            operation="get_offers_by_sku",
        )
    offer = offers[0]
    offer_id = str(offer.get("offerId") or "").strip()
    if not offer_id:
        raise EbayApiError("eBay offer lookup returned an offer without offerId.", status_code=502, details=offer, operation="get_offers_by_sku")
    return EbayListing.objects.create(
        account=account,
        marketplace_id=marketplace_id,
        listing_mode=EbayListing.ListingMode.INVENTORY,
        sku=sku,
        offer_id=offer_id,
        item_id=str(offer.get("listingId") or "").strip(),
        merchant_location_key=str(offer.get("merchantLocationKey") or "").strip(),
        status=EbayListing.ListingStatus.UNKNOWN,
    )


def _execute_legacy_operation(
    *,
    account: str,
    marketplace_id: str,
    operation: str,
    item_id: str,
    source_ean: str,
    variation_sku: str,
    quantity: int | None,
    price: str | None,
    currency: str,
) -> dict[str, Any]:
    if operation not in _LEGACY_OPERATIONS:
        raise EbayApiError("Legacy listings can only be fetched, updated, unpublished, or relisted.", status_code=400)
    item_id, listing = _resolve_legacy_listing(
        account=account,
        marketplace_id=marketplace_id,
        item_id=item_id,
        source_ean=source_ean,
    )
    variation_sku = variation_sku or _reconciled_variation_sku(listing=listing, source_ean=source_ean)
    client = EbayOAuthClient()
    if operation == "fetch":
        return {
            "account": account,
            "marketplace_id": marketplace_id,
            "listing_mode": EbayListing.ListingMode.LEGACY,
            "operation": operation,
            "item_id": item_id,
            "status": listing.status if listing is not None else EbayListing.ListingStatus.UNKNOWN,
            "listing": client.listing(account=account, item_id=item_id, marketplace_id=marketplace_id),
        }
    if operation == "update":
        current = client.listing(account=account, item_id=item_id, marketplace_id=marketplace_id)
        if current.get("listing_type") != "FixedPriceItem":
            raise EbayApiError("Only fixed-price legacy listings are supported for updates.", status_code=409)
        if current.get("has_variations"):
            variation = _legacy_variation(current=current, variation_sku=variation_sku)
            current_quantity = _available_variation_quantity(variation)
            current_price = str(variation.get("price") or "").strip()
            if not current_price:
                raise EbayApiError("eBay legacy variation does not include its current price.", status_code=502, details=variation, operation="get_item")
            client.revise_legacy_fixed_price_variation(
                account=account,
                item_id=item_id,
                marketplace_id=marketplace_id,
                variation_sku=variation_sku,
                quantity=current_quantity if quantity is None else quantity,
                price=current_price if price is None else price,
                currency=str(variation.get("currency") or currency).strip().upper(),
            )
        else:
            client.revise_legacy_fixed_price_listing(
                account=account,
                item_id=item_id,
                marketplace_id=marketplace_id,
                quantity=quantity,
                price=price,
                currency=currency,
            )
        status = EbayListing.ListingStatus.ACTIVE
        result = {"item_id": item_id}
    elif operation == "unpublish":
        client.end_legacy_fixed_price_listing(account=account, item_id=item_id, marketplace_id=marketplace_id)
        status = EbayListing.ListingStatus.ENDED
        result = {"item_id": item_id}
    else:
        relisted = client.relist_legacy_fixed_price_listing(
            account=account,
            item_id=item_id,
            marketplace_id=marketplace_id,
            quantity=quantity,
            price=price,
            currency=currency,
        )
        item_id = str(relisted.get("item_id") or "").strip()
        if not item_id:
            raise EbayApiError("eBay relist response does not contain a new item ID.", status_code=502, details=relisted, operation="relist_legacy_fixed_price_listing")
        status = EbayListing.ListingStatus.ACTIVE
        result = {"item_id": item_id}
    return _save_listing(
        listing=listing,
        account=account,
        marketplace_id=marketplace_id,
        listing_mode=EbayListing.ListingMode.LEGACY,
        source_ean=source_ean,
        sku="",
        offer_id="",
        item_id=item_id,
        merchant_location_key="",
        status=status,
        operation=operation,
        result=result,
    )


def _legacy_variation(*, current: dict[str, Any], variation_sku: str) -> dict[str, Any]:
    if not variation_sku:
        raise EbayApiError("variation_sku is required to update a legacy variation listing.", status_code=400)
    matches = [
        variation
        for variation in current.get("variations", [])
        if isinstance(variation, dict) and str(variation.get("sku") or "").strip() == variation_sku
    ]
    if not matches:
        raise EbayApiError(
            "No legacy variation matches variation_sku.",
            status_code=404,
            details={"variation_sku": variation_sku},
            operation="get_item",
        )
    if len(matches) > 1:
        raise EbayApiError(
            "Multiple legacy variations match variation_sku.",
            status_code=409,
            details={"variation_sku": variation_sku},
            operation="get_item",
        )
    return matches[0]


def _reconciled_variation_sku(*, listing: EbayListing | None, source_ean: str) -> str:
    if listing is None or not source_ean:
        return ""
    mappings = listing.legacy_ean_to_variation_sku or {}
    return str(mappings.get(source_ean) or "").strip() if isinstance(mappings, dict) else ""


def _available_variation_quantity(variation: dict[str, Any]) -> int:
    try:
        quantity = int(str(variation.get("quantity") or ""))
        quantity_sold = int(str(variation.get("quantity_sold") or "0"))
    except ValueError as error:
        raise EbayApiError("eBay legacy variation returned an invalid quantity.", status_code=502, details=variation, operation="get_item") from error
    return max(quantity - quantity_sold, 0)


def _resolve_legacy_listing(
    *,
    account: str,
    marketplace_id: str,
    item_id: str,
    source_ean: str,
) -> tuple[str, EbayListing | None]:
    if item_id:
        return item_id, EbayListing.objects.filter(account=account, marketplace_id=marketplace_id, item_id=item_id).first()
    if not source_ean:
        raise EbayApiError("item_id or source_ean is required for legacy listings.", status_code=400)
    listings = list(
        EbayListing.objects.filter(
            account=account,
            marketplace_id=marketplace_id,
            listing_mode=EbayListing.ListingMode.LEGACY,
        )
        .filter(Q(source_ean=source_ean) | Q(legacy_ean_to_variation_sku__has_key=source_ean))
        .exclude(item_id="")[:2]
    )
    if not listings:
        raise EbayApiError(
            "No reconciled legacy listing exists for this EAN. Reconcile it before submitting the job.",
            status_code=409,
            details={"source_ean": source_ean},
        )
    if len(listings) > 1:
        raise EbayApiError(
            "Multiple reconciled legacy listings exist for this EAN; provide item_id explicitly.",
            status_code=409,
            details={"source_ean": source_ean, "item_ids": [listing.item_id for listing in listings]},
        )
    return listings[0].item_id, listings[0]


def _save_listing(
    *,
    listing: EbayListing | None,
    account: str,
    marketplace_id: str,
    listing_mode: str,
    source_ean: str,
    sku: str,
    offer_id: str,
    item_id: str,
    merchant_location_key: str,
    status: str,
    operation: str,
    result: dict[str, str],
) -> dict[str, Any]:
    with transaction.atomic():
        if listing is None:
            listing = EbayListing(account=account, marketplace_id=marketplace_id, listing_mode=listing_mode)
        listing.source_ean = source_ean or listing.source_ean
        listing.sku = sku
        listing.offer_id = offer_id
        listing.item_id = item_id
        listing.merchant_location_key = merchant_location_key
        listing.status = status
        listing.last_operation = operation
        listing.last_error = {}
        listing.save()
    return {
        "account": account,
        "marketplace_id": marketplace_id,
        "listing_mode": listing_mode,
        "operation": operation,
        "status": status,
        **result,
    }


def _merge_inventory_item(*, current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = dict(current)
    for key, value in patch.items():
        current_value = merged.get(key)
        if isinstance(current_value, dict) and isinstance(value, dict):
            merged[key] = _merge_inventory_item(current=current_value, patch=value)
        else:
            merged[key] = value
    return merged


def _merge_inventory_offer(*, current: dict[str, Any], patch: dict[str, Any], sku: str, marketplace_id: str) -> dict[str, Any]:
    read_only_fields = {"offerId", "listing", "listingOnHold", "status", "warnings", "errors"}
    merged = _merge_inventory_item(
        current={key: value for key, value in current.items() if key not in read_only_fields},
        patch=patch,
    )
    merged["sku"] = sku
    merged["marketplaceId"] = marketplace_id
    return merged
