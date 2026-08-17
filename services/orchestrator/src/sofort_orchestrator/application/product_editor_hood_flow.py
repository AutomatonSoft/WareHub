from __future__ import annotations

import uuid

from ..domain.field_registry import filtered_payload, validate_changed_fields
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


_HOOD_ACCOUNT_BY_TARGET = {"HOOD_JV": "jv", "HOOD_XL": "xl"}


class ProductEditorHoodFlow:
    def __init__(self, *, gateway: ProductEditorGateway, store: SqliteProductEditorStore) -> None:
        self.gateway = gateway
        self.store = store

    def discover_targets(self, *, ean: str, request_id: str) -> dict[str, dict]:
        results: dict[str, dict] = {}
        for target_id, account in _HOOD_ACCOUNT_BY_TARGET.items():
            fetch = self.gateway.fetch_hood_by_ean(ean=ean, account=account, request_id=request_id)
            if _is_hood_found(fetch.body):
                results[target_id] = {
                    "status": ProductEditorTargetStatus.FOUND,
                    "metadata": {"account": account, "items_count": len(fetch.body.get("items") or [])},
                    "warnings": [],
                }
                continue
            if _is_hood_missing(fetch.status_code, fetch.body):
                results[target_id] = {
                    "status": ProductEditorTargetStatus.MISSING,
                    "metadata": {"account": account},
                    "warnings": [],
                }
                continue
            results[target_id] = {
                "status": ProductEditorTargetStatus.ERROR,
                "metadata": {"account": account, "status_code": fetch.status_code},
                "warnings": [ProductEditorWarning(code="product_editor_hood_discover_error", message="Failed to discover HOOD target status.")],
            }
        return results

    def load(self, *, ean: str, request_id: str, baseline_target_id: str | None) -> ProductEditorLoadResponse:
        hood_target_id = self._resolve_target_id(ean=ean, request_id=request_id, preferred_target_id=baseline_target_id)
        if hood_target_id is None:
            return ProductEditorLoadResponse(
                request_id=request_id,
                ean=ean,
                active_group=ProductEditorGroupId.HOOD,
                baseline_target_id=baseline_target_id,
                supported=False,
                warnings=[ProductEditorWarning(code="product_editor_hood_target_not_found", message="No Hood target was found for this EAN.")],
            )

        fetch = self.gateway.fetch_hood_by_ean(ean=ean, account=_HOOD_ACCOUNT_BY_TARGET[hood_target_id], request_id=request_id)
        if not _is_hood_found(fetch.body):
            return ProductEditorLoadResponse(
                request_id=request_id,
                ean=ean,
                active_group=ProductEditorGroupId.HOOD,
                baseline_target_id=hood_target_id,
                supported=False,
                warnings=[ProductEditorWarning(code="product_editor_hood_target_not_found", message="Requested Hood target is not available.")],
            )

        return ProductEditorLoadResponse(
            request_id=request_id,
            ean=ean,
            active_group=ProductEditorGroupId.HOOD,
            baseline_target_id=hood_target_id,
            draft=_normalize_hood_draft(fetch.body, hood_target_id),
            supported=True,
            warnings=[],
        )

    def plan(
        self,
        *,
        ean: str,
        request_id: str,
        changed_fields: list[str],
        draft: dict,
        selected_target_ids: list[str],
    ) -> ProductEditorPlanResponse:
        if not changed_fields:
            raise ProductEditorHoodFlowError("product_editor_changed_fields_empty", "At least one changed field is required to generate a plan.", 400)

        unknown = validate_changed_fields(Marketplace.HOOD, changed_fields)
        if unknown:
            raise ProductEditorHoodFlowError(
                "product_editor_changed_fields_invalid",
                "Plan contains field names that are not supported by the HOOD adapter.",
                400,
                details={"unknown_fields": unknown},
            )

        found_target_ids = self._found_target_ids(ean=ean, request_id=request_id)
        target_ids = [target_id for target_id in selected_target_ids if target_id in found_target_ids] if selected_target_ids else found_target_ids
        if not target_ids:
            raise ProductEditorHoodFlowError("product_editor_no_found_targets", "No found HOOD targets are available for this EAN.", 409)

        payload = _build_hood_patch_payload(draft=draft, changed_fields=changed_fields)
        if not payload:
            raise ProductEditorHoodFlowError("product_editor_patch_payload_empty", "No mutable HOOD fields remained after filtering changed fields.", 400)

        warnings = _plan_warnings_for_hood(changed_fields=changed_fields, draft=draft)
        risk_level = _plan_risk_level(changed_fields=changed_fields, draft=draft)
        plan_id = str(uuid.uuid4())
        summary = {
            "supported": True,
            "selected_target_count": len(target_ids),
            "changed_fields_count": len(changed_fields),
            "target_policy": "all_found_in_active_group",
        }
        self.store.create_plan(
            plan_id=plan_id,
            request_id=request_id,
            ean=ean,
            active_group=ProductEditorGroupId.HOOD,
            selected_target_ids=target_ids,
            changed_fields=changed_fields,
            draft=draft,
            warnings=[warning.model_dump() for warning in warnings],
            risk_level=risk_level,
            summary=summary,
        )
        targets = [
            target
            for group in build_product_editor_groups()
            if group.id is ProductEditorGroupId.HOOD
            for target in group.targets
            if target.id in target_ids
        ]
        return ProductEditorPlanResponse(
            request_id=request_id,
            plan_id=plan_id,
            ean=ean,
            active_group=ProductEditorGroupId.HOOD,
            targets=targets,
            changed_fields=changed_fields,
            warnings=warnings,
            risk_level=risk_level,
            summary=summary,
        )

    def apply(self, *, plan_id: str, request_id: str) -> ProductEditorApplyResponse:
        plan = self.store.get_plan(plan_id=plan_id)
        if plan is None:
            raise ProductEditorHoodFlowError("product_editor_plan_not_found", "Product Editor plan was not found.", 404, details={"plan_id": plan_id})

        draft = plan["draft"]
        pending_uploads = draft.get("pending_uploads") if isinstance(draft, dict) else None
        if isinstance(pending_uploads, list) and pending_uploads:
            raise ProductEditorHoodFlowError(
                "product_editor_pending_uploads_not_supported",
                "Pending file uploads are not supported yet in Product Editor apply.",
                409,
                details={"plan_id": plan_id, "pending_upload_count": len(pending_uploads)},
            )

        job_id = str(uuid.uuid4())
        self.store.create_job(
            job_id=job_id,
            request_id=request_id,
            plan_id=plan_id,
            ean=plan["ean"],
            active_group=plan["active_group"],
        )
        return ProductEditorApplyResponse(
            request_id=request_id,
            job_id=job_id,
            status=JobStatus.QUEUED,
            active_group=ProductEditorGroupId.HOOD,
            accepted=True,
        )

    def execute_job(self, *, job_id: str) -> None:
        job = self.store.get_job(job_id=job_id)
        if job is None:
            raise ProductEditorHoodFlowError("product_editor_job_not_found", "Product Editor job was not found.", 404, details={"job_id": job_id})
        plan = self.store.get_plan(plan_id=job["plan_id"])
        if plan is None:
            raise ProductEditorHoodFlowError("product_editor_plan_not_found", "Product Editor plan was not found.", 404, details={"plan_id": job["plan_id"]})
        request_id = job["request_id"]

        targets: list[dict] = []
        try:
            for target_id in plan["selected_target_ids"]:
                current_fetch = self.gateway.fetch_hood_by_ean(
                    ean=plan["ean"],
                    account=_HOOD_ACCOUNT_BY_TARGET[target_id],
                    request_id=request_id,
                )
                current_draft = (
                    _normalize_hood_draft(current_fetch.body, target_id)
                    if _is_hood_found(current_fetch.body)
                    else {}
                )
                merged_draft = {**current_draft, **plan["draft"]}
                payload = _build_hood_patch_payload(draft=merged_draft, changed_fields=plan["changed_fields"])
                patch_result = self.gateway.patch_hood_by_ean(
                    ean=plan["ean"],
                    account=_HOOD_ACCOUNT_BY_TARGET[target_id],
                    request_id=request_id,
                    payload=payload,
                )
                targets.append(_build_target_result(target_id=target_id, patch_result=patch_result, request_id=request_id))
        except Exception as exc:  # noqa: BLE001
            error = ErrorContract(
                code="product_editor_apply_failed",
                message="Product Editor apply failed before downstream completion.",
                request_id=request_id,
                details={"plan_id": plan["plan_id"], "reason": str(exc)},
            )
            summary = {"supported": True, "success": 0, "failed": len(targets) or 1}
            self.store.mark_failed(job_id=job_id, summary=summary, targets=targets, error=error)
            return

        success_count = sum(1 for target in targets if target["status"] == "success")
        failed_count = len(targets) - success_count
        summary = {
            "supported": True,
            "success": success_count,
            "failed": failed_count,
            "final_status": "success" if failed_count == 0 else ("partial_success" if success_count else "failed"),
        }
        if failed_count == 0:
            self.store.mark_completed(job_id=job_id, summary=summary, targets=targets)
            return

        error = ErrorContract(
            code="product_editor_apply_partial_failure",
            message="One or more HOOD targets failed during Product Editor apply.",
            request_id=request_id,
            details={"job_id": job_id, "failed_targets": failed_count},
        )
        self.store.mark_failed(job_id=job_id, summary=summary, targets=targets, error=error)

    def get_job(self, *, job_id: str, request_id: str) -> ProductEditorJobResponse:
        job = self.store.get_job(job_id=job_id)
        if job is None:
            raise ProductEditorHoodFlowError("product_editor_job_not_found", "Product Editor job was not found.", 404, details={"job_id": job_id})
        return ProductEditorJobResponse(
            request_id=request_id,
            job_id=job_id,
            ean=job["ean"],
            status=job["status"],
            active_group=job["active_group"],
            summary=job["summary"],
            targets=job["targets"],
            error=job["error"],
            created_at_unix_ms=job["created_at_unix_ms"],
            updated_at_unix_ms=job["updated_at_unix_ms"],
        )

    def _resolve_target_id(self, *, ean: str, request_id: str, preferred_target_id: str | None) -> str | None:
        found_target_ids = self._found_target_ids(ean=ean, request_id=request_id)
        if preferred_target_id and preferred_target_id in found_target_ids:
            return preferred_target_id
        return found_target_ids[0] if found_target_ids else None

    def _found_target_ids(self, *, ean: str, request_id: str) -> list[str]:
        hood_results = self.discover_targets(ean=ean, request_id=request_id)
        return [target_id for target_id, state in hood_results.items() if state["status"] is ProductEditorTargetStatus.FOUND]


