from __future__ import annotations

import uuid

from ..domain.field_registry import filtered_payload, missing_required_fields, validate_changed_fields
from ..domain.models import ChannelTarget, ErrorContract, JobPriority, JobStatus, Marketplace, Operation, OrchestrateRequest, CanonicalPayload
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


_OTTO_PROFILE_BY_TARGET = {"OTTO_JV": "jv", "OTTO_XL": "xl"}


class ProductEditorOttoFlow:
    def __init__(self, *, gateway: ProductEditorGateway, store: SqliteProductEditorStore, orchestrator_job_store: SqliteJobStore) -> None:
        self.gateway = gateway
        self.store = store
        self.orchestrator_job_store = orchestrator_job_store

    def discover_targets(self, *, ean: str, request_id: str) -> dict[str, dict]:
        results: dict[str, dict] = {}
        for target_id, profile in _OTTO_PROFILE_BY_TARGET.items():
            response = self.gateway.fetch_otto_by_sku(sku=ean, profile=profile, request_id=request_id)
            if 200 <= response.status_code < 300:
                results[target_id] = {"status": ProductEditorTargetStatus.FOUND, "metadata": {"profile": profile}, "warnings": []}
            elif response.status_code == 404:
                results[target_id] = {"status": ProductEditorTargetStatus.MISSING, "metadata": {"profile": profile}, "warnings": []}
            else:
                results[target_id] = {
                    "status": ProductEditorTargetStatus.ERROR,
                    "metadata": {"profile": profile, "status_code": response.status_code},
                    "warnings": [ProductEditorWarning(code="product_editor_otto_discover_error", message="Failed to discover OTTO target status.")],
                }
        return results

    def load(self, *, ean: str, request_id: str, baseline_target_id: str | None) -> ProductEditorLoadResponse:
        target_id = self._resolve_target(ean=ean, request_id=request_id, preferred_target_id=baseline_target_id)
        if target_id is None:
            return ProductEditorLoadResponse(request_id=request_id, ean=ean, active_group=ProductEditorGroupId.OTTO, baseline_target_id=baseline_target_id, supported=False, warnings=[ProductEditorWarning(code="product_editor_otto_target_not_found", message="No OTTO target is available for this SKU.")])
        profile = _OTTO_PROFILE_BY_TARGET[target_id]
        response = self.gateway.fetch_otto_by_sku(sku=ean, profile=profile, request_id=request_id)
        if not (200 <= response.status_code < 300):
            return ProductEditorLoadResponse(request_id=request_id, ean=ean, active_group=ProductEditorGroupId.OTTO, baseline_target_id=target_id, supported=False, warnings=[ProductEditorWarning(code="product_editor_otto_load_failed", message="Failed to load OTTO baseline draft.")])
        return ProductEditorLoadResponse(request_id=request_id, ean=ean, active_group=ProductEditorGroupId.OTTO, baseline_target_id=target_id, draft=_normalize_otto_draft(response.body, target_id, ean), supported=True)

    def plan(self, *, ean: str, request_id: str, changed_fields: list[str], draft: dict, selected_target_ids: list[str]) -> ProductEditorPlanResponse:
        if not changed_fields:
            raise ProductEditorOttoFlowError("product_editor_changed_fields_empty", "At least one changed field is required to generate a plan.", 400)
        unknown = validate_changed_fields(Marketplace.OTTO, changed_fields)
        if unknown:
            raise ProductEditorOttoFlowError("product_editor_changed_fields_invalid", "Plan contains fields not supported by the OTTO adapter.", 400, {"unknown_fields": unknown})
        states = self.discover_targets(ean=ean, request_id=request_id)
        found = [target_id for target_id, state in states.items() if state["status"] is ProductEditorTargetStatus.FOUND]
        target_ids = [target_id for target_id in selected_target_ids if target_id in found] if selected_target_ids else found
        if not target_ids:
            raise ProductEditorOttoFlowError("product_editor_no_otto_targets", "No existing OTTO targets are available for this SKU.", 409)
        payload = _prepare_otto_payload(draft if isinstance(draft, dict) else {})
        missing = missing_required_fields(Marketplace.OTTO, payload)
        if missing:
            raise ProductEditorOttoFlowError("product_editor_otto_required_fields_missing", "OTTO product reference and EAN are required.", 400, {"missing_fields": missing})
        plan_id = str(uuid.uuid4())
        warnings = [ProductEditorWarning(code="product_editor_otto_live_write", message="Apply sends a live OTTO update through the orchestrator.", level=ProductEditorRiskLevel.HIGH)]
        summary = {"supported": True, "selected_target_count": len(target_ids), "changed_fields_count": len(changed_fields)}
        self.store.create_plan(plan_id=plan_id, request_id=request_id, ean=ean, active_group=ProductEditorGroupId.OTTO, selected_target_ids=target_ids, changed_fields=changed_fields, draft=payload, warnings=[warning.model_dump() for warning in warnings], risk_level=ProductEditorRiskLevel.HIGH, summary=summary)
        targets = [target for group in build_product_editor_groups() if group.id is ProductEditorGroupId.OTTO for target in group.targets if target.id in target_ids]
        return ProductEditorPlanResponse(request_id=request_id, plan_id=plan_id, ean=ean, active_group=ProductEditorGroupId.OTTO, targets=targets, changed_fields=changed_fields, warnings=warnings, risk_level=ProductEditorRiskLevel.HIGH, summary=summary)

    def apply(self, *, plan_id: str, request_id: str) -> ProductEditorApplyResponse:
        plan = self.store.get_plan(plan_id=plan_id)
        if plan is None:
            raise ProductEditorOttoFlowError("product_editor_plan_not_found", "Product Editor plan was not found.", 404, {"plan_id": plan_id})
        payload = CanonicalPayload(**filtered_payload(Marketplace.OTTO, plan["draft"]))
        required_upsert_fields = {"productReference", "sku", "ean", "productDescription", "mediaAssets", "delivery"}
        changed_fields = sorted(set(plan["changed_fields"]) | required_upsert_fields)
        channels = []
        for target_id in plan["selected_target_ids"]:
            profile = _OTTO_PROFILE_BY_TARGET[target_id]
            response = self.gateway.fetch_otto_by_sku(sku=plan["ean"], profile=profile, request_id=request_id)
            if not (200 <= response.status_code < 300):
                raise ProductEditorOttoFlowError(
                    "product_editor_otto_current_product_load_failed",
                    "Failed to load the current OTTO product before update.",
                    502,
                    {"target_id": target_id, "status_code": response.status_code},
                )
            current_payload = _prepare_otto_payload(_normalize_otto_draft(response.body, target_id, plan["ean"]))
            updated_payload = _merge_otto_changed_fields(
                current_payload=current_payload,
                draft=plan["draft"],
                changed_fields=plan["changed_fields"],
            )
            channels.append(
                ChannelTarget(
                    marketplace=Marketplace.OTTO,
                    profile=profile,
                    changed_fields=changed_fields,
                    overrides=updated_payload,
                )
            )
        job_id = str(uuid.uuid4())
        self.orchestrator_job_store.create_job(job_id=job_id, request_id=request_id, ean=plan["ean"], command=OrchestrateRequest(operation=Operation.UPDATE, payload=payload, channels=channels), priority=JobPriority.BACKGROUND)
        return ProductEditorApplyResponse(request_id=request_id, job_id=job_id, status=JobStatus.QUEUED, active_group=ProductEditorGroupId.OTTO, accepted=True)

    def get_job(self, *, job_id: str, request_id: str) -> ProductEditorJobResponse:
        details = self.orchestrator_job_store.get_job(job_id=job_id)
        command = self.orchestrator_job_store.get_job_command(job_id=job_id)
        if details is None or command is None or not _is_otto_command(command):
            raise ProductEditorOttoFlowError("product_editor_job_not_found", "OTTO Product Editor job was not found.", 404, {"job_id": job_id})
        targets = []
        if details.result is not None:
            for result in details.result.results:
                targets.append({"target_id": "OTTO_XL" if result.target.endswith("profile=xl") else "OTTO_JV", "status": result.status, "status_code": result.status_code, "data": result.data, "error": result.error.model_dump() if result.error else None})
        failed = sum(1 for target in targets if target["status"] == "failed")
        summary = {"supported": True, "success": len(targets) - failed, "failed": failed}
        status = JobStatus.FAILED if details.status is JobStatus.COMPLETED and failed else details.status
        return ProductEditorJobResponse(request_id=request_id, job_id=job_id, status=status, active_group=ProductEditorGroupId.OTTO, summary=summary, targets=targets, error=details.error)

    def _resolve_target(self, *, ean: str, request_id: str, preferred_target_id: str | None) -> str | None:
        states = self.discover_targets(ean=ean, request_id=request_id)
        found = [target_id for target_id, state in states.items() if state["status"] is ProductEditorTargetStatus.FOUND]
        return preferred_target_id if preferred_target_id in found else (found[0] if found else None)


