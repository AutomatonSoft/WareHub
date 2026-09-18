from __future__ import annotations

import uuid
from typing import Any

from ..domain.field_registry import filtered_payload, validate_changed_fields
from ..domain.models import ChannelTarget, JobPriority, JobStatus, Marketplace, Operation, OrchestrateRequest, CanonicalPayload
from ..domain.product_editor_models import (
    ProductEditorApplyResponse,
    ProductEditorGroupId,
    ProductEditorJobResponse,
    ProductEditorLoadResponse,
    ProductEditorPlanResponse,
    ProductEditorRiskLevel,
    ProductEditorTargetStatus,
    ProductEditorWarning,
)
from ..domain.product_editor_registry import build_product_editor_groups
from ..infra.job_store import SqliteJobStore
from ..infra.product_editor_gateway import ProductEditorGateway
from ..infra.product_editor_store import SqliteProductEditorStore


_EBAY_ACCOUNT_BY_TARGET = {"EBAY_JV": "jv", "EBAY_XL": "xl", "EBAY_DEP": "dep"}


class ProductEditorEbayFlow:
    def __init__(self, *, gateway: ProductEditorGateway, store: SqliteProductEditorStore, orchestrator_job_store: SqliteJobStore) -> None:
        self.gateway = gateway
        self.store = store
        self.orchestrator_job_store = orchestrator_job_store

    def discover_targets(self, *, ean: str, request_id: str) -> dict[str, dict]:
        results: dict[str, dict] = {}
        for target_id, account in _EBAY_ACCOUNT_BY_TARGET.items():
            inventory = self.gateway.fetch_ebay_listing(account=account, listing_mode="inventory", sku=ean, request_id=request_id)
            if 200 <= inventory.status_code < 300:
                results[target_id] = {"status": ProductEditorTargetStatus.FOUND, "metadata": {"account": account, "listing_mode": "inventory"}, "warnings": []}
                continue
            if inventory.status_code != 404:
                results[target_id] = _error_state(account=account, status_code=inventory.status_code)
                continue

            active = self.gateway.fetch_ebay_active_listings(account=account, request_id=request_id)
            if not (200 <= active.status_code < 300):
                results[target_id] = _error_state(account=account, status_code=active.status_code)
                continue
            active_data = active.body.get("active_listings") if isinstance(active.body.get("active_listings"), dict) else {}
            matches = _legacy_ean_matches(listings=active_data.get("listings"), ean=ean)
            if len(matches) == 1:
                listing, variation_sku = matches[0]
                results[target_id] = {
                    "status": ProductEditorTargetStatus.FOUND,
                    "metadata": {
                        "account": account,
                        "listing_mode": "legacy",
                        "item_id": str(listing.get("item_id") or "").strip(),
                        "variation_sku": variation_sku,
                    },
                    "warnings": [],
                }
                continue
            if len(matches) > 1:
                results[target_id] = {
                    "status": ProductEditorTargetStatus.ERROR,
                    "metadata": {"account": account, "item_ids": [str(match[0].get("item_id") or "").strip() for match in matches]},
                    "warnings": [ProductEditorWarning(code="product_editor_ebay_legacy_ambiguous", message="More than one active legacy listing has this EAN; reconcile it with an explicit item ID.")],
                }
                continue
            total_pages = str(active_data.get("total_pages") or "0")
            if total_pages not in {"", "0", "1"}:
                results[target_id] = {
                    "status": ProductEditorTargetStatus.UNKNOWN,
                    "metadata": {"account": account, "total_pages": total_pages},
                    "warnings": [ProductEditorWarning(code="product_editor_ebay_legacy_page_not_scanned", message="The EAN was not on the first legacy listing page; use legacy reconciliation with the required page before updating.")],
                }
                continue
            results[target_id] = {"status": ProductEditorTargetStatus.MISSING, "metadata": {"account": account}, "warnings": []}
        return results

    def load(self, *, ean: str, request_id: str, baseline_target_id: str | None) -> ProductEditorLoadResponse:
        target_id = self._resolve_target(ean=ean, request_id=request_id, preferred_target_id=baseline_target_id)
        if target_id is None:
            return ProductEditorLoadResponse(
                request_id=request_id,
                ean=ean,
                active_group=ProductEditorGroupId.EBAY,
                baseline_target_id=baseline_target_id,
                supported=False,
                warnings=[ProductEditorWarning(code="product_editor_ebay_target_not_found", message="No eBay listing was found for this EAN.")],
            )
        state = self.discover_targets(ean=ean, request_id=request_id)[target_id]
        metadata = state["metadata"]
        account = str(metadata["account"])
        listing_mode = str(metadata["listing_mode"])
        fetch = self.gateway.fetch_ebay_listing(
            account=account,
            listing_mode=listing_mode,
            sku=ean if listing_mode == "inventory" else "",
            item_id=str(metadata.get("item_id") or ""),
            request_id=request_id,
        )
        if not (200 <= fetch.status_code < 300):
            return ProductEditorLoadResponse(
                request_id=request_id,
                ean=ean,
                active_group=ProductEditorGroupId.EBAY,
                baseline_target_id=target_id,
                supported=False,
                warnings=[ProductEditorWarning(code="product_editor_ebay_load_failed", message="eBay listing could not be loaded.")],
            )
        return ProductEditorLoadResponse(
            request_id=request_id,
            ean=ean,
            active_group=ProductEditorGroupId.EBAY,
            baseline_target_id=target_id,
            draft=_normalize_ebay_draft(body=fetch.body, target_id=target_id, ean=ean, metadata=metadata),
            supported=True,
        )

    def plan(self, *, ean: str, request_id: str, changed_fields: list[str], draft: dict, selected_target_ids: list[str]) -> ProductEditorPlanResponse:
        if not changed_fields:
            raise ProductEditorEbayFlowError("product_editor_changed_fields_empty", "At least one changed field is required to generate a plan.", 400)
        unknown = validate_changed_fields(Marketplace.EBAY, changed_fields)
        if unknown:
            raise ProductEditorEbayFlowError("product_editor_changed_fields_invalid", "Plan contains fields not supported by the eBay adapter.", 400, {"unknown_fields": unknown})
        states = self.discover_targets(ean=ean, request_id=request_id)
        found = [target_id for target_id, state in states.items() if state["status"] is ProductEditorTargetStatus.FOUND]
        target_ids = [target_id for target_id in selected_target_ids if target_id in found] if selected_target_ids else found
        if not target_ids:
            raise ProductEditorEbayFlowError("product_editor_no_ebay_targets", "No reachable eBay listing is available for this EAN.", 409)
        payload = _normalize_ebay_plan_payload(draft=draft, ean=ean, changed_fields=changed_fields)
        plan_id = str(uuid.uuid4())
        warnings = [ProductEditorWarning(code="product_editor_ebay_live_update", message="Apply queues a live eBay update through the orchestrator.", level=ProductEditorRiskLevel.HIGH)]
        summary = {"supported": True, "selected_target_count": len(target_ids), "changed_fields_count": len(changed_fields), "operation": "update"}
        self.store.create_plan(
            plan_id=plan_id,
            request_id=request_id,
            ean=ean,
            active_group=ProductEditorGroupId.EBAY,
            selected_target_ids=target_ids,
            changed_fields=changed_fields,
            draft=payload,
            warnings=[warning.model_dump() for warning in warnings],
            risk_level=ProductEditorRiskLevel.HIGH,
            summary=summary,
        )
        targets = [target for group in build_product_editor_groups() if group.id is ProductEditorGroupId.EBAY for target in group.targets if target.id in target_ids]
        return ProductEditorPlanResponse(request_id=request_id, plan_id=plan_id, ean=ean, active_group=ProductEditorGroupId.EBAY, targets=targets, changed_fields=changed_fields, warnings=warnings, risk_level=ProductEditorRiskLevel.HIGH, summary=summary)

    def apply(self, *, plan_id: str, request_id: str) -> ProductEditorApplyResponse:
        plan = self.store.get_plan(plan_id=plan_id)
        if plan is None:
            raise ProductEditorEbayFlowError("product_editor_plan_not_found", "Product Editor plan was not found.", 404, {"plan_id": plan_id})
        job_id = str(uuid.uuid4())
        self.orchestrator_job_store.create_job(job_id=job_id, request_id=request_id, ean=plan["ean"], command=_build_ebay_orchestrate_request(plan=plan), priority=JobPriority.BACKGROUND)
        return ProductEditorApplyResponse(request_id=request_id, job_id=job_id, status=JobStatus.QUEUED, active_group=ProductEditorGroupId.EBAY, accepted=True)

    def get_job(self, *, job_id: str, request_id: str) -> ProductEditorJobResponse:
        details = self.orchestrator_job_store.get_job(job_id=job_id)
        command = self.orchestrator_job_store.get_job_command(job_id=job_id)
        if details is None or command is None or not _is_ebay_product_editor_command(command):
            raise ProductEditorEbayFlowError("product_editor_job_not_found", "eBay Product Editor job was not found.", 404, {"job_id": job_id})
        results = details.result.results if details.result is not None else []
        success = sum(1 for result in results if result.status == "success")
        failed = sum(1 for result in results if result.status != "success")
        if details.status is JobStatus.FAILED and not results:
            failed = 1
        return ProductEditorJobResponse(
            request_id=request_id,
            job_id=job_id,
            ean=details.ean,
            status=details.status,
            active_group=ProductEditorGroupId.EBAY,
            summary={"supported": True, "success": success, "failed": failed},
            targets=[
                {
                    "target_id": command.channels[index].account if index < len(command.channels) else "",
                    "status": result.status,
                    "status_code": result.status_code,
                    "data": result.data,
                }
                for index, result in enumerate(results)
            ],
            error=details.error or next((result.error for result in results if result.error is not None), None),
            created_at_unix_ms=details.created_at_unix_ms,
            updated_at_unix_ms=details.updated_at_unix_ms,
        )

    def _resolve_target(self, *, ean: str, request_id: str, preferred_target_id: str | None) -> str | None:
        states = self.discover_targets(ean=ean, request_id=request_id)
        found = [target_id for target_id, state in states.items() if state["status"] is ProductEditorTargetStatus.FOUND]
        return preferred_target_id if preferred_target_id in found else (found[0] if found else None)


