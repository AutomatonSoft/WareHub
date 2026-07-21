from __future__ import annotations

import uuid

from ..domain.field_registry import filtered_payload, missing_required_fields, validate_changed_fields
from ..domain.models import ErrorContract, JobStatus, Marketplace
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
from ..infra.product_editor_gateway import ProductEditorGateway
from ..infra.product_editor_store import SqliteProductEditorStore


_KAUFLAND_CONTROLLER_BY_TARGET = {"KAUFLAND_JV": "jv", "KAUFLAND_XL": "xl"}


class ProductEditorKauflandFlow:
    def __init__(self, *, gateway: ProductEditorGateway, store: SqliteProductEditorStore) -> None:
        self.gateway = gateway
        self.store = store

    def discover_targets(self, *, ean: str, request_id: str) -> dict[str, dict]:
        results: dict[str, dict] = {}
        for target_id, controller in _KAUFLAND_CONTROLLER_BY_TARGET.items():
            fetch = self.gateway.fetch_kaufland_by_ean(ean=ean, controller=controller, request_id=request_id)
            if 200 <= fetch.status_code < 300:
                results[target_id] = {
                    "status": ProductEditorTargetStatus.FOUND,
                    "metadata": {"controller": controller},
                    "warnings": [],
                }
                continue
            if fetch.status_code == 404:
                results[target_id] = {
                    "status": ProductEditorTargetStatus.MISSING,
                    "metadata": {"controller": controller},
                    "warnings": [],
                }
                continue
            results[target_id] = {
                "status": ProductEditorTargetStatus.ERROR,
                "metadata": {"controller": controller, "status_code": fetch.status_code},
                "warnings": [
                    ProductEditorWarning(
                        code="product_editor_kaufland_discover_error",
                        message="Failed to discover Kaufland target status.",
                    )
                ],
            }
        return results

    def load(self, *, ean: str, request_id: str, baseline_target_id: str | None) -> ProductEditorLoadResponse:
        target_id = self._resolve_baseline_target_id(ean=ean, request_id=request_id, preferred_target_id=baseline_target_id)
        if target_id is None:
            return ProductEditorLoadResponse(
                request_id=request_id,
                ean=ean,
                active_group=ProductEditorGroupId.KAUFLAND,
                baseline_target_id=baseline_target_id,
                supported=False,
                warnings=[ProductEditorWarning(code="product_editor_kaufland_target_not_found", message="No Kaufland target is available for this EAN.")],
            )
        controller = _KAUFLAND_CONTROLLER_BY_TARGET[target_id]
        fetch = self.gateway.fetch_kaufland_by_ean(ean=ean, controller=controller, request_id=request_id)
        if fetch.status_code == 404:
            return ProductEditorLoadResponse(
                request_id=request_id,
                ean=ean,
                active_group=ProductEditorGroupId.KAUFLAND,
                baseline_target_id=target_id,
                draft=_empty_kaufland_draft(target_id=target_id, ean=ean),
                supported=True,
                warnings=[ProductEditorWarning(code="product_editor_kaufland_create_mode", message="Kaufland product was not found for this target. Apply will create it after confirmation.")],
            )
        if not (200 <= fetch.status_code < 300):
            return ProductEditorLoadResponse(
                request_id=request_id,
                ean=ean,
                active_group=ProductEditorGroupId.KAUFLAND,
                baseline_target_id=target_id,
                supported=False,
                warnings=[ProductEditorWarning(code="product_editor_kaufland_load_failed", message="Failed to load Kaufland baseline draft.")],
            )
        return ProductEditorLoadResponse(
            request_id=request_id,
            ean=ean,
            active_group=ProductEditorGroupId.KAUFLAND,
            baseline_target_id=target_id,
            draft=_normalize_kaufland_draft(fetch.body, target_id, ean),
            supported=True,
            warnings=[],
        )

    def plan(self, *, ean: str, request_id: str, changed_fields: list[str], draft: dict, selected_target_ids: list[str]) -> ProductEditorPlanResponse:
        if not changed_fields:
            raise ProductEditorKauflandFlowError("product_editor_changed_fields_empty", "At least one changed field is required to generate a plan.", 400)
        unknown = validate_changed_fields(Marketplace.KAUFLAND, changed_fields)
        if unknown:
            raise ProductEditorKauflandFlowError("product_editor_changed_fields_invalid", "Plan contains fields not supported by the Kaufland adapter.", 400, {"unknown_fields": unknown})

        states = self.discover_targets(ean=ean, request_id=request_id)
        supported_target_ids = [target_id for target_id, state in states.items() if state["status"] in {ProductEditorTargetStatus.FOUND, ProductEditorTargetStatus.MISSING}]
        target_ids = [target_id for target_id in selected_target_ids if target_id in supported_target_ids] if selected_target_ids else supported_target_ids
        if not target_ids:
            raise ProductEditorKauflandFlowError("product_editor_no_kaufland_targets", "No reachable Kaufland targets are available for this EAN.", 409)

        payload = _normalize_kaufland_plan_payload(draft if isinstance(draft, dict) else {})
        missing = missing_required_fields(Marketplace.KAUFLAND, payload)
        if missing:
            raise ProductEditorKauflandFlowError("product_editor_kaufland_required_fields_missing", "Kaufland title, price, and storefront are required.", 400, {"missing_fields": missing})

        operations = {target_id: "update" if states[target_id]["status"] is ProductEditorTargetStatus.FOUND else "create" for target_id in target_ids}
        plan_id = str(uuid.uuid4())
        warnings = [
            ProductEditorWarning(
                code="product_editor_kaufland_live_write",
                message="Apply performs a live Kaufland update for found targets and creates a product only for missing targets.",
                level=ProductEditorRiskLevel.HIGH,
            )
        ]
        summary = {"supported": True, "selected_target_count": len(target_ids), "changed_fields_count": len(changed_fields), "operations": operations}
        self.store.create_plan(
            plan_id=plan_id, request_id=request_id, ean=ean, active_group=ProductEditorGroupId.KAUFLAND,
            selected_target_ids=target_ids, changed_fields=changed_fields, draft=payload,
            warnings=[warning.model_dump() for warning in warnings], risk_level=ProductEditorRiskLevel.HIGH, summary=summary,
        )
        targets = [target for group in build_product_editor_groups() if group.id is ProductEditorGroupId.KAUFLAND for target in group.targets if target.id in target_ids]
        return ProductEditorPlanResponse(request_id=request_id, plan_id=plan_id, ean=ean, active_group=ProductEditorGroupId.KAUFLAND, targets=targets, changed_fields=changed_fields, warnings=warnings, risk_level=ProductEditorRiskLevel.HIGH, summary=summary)

    def apply(self, *, plan_id: str, request_id: str) -> ProductEditorApplyResponse:
        plan = self.store.get_plan(plan_id=plan_id)
        if plan is None:
            raise ProductEditorKauflandFlowError("product_editor_plan_not_found", "Product Editor plan was not found.", 404, {"plan_id": plan_id})
        job_id = str(uuid.uuid4())
        self.store.create_job(job_id=job_id, request_id=request_id, plan_id=plan_id, ean=plan["ean"], active_group=ProductEditorGroupId.KAUFLAND)
        self.store.mark_running(job_id=job_id)
        targets: list[dict] = []
        operations = plan["summary"].get("operations", {}) if isinstance(plan["summary"], dict) else {}
        try:
            for target_id in plan["selected_target_ids"]:
                controller = _KAUFLAND_CONTROLLER_BY_TARGET[target_id]
                operation = operations.get(target_id, "update")
                payload = dict(plan["draft"])
                if operation == "update":
                    payload["changed_fields"] = plan["changed_fields"]
                    result = self.gateway.change_kaufland_by_ean(ean=plan["ean"], controller=controller, request_id=request_id, payload=payload)
                else:
                    result = self.gateway.create_kaufland_by_ean(ean=plan["ean"], controller=controller, request_id=request_id, payload=payload)
                targets.append(_target_result(target_id=target_id, operation=operation, result=result, request_id=request_id))
        except Exception as exc:  # noqa: BLE001
            error = ErrorContract(code="product_editor_kaufland_apply_failed", message="Kaufland apply failed before downstream completion.", request_id=request_id, details={"plan_id": plan_id, "reason": str(exc)})
            self.store.mark_failed(job_id=job_id, summary={"supported": True, "success": 0, "failed": len(targets) or 1}, targets=targets, error=error)
            return ProductEditorApplyResponse(request_id=request_id, job_id=job_id, status=JobStatus.FAILED, active_group=ProductEditorGroupId.KAUFLAND, accepted=False)
        success = sum(1 for target in targets if target["status"] == "success")
        failed = len(targets) - success
        summary = {"supported": True, "success": success, "failed": failed, "final_status": "success" if failed == 0 else ("partial_success" if success else "failed")}
        if failed == 0:
            self.store.mark_completed(job_id=job_id, summary=summary, targets=targets)
            return ProductEditorApplyResponse(request_id=request_id, job_id=job_id, status=JobStatus.COMPLETED, active_group=ProductEditorGroupId.KAUFLAND, accepted=True)
        error = ErrorContract(code="product_editor_kaufland_apply_partial_failure", message="One or more Kaufland targets failed during apply.", request_id=request_id, details={"job_id": job_id, "failed_targets": failed})
        self.store.mark_failed(job_id=job_id, summary=summary, targets=targets, error=error)
        return ProductEditorApplyResponse(request_id=request_id, job_id=job_id, status=JobStatus.FAILED, active_group=ProductEditorGroupId.KAUFLAND, accepted=False)

    def get_job(self, *, job_id: str, request_id: str) -> ProductEditorJobResponse:
        job = self.store.get_job(job_id=job_id)
        if job is None or job["active_group"] is not ProductEditorGroupId.KAUFLAND:
            raise ProductEditorKauflandFlowError("product_editor_job_not_found", "Kaufland Product Editor job was not found.", 404, {"job_id": job_id})
        return ProductEditorJobResponse(request_id=request_id, job_id=job_id, status=job["status"], active_group=job["active_group"], summary=job["summary"], targets=job["targets"], error=job["error"])

    def _resolve_baseline_target_id(self, *, ean: str, request_id: str, preferred_target_id: str | None) -> str | None:
        states = self.discover_targets(ean=ean, request_id=request_id)
        available = [target_id for target_id, state in states.items() if state["status"] in {ProductEditorTargetStatus.FOUND, ProductEditorTargetStatus.MISSING}]
        if preferred_target_id in available:
            return preferred_target_id
        return available[0] if available else None