class ProductEditorOttoFlowError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int, details: dict | None = None) -> None:
        super().__init__(message)
        self.code, self.message, self.status_code, self.details = code, message, status_code, details or {}


def _normalize_otto_media_assets(product: dict) -> list[dict]:
    media_assets = product.get("mediaAssets")
    if isinstance(media_assets, list) and media_assets:
        return [item for item in media_assets if isinstance(item, dict)]

    image_url = str(product.get("imageUrl") or product.get("image_url") or "").strip()
    return [{"type": "IMAGE", "location": image_url}] if image_url else []


def _normalize_otto_draft(body: dict, target_id: str, fallback_ean: str) -> dict:
    variations = body.get("product_variations") if isinstance(body.get("product_variations"), list) else []
    product = variations[0] if variations and isinstance(variations[0], dict) else {}
    product_description = product.get("productDescription") if isinstance(product.get("productDescription"), dict) else {}
    product_description = dict(product_description)
    if "productLine" in product_description:
        product_description["productLine"] = str(product_description.get("productLine") or "").strip()[:70]
    order = product.get("order") if isinstance(product.get("order"), dict) else {}
    max_order_quantity = product.get("maxOrderQuantity", order.get("maxOrderQuantity"))
    if not isinstance(max_order_quantity, int) or isinstance(max_order_quantity, bool):
        max_order_quantity = None

    return {
        "target_id": target_id,
        "profile": _OTTO_PROFILE_BY_TARGET[target_id],
        "productReference": str(product.get("productReference") or fallback_ean),
        "sku": str(product.get("sku") or fallback_ean),
        "ean": str(product.get("ean") or fallback_ean),
        "isbn": str(product.get("isbn") or ""),
        "upc": str(product.get("upc") or ""),
        "pzn": str(product.get("pzn") or ""),
        "mpn": str(product.get("mpn") or ""),
        "moin": str(product.get("moin") or ""),
        "offeringStartDate": str(product.get("offeringStartDate") or ""),
        "releaseDate": str(product.get("releaseDate") or ""),
        "maxOrderQuantity": max_order_quantity,
        "shippingProfileId": str(product.get("shippingProfileId") or ""),
        "productDescription": product_description,
        "mediaAssets": _normalize_otto_media_assets(product.get("mediaAssets"), product.get("imageUrl")),
        "delivery": product.get("delivery") if isinstance(product.get("delivery"), dict) else {},
        "order": order,
        "pricing": product.get("pricing") if isinstance(product.get("pricing"), dict) else {},
        "logistics": product.get("logistics") if isinstance(product.get("logistics"), dict) else {},
        "compliance": product.get("compliance") if isinstance(product.get("compliance"), dict) else {},
    }