class ProductEditorEbayFlowError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int, details: dict | None = None) -> None:
        super().__init__(message)
        self.code, self.message, self.status_code, self.details = code, message, status_code, details or {}


def _error_state(*, account: str, status_code: int) -> dict:
    return {"status": ProductEditorTargetStatus.ERROR, "metadata": {"account": account, "status_code": status_code}, "warnings": [ProductEditorWarning(code="product_editor_ebay_discover_error", message="eBay discovery request failed.")]}


def _normalize_ebay_draft(*, body: dict, target_id: str, ean: str, metadata: dict) -> dict:
    listing_mode = str(metadata.get("listing_mode") or "inventory")
    if listing_mode == "legacy":
        listing = body.get("listing") if isinstance(body.get("listing"), dict) else {}
        variation = _legacy_variation(listing=listing, variation_sku=str(metadata.get("variation_sku") or ""))
        current = variation or listing
        return {
            "target_id": target_id, "ebay_listing_mode": "legacy", "ebay_item_id": str(listing.get("item_id") or metadata.get("item_id") or ""),
            "ebay_variation_sku": str(metadata.get("variation_sku") or ""),
            "price": str(current.get("price") or ""),
            "quantity": _legacy_available_quantity(current) if variation is not None else _as_int(listing.get("quantity_available")),
            "ebay_currency": str(current.get("currency") or "EUR"),
        }
    item = body.get("inventory_item") if isinstance(body.get("inventory_item"), dict) else {}
    offers = body.get("offers") if isinstance(body.get("offers"), list) else []
    offer = offers[0] if offers and isinstance(offers[0], dict) else {}
    price = offer.get("pricingSummary", {}).get("price") if isinstance(offer.get("pricingSummary"), dict) else offer.get("price")
    quantity = item.get("availability", {}).get("shipToLocationAvailability", {}).get("quantity") if isinstance(item.get("availability"), dict) else None
    return {
        "target_id": target_id, "ebay_listing_mode": "inventory", "sku": ean, "ebay_inventory_item": item, "ebay_offer": offer,
        "price": str(price.get("value") or "") if isinstance(price, dict) else "", "quantity": _as_int(quantity),
        "ebay_currency": str(price.get("currency") or "EUR") if isinstance(price, dict) else "EUR",
    }


