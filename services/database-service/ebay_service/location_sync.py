from __future__ import annotations

from typing import Any

from .client import EbayApiError, EbayOAuthClient


def _locations(client: EbayOAuthClient, account: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    while True:
        payload = client.inventory_locations(account=account, offset=len(result))
        page = payload.get("locations") if isinstance(payload, dict) else None
        if not isinstance(page, list) or any(not isinstance(location, dict) for location in page):
            raise EbayApiError("Invalid eBay inventory locations response.", operation="inventory_locations")
        result.extend(page)
        total = payload.get("total")
        if total is not None and (not isinstance(total, int) or total < len(result)):
            raise EbayApiError("Invalid eBay inventory locations count.", operation="inventory_locations")
        if total is not None and len(result) >= total:
            return result
        if total is None and len(page) < 100:
            return result
        if not page:
            raise EbayApiError("eBay inventory locations pagination stopped early.", operation="inventory_locations")


def plan_location_copy(
    client: EbayOAuthClient, *, expected_keys: set[str], excluded_keys: set[str] | None = None,
) -> list[dict[str, Any]]:
    source = _locations(client, "jv")
    source_by_key = {str(location.get("merchantLocationKey") or ""): location for location in source}
    if len(source_by_key) != len(source) or set(source_by_key) != expected_keys:
        raise EbayApiError("JV location keys differ from the approved list.", operation="inventory_locations")
    if excluded_keys and not excluded_keys <= expected_keys:
        raise EbayApiError("Excluded location keys are not in JV.", operation="inventory_locations")

    plan: list[dict[str, Any]] = []
    for account in ("xl", "dep"):
        target = _locations(client, account)
        target_by_key = {str(location.get("merchantLocationKey") or ""): location for location in target}
        if len(target_by_key) != len(target):
            raise EbayApiError("Duplicate target location keys.", operation="inventory_locations")
        for key in sorted(expected_keys):
            if key in (excluded_keys or set()):
                continue
            source_location = source_by_key[key]
            if not source_location.get("name"):
                source_location = {**source_location, **client.inventory_location(account="jv", merchant_location_key=key)}
            source_details = source_location.get("location")
            address = source_details.get("address") if isinstance(source_details, dict) else None
            if not isinstance(address, dict) or not address.get("country") or not (
                address.get("postalCode") or (address.get("city") and address.get("stateOrProvince"))
            ):
                raise EbayApiError(f"JV location {key} has no complete shipping address.", operation="inventory_locations")
            if source_location.get("merchantLocationStatus") != "ENABLED" or source_location.get("locationTypes") not in (None, [], ["WAREHOUSE"]):
                raise EbayApiError(f"JV location {key} is not an enabled warehouse.", operation="inventory_locations")
            existing = target_by_key.get(key)
            if existing is not None:
                existing_details = existing.get("location")
                existing_address = existing_details.get("address") if isinstance(existing_details, dict) else None
                if (
                    existing_address != address
                    or existing.get("merchantLocationStatus") != "ENABLED"
                    or existing.get("locationTypes") not in (None, [], ["WAREHOUSE"])
                ):
                    raise EbayApiError(f"{account.upper()} location {key} conflicts with JV.", operation="inventory_locations")
            plan.append({
                "account": account,
                "key": key,
                "name": str(source_location.get("name") or key).strip(),
                "address": address,
                "action": "skip" if existing is not None else "create",
            })
    return plan