def _normalize_otto_media_assets(raw_assets: object, primary_image_url: object) -> list[dict]:
    assets = raw_assets if isinstance(raw_assets, list) else []
    normalized_assets = [dict(asset) for asset in assets if isinstance(asset, dict) and str(asset.get("location") or "").strip()]
    if normalized_assets:
        return normalized_assets

    image_url = str(primary_image_url or "").strip()
    if not image_url:
        return []

    first_asset = next((asset for asset in assets if isinstance(asset, dict)), {})
    return [{"type": str(first_asset.get("type") or "IMAGE"), "location": image_url, "filename": str(first_asset.get("filename") or "")}]


def _prepare_otto_payload(draft: dict) -> dict:
    optional_fields = {"isbn", "upc", "pzn", "mpn", "moin", "offeringStartDate", "releaseDate", "maxOrderQuantity"}
    payload = filtered_payload(Marketplace.OTTO, draft)
    product_description = payload.get("productDescription")
    if isinstance(product_description, dict):
        payload["productDescription"] = {
            key: value
            for key, value in product_description.items()
            if key not in {"categoryId", "category_id"}
        }
    return {key: value for key, value in payload.items() if key not in optional_fields or value not in (None, "")}


def _merge_otto_changed_fields(*, current_payload: dict, draft: dict, changed_fields: list[str]) -> dict:
    merged = dict(current_payload)
    for field_name in changed_fields:
        if field_name in draft:
            merged[field_name] = draft[field_name]
    return _prepare_otto_payload(merged)


def _is_otto_command(command: OrchestrateRequest) -> bool:
    return bool(command.channels) and all(channel.marketplace is Marketplace.OTTO for channel in command.channels)