def _normalize_ebay_plan_payload(*, draft: dict, ean: str, changed_fields: list[str]) -> dict:
    payload = dict(draft) if isinstance(draft, dict) else {}
    payload.pop("target_id", None)
    payload["sku"] = str(payload.get("sku") or ean).strip()
    payload["ebay_listing_mode"] = str(payload.get("ebay_listing_mode") or "inventory").strip().lower()
    if payload["ebay_listing_mode"] not in {"inventory", "legacy"}:
        raise ProductEditorEbayFlowError("product_editor_ebay_listing_mode_invalid", "eBay listing mode must be inventory or legacy.", 400)
    identity_fields = {"sku", "ebay_listing_mode", "ebay_item_id", "ebay_variation_sku", "ebay_currency"}
    return {key: value for key, value in payload.items() if key in identity_fields or key in changed_fields}


def _build_ebay_orchestrate_request(*, plan: dict) -> OrchestrateRequest:
    draft = plan["draft"] if isinstance(plan.get("draft"), dict) else {}
    target_ids = [str(target_id).strip().upper() for target_id in plan.get("selected_target_ids") or []]
    accounts = [_EBAY_ACCOUNT_BY_TARGET.get(target_id) for target_id in target_ids]
    if not accounts or any(account is None for account in accounts):
        raise ProductEditorEbayFlowError("product_editor_ebay_target_invalid", "Selected eBay target is invalid.", 400, {"target_ids": target_ids})
    payload = CanonicalPayload(**filtered_payload(Marketplace.EBAY, draft))
    return OrchestrateRequest(
        operation=Operation.UPDATE,
        payload=payload,
        channels=[ChannelTarget(marketplace=Marketplace.EBAY, account=account, site="EBAY_DE", changed_fields=list(plan.get("changed_fields") or [])) for account in accounts],
    )