class ProductEditorKauflandFlowError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int, details: dict | None = None) -> None:
        super().__init__(message)
        self.code, self.message, self.status_code, self.details = code, message, status_code, details or {}


def _normalize_kaufland_draft(body: dict, target_id: str, fallback_ean: str) -> dict:
    data = body.get("response_data") if isinstance(body.get("response_data"), dict) else body
    data = data if isinstance(data, dict) else {}
    text = lambda key: _first_text(data.get(key))
    rows = lambda key: data.get(key) if isinstance(data.get(key), list) else []
    return {
        "target_id": target_id, "ean": text("ean") or fallback_ean, "controller": _KAUFLAND_CONTROLLER_BY_TARGET[target_id],
        "category": rows("category"), "title": text("title"), "mpn": text("mpn"), "short_description": rows("short_description"),
        "description": text("description"), "picture": rows("picture"), "manufacturer": text("manufacturer"),
        "product_dimensions": text("product_dimensions"), "colour": text("colour"), "length": text("length"), "width": text("width"),
        "height": text("height"), "material": text("material"), "storefront": text("storefront") or "de",
        "product_safety_contact": rows("product_safety_contact"), "category_detail": rows("category_detail"),
        "material_composition": text("material_composition"), "abnehmbarer_bezug": text("abnehmbarer_bezug"),
        "parts_of_animal_origin": text("parts_of_animal_origin"), "price": text("price"), "unit_id": text("unit_id"),
        "picture_urls": rows("picture_urls"), "size": text("size"), "color": text("color"), "delivery": text("delivery"),
    }