class ProductEditorHoodFlowError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int, details: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def _normalize_hood_draft(fetch_body: dict, target_id: str) -> dict:
    external_item = _extract_first_external_item(fetch_body)
    preview_item = _extract_first_preview_item(fetch_body)
    images = external_item.get("images")
    if not isinstance(images, list):
        images = preview_item.get("images")
    clean_images = [str(image).strip() for image in images or [] if str(image).strip()]
    primary_image = str(preview_item.get("image") or "").strip()
    if not primary_image and clean_images:
        primary_image = clean_images[0]
    return {
        "target_id": target_id,
        "account": _HOOD_ACCOUNT_BY_TARGET[target_id],
        "ean": str(fetch_body.get("ean") or "").strip(),
        "item_id": _as_text(preview_item.get("item_id") or external_item.get("itemID")),
        "title": str(external_item.get("title") or preview_item.get("title") or "").strip(),
        "description": str(preview_item.get("description") or external_item.get("description") or ""),
        "price": _as_text(external_item.get("price")),
        "quantity": _as_int_or_none(external_item.get("quantity")),
        "categoryID": _as_text(external_item.get("categoryID")),
        "condition": _as_text(external_item.get("condition")),
        "itemMode": _as_text(external_item.get("itemMode")),
        "itemNumber": _as_text(external_item.get("itemNumber")),
        "image": primary_image,
        "images": clean_images,
        "productProperties": external_item.get("productProperties") if isinstance(external_item.get("productProperties"), list) else [],
        "raw_payload": fetch_body if isinstance(fetch_body, dict) else {},
    }