def _is_ebay_product_editor_command(command: OrchestrateRequest) -> bool:
    return bool(command.channels) and all(channel.marketplace is Marketplace.EBAY for channel in command.channels)


def _as_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None and value != "" else None
    except (TypeError, ValueError):
        return None


def _legacy_ean_matches(*, listings: object, ean: str) -> list[tuple[dict, str]]:
    matches: list[tuple[dict, str]] = []
    for listing in listings if isinstance(listings, list) else []:
        if not isinstance(listing, dict):
            continue
        if ean in (listing.get("identifiers") or {}).get("EAN", []):
            matches.append((listing, ""))
            continue
        for variation in listing.get("variations", []):
            if not isinstance(variation, dict) or ean not in (variation.get("identifiers") or {}).get("EAN", []):
                continue
            variation_sku = str(variation.get("sku") or "").strip()
            if variation_sku:
                matches.append((listing, variation_sku))
    return matches


def _legacy_variation(*, listing: dict, variation_sku: str) -> dict | None:
    if not variation_sku:
        return None
    matches = [
        variation
        for variation in listing.get("variations", [])
        if isinstance(variation, dict) and str(variation.get("sku") or "").strip() == variation_sku
    ]
    return matches[0] if len(matches) == 1 else None


def _legacy_available_quantity(variation: dict) -> int | None:
    quantity = _as_int(variation.get("quantity"))
    quantity_sold = _as_int(variation.get("quantity_sold"))
    if quantity is None:
        return None
    return max(quantity - (quantity_sold or 0), 0)