def _empty_kaufland_draft(*, target_id: str, ean: str) -> dict:
    return {
        "target_id": target_id, "ean": ean, "controller": _KAUFLAND_CONTROLLER_BY_TARGET[target_id],
        "category": [], "title": "", "mpn": "", "short_description": [], "description": "", "picture": [],
        "manufacturer": "", "product_dimensions": "", "colour": "", "length": "", "width": "", "height": "",
        "material": "", "storefront": "de", "product_safety_contact": [], "category_detail": [],
        "material_composition": "", "abnehmbarer_bezug": "", "parts_of_animal_origin": "", "price": "", "unit_id": "",
        "picture_urls": [], "size": "", "color": "", "delivery": "",
    }


def _normalize_kaufland_plan_payload(draft: dict) -> dict:
    payload = filtered_payload(Marketplace.KAUFLAND, draft)
    for field in ("unit_id", "delivery"):
        if field not in payload:
            continue
        raw_value = payload[field]
        if raw_value is None or (isinstance(raw_value, str) and not raw_value.strip()):
            payload.pop(field)
            continue
        if isinstance(raw_value, bool):
            raise ProductEditorKauflandFlowError(
                f"product_editor_kaufland_{field}_invalid",
                f"Kaufland {field} must be an integer.",
                400,
                {field: raw_value},
            )
        try:
            payload[field] = int(raw_value)
        except (TypeError, ValueError) as exc:
            raise ProductEditorKauflandFlowError(
                f"product_editor_kaufland_{field}_invalid",
                f"Kaufland {field} must be an integer.",
                400,
                {field: raw_value},
            ) from exc
    return payload


def _first_text(value) -> str:
    if isinstance(value, list):
        value = value[0] if value else ""
    return "" if value is None else str(value).strip()


def _target_result(*, target_id: str, operation: str, result, request_id: str) -> dict:
    if 200 <= result.status_code < 300:
        return {"target_id": target_id, "status": "success", "status_code": result.status_code, "data": {"operation": operation, **result.body}}
    return {"target_id": target_id, "status": "failed", "status_code": result.status_code, "error": ErrorContract(code=str(result.body.get("code") or "product_editor_kaufland_write_failed"), message="Kaufland downstream write failed.", request_id=request_id, details={"operation": operation, "upstream_status_code": result.status_code, "upstream_response": result.body}).model_dump()}