def _extract_first_external_item(fetch_body: dict) -> dict:
    external_payload = fetch_body.get("external_payload")
    if not isinstance(external_payload, dict):
        return {}
    items = external_payload.get("items")
    if not isinstance(items, list) or not items:
        return {}
    first = items[0]
    return first if isinstance(first, dict) else {}


def _extract_first_preview_item(fetch_body: dict) -> dict:
    items = fetch_body.get("items")
    if not isinstance(items, list) or not items:
        return {}
    first = items[0]
    return first if isinstance(first, dict) else {}


def _build_hood_patch_payload(*, draft: dict, changed_fields: list[str]) -> dict:
    # Hood PATCH behaves like a full editable-object update, not a sparse patch.
    # Send the whole filtered draft so downstream can preserve fields correctly.
    return filtered_payload(Marketplace.HOOD, draft if isinstance(draft, dict) else {})


def _plan_warnings_for_hood(*, changed_fields: list[str], draft: dict) -> list[ProductEditorWarning]:
    warnings = [
        ProductEditorWarning(
            code="product_editor_live_marketplace_patch",
            message="Apply will send a live PATCH to the HOOD marketplace account.",
            level=ProductEditorRiskLevel.HIGH,
        )
    ]
    if "images" in changed_fields:
        warnings.append(
            ProductEditorWarning(
                code="product_editor_images_removed_keep_ftp",
                message="Removed images will be removed from product payload only; FTP files stay untouched.",
                level=ProductEditorRiskLevel.MEDIUM,
            )
        )
    pending_uploads = draft.get("pending_uploads") if isinstance(draft, dict) else None
    if isinstance(pending_uploads, list) and pending_uploads:
        warnings.append(
            ProductEditorWarning(
                code="product_editor_pending_uploads_present",
                message="Pending uploads are present and require apply-time upload support.",
                level=ProductEditorRiskLevel.HIGH,
            )
        )
    return warnings


def _plan_risk_level(*, changed_fields: list[str], draft: dict) -> ProductEditorRiskLevel:
    pending_uploads = draft.get("pending_uploads") if isinstance(draft, dict) else None
    if isinstance(pending_uploads, list) and pending_uploads:
        return ProductEditorRiskLevel.HIGH
    if "images" in changed_fields or "price" in changed_fields or "quantity" in changed_fields:
        return ProductEditorRiskLevel.HIGH
    return ProductEditorRiskLevel.MEDIUM


def _is_hood_found(fetch_body: dict) -> bool:
    items = fetch_body.get("items")
    return isinstance(items, list) and len(items) > 0


def _is_hood_missing(status_code: int, fetch_body: dict) -> bool:
    if status_code == 404:
        return True
    return fetch_body.get("code") == "hood_external_error_status" and fetch_body.get("status_code") == 404


def _build_target_result(*, target_id: str, patch_result, request_id: str) -> dict:
    if 200 <= patch_result.status_code < 300:
        return {
            "target_id": target_id,
            "status": "success",
            "status_code": patch_result.status_code,
            "data": patch_result.body,
        }
    return {
        "target_id": target_id,
        "status": "failed",
        "status_code": patch_result.status_code,
        "error": ErrorContract(
            code=str(patch_result.body.get("code") or "product_editor_hood_patch_failed"),
            message="HOOD downstream PATCH failed.",
            request_id=request_id,
            details={"upstream_status_code": patch_result.status_code, "upstream_response": patch_result.body},
        ).model_dump(),
    }


def _as_text(value) -> str:
    return "" if value in (None, "") else str(value).strip()


def _as_int_or_none(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
