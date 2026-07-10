from __future__ import annotations

import uuid

from ..domain.field_registry import filtered_payload, validate_changed_fields
from ..domain.models import (
    CanonicalPayload,
    ChannelTarget,
    ErrorContract,
    JobPriority,
    JobStatus,
    Marketplace,
    Operation,
    OrchestrateRequest,
)
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

_XL_ACTIVE_SITE_KEYS = ["XLMOEBEL_DE"]
_XL_READ_ONLY_SITE_KEYS = [
    "XLMOEBEL_CH",
    "XLMOBILI_IT",
    "XLMEUBILAIR_NL",
    "XLMEBELES_LV",
    "XLMOEBEL_LU",
    "XLNABYTEK_CZ",
    "XLPOSLOVNO_SI",
    "XLFURNITURE_CO_UK",
    "XLBUTOROK_HU",
    "XLHOME_GR",
    "XLMEBLE_PL",
    "XLMEUBELLA_BE",
    "XLMEUBLES_FR",
    "XLMOEBEL_AT",
    "XLMUEBLES_ES",
    "XLFURNITURE_IE",
    "XLHUONEKALUT_FI",
    "XLMOBILA_RO",
    "XLMOBILIARIO_PT",
    "XLMOBLER_SE",
    "XLNABYTOK_SK",
    "XXLMOBLER_DK",
]
_XL_DISALLOWED_FIELDS = {"jv_fields"}


class ProductEditorXlFlow:
    def __init__(
        self,
        *,
        gateway: ProductEditorGateway,
        store: SqliteProductEditorStore,
        orchestrator_job_store: SqliteJobStore,
    ) -> None:
        self.gateway = gateway
        self.store = store
        self.orchestrator_job_store = orchestrator_job_store

    def discover_targets(self, *, ean: str, request_id: str) -> dict[str, dict]:
        fetch = self.gateway.fetch_xl_sites_by_ean(ean=ean, request_id=request_id, site_key="XLMOEBEL_DE")
        if not (200 <= fetch.status_code < 300):
            return {
                site_key: {
                    "status": ProductEditorTargetStatus.ERROR if site_key in _XL_ACTIVE_SITE_KEYS else ProductEditorTargetStatus.PLANNED,
                    "metadata": {"status_code": fetch.status_code},
                    "warnings": [
                        ProductEditorWarning(
                            code="product_editor_xl_discover_error" if site_key in _XL_ACTIVE_SITE_KEYS else "product_editor_xl_placeholder",
                            message="Failed to discover XL site status." if site_key in _XL_ACTIVE_SITE_KEYS else "XL editing is enabled only for XLMOEBEL_DE in current runtime.",
                        )
                    ],
                }
                for site_key in [*_XL_ACTIVE_SITE_KEYS, *_XL_READ_ONLY_SITE_KEYS]
            }

        found_rows = fetch.body.get("found") if isinstance(fetch.body.get("found"), list) else []
        missing_rows = fetch.body.get("missing") if isinstance(fetch.body.get("missing"), list) else []
        found_by_key = {
            str(row.get("site_key") or "").strip().upper(): row
            for row in found_rows
            if str(row.get("site_key") or "").strip()
        }
        missing_by_key = {
            str(row.get("site_key") or "").strip().upper(): row
            for row in missing_rows
            if str(row.get("site_key") or "").strip()
        }

        results: dict[str, dict] = {}
        for site_key in _XL_ACTIVE_SITE_KEYS:
            if site_key in found_by_key:
                row = found_by_key[site_key]
                results[site_key] = {
                    "status": ProductEditorTargetStatus.FOUND,
                    "metadata": {
                        "domain": row.get("domain"),
                        "product_id": row.get("product_id"),
                        "effective_ean": row.get("ean"),
                        "price": row.get("price"),
                        "currency_code": row.get("currency_code"),
                        "title": row.get("title"),
                    },
                    "warnings": [],
                }
                continue

            row = missing_by_key.get(site_key) or {}
            reason = str(row.get("reason") or "").strip().lower()
            if reason == "query_error":
                results[site_key] = {
                    "status": ProductEditorTargetStatus.ERROR,
                    "metadata": {"domain": row.get("domain"), "reason": reason},
                    "warnings": [ProductEditorWarning(code="product_editor_xl_site_query_error", message="XL site query failed during discover.")],
                }
                continue

            results[site_key] = {
                "status": ProductEditorTargetStatus.MISSING,
                "metadata": {"domain": row.get("domain"), "reason": reason or "not_found"},
                "warnings": [],
            }

        return results

    def recommended_baseline_from_results(self, results: dict[str, dict]) -> str | None:
        return "XLMOEBEL_DE" if results.get("XLMOEBEL_DE", {}).get("status") is ProductEditorTargetStatus.FOUND else None

    def load(self, *, ean: str, request_id: str, baseline_target_id: str | None) -> ProductEditorLoadResponse:
        baseline_site_key = self._resolve_baseline_site_key(
            ean=ean,
            request_id=request_id,
            preferred_target_id=baseline_target_id,
            available_target_ids=[baseline_target_id] if baseline_target_id else None,
        )
        if baseline_site_key is None:
            return ProductEditorLoadResponse(
                request_id=request_id,
                ean=ean,
                active_group=ProductEditorGroupId.XL,
                baseline_target_id=baseline_target_id,
                supported=False,
                warnings=[ProductEditorWarning(code="product_editor_xl_target_not_found", message="No editable XL target was found for this EAN.")],
            )

        self.gateway.sync_xl_by_ean(ean=ean, site_key=baseline_site_key, request_id=request_id)
        local = self.gateway.fetch_xl_local_by_ean(ean=ean, site_key=baseline_site_key, request_id=request_id)

        if not (200 <= local.status_code < 300):
            return ProductEditorLoadResponse(
                request_id=request_id,
                ean=ean,
                active_group=ProductEditorGroupId.XL,
                baseline_target_id=baseline_site_key,
                supported=False,
                warnings=[ProductEditorWarning(code="product_editor_xl_load_failed", message="Failed to load XL baseline draft.")],
            )

        return ProductEditorLoadResponse(
            request_id=request_id,
            ean=ean,
            active_group=ProductEditorGroupId.XL,
            baseline_target_id=baseline_site_key,
            draft=_normalize_xl_draft(local.body, baseline_site_key),
            supported=True,
            warnings=[
                ProductEditorWarning(
                    code="product_editor_xl_de_only",
                    message="XL Product Editor is currently enabled only for XLMOEBEL_DE.",
                    level=ProductEditorRiskLevel.MEDIUM,
                )
            ],
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
            raise ProductEditorXlFlowError("product_editor_changed_fields_empty", "At least one changed field is required to generate a plan.", 400)

        unknown = validate_changed_fields(Marketplace.XLJV, changed_fields)
        unknown.extend(sorted(field for field in changed_fields if field in _XL_DISALLOWED_FIELDS and field not in unknown))
        if unknown:
            raise ProductEditorXlFlowError(
                "product_editor_changed_fields_invalid",
                "Plan contains field names that are not supported by the XL adapter.",
                400,
                details={"unknown_fields": unknown},
            )

        target_ids = _normalize_xl_target_ids(selected_target_ids)
        if not target_ids:
            target_ids = self._found_target_ids(ean=ean, request_id=request_id)
        if not target_ids:
            raise ProductEditorXlFlowError("product_editor_no_found_targets", "No editable XL targets are available for this EAN.", 409)

        baseline_site_key = self._resolve_baseline_site_key(
            ean=ean,
            request_id=request_id,
            preferred_target_id=str(draft.get("target_id") or "").strip() or None,
            available_target_ids=target_ids,
        )
        if baseline_site_key is None:
            raise ProductEditorXlFlowError("product_editor_xl_baseline_missing", "XL baseline target could not be resolved.", 409)

        payload = _build_xl_batch_payload(draft=draft, changed_fields=changed_fields, target_ids=target_ids, baseline_site_key=baseline_site_key)
        warnings = _plan_warnings_for_xl(changed_fields=changed_fields)
        risk_level = _plan_risk_level_for_xl(changed_fields=changed_fields)
        plan_id = str(uuid.uuid4())
        summary = {
            "supported": True,
            "selected_target_count": len(target_ids),
            "changed_fields_count": len(changed_fields),
            "target_policy": "xlde_only",
            "baseline_site_key": baseline_site_key,
        }
        self.store.create_plan(
            plan_id=plan_id,
            request_id=request_id,
            ean=ean,
            active_group=ProductEditorGroupId.XL,
            selected_target_ids=target_ids,
            changed_fields=changed_fields,
            draft=payload,
            warnings=[warning.model_dump() for warning in warnings],
            risk_level=risk_level,
            summary=summary,
        )
        targets = [
            target
            for group in build_product_editor_groups()
            if group.id is ProductEditorGroupId.XL
            for target in group.targets
            if target.id in target_ids
        ]
        return ProductEditorPlanResponse(
            request_id=request_id,
            plan_id=plan_id,
            ean=ean,
            active_group=ProductEditorGroupId.XL,
            targets=targets,
            changed_fields=changed_fields,
            warnings=warnings,
            risk_level=risk_level,
            summary=summary,
        )

    def apply(self, *, plan_id: str, request_id: str) -> ProductEditorApplyResponse:
        plan = self.store.get_plan(plan_id=plan_id)
        if plan is None:
            raise ProductEditorXlFlowError("product_editor_plan_not_found", "Product Editor plan was not found.", 404, details={"plan_id": plan_id})

        job_id = str(uuid.uuid4())
        command = _build_xl_orchestrate_request(plan=plan)
        self.orchestrator_job_store.create_job(
            job_id=job_id,
            request_id=request_id,
            ean=plan["ean"],
            command=command,
            priority=JobPriority.BACKGROUND,
        )
        return ProductEditorApplyResponse(
            request_id=request_id,
            job_id=job_id,
            status=JobStatus.QUEUED,
            active_group=ProductEditorGroupId.XL,
            accepted=True,
        )

    def get_job(self, *, job_id: str, request_id: str) -> ProductEditorJobResponse:
        details = self.orchestrator_job_store.get_job(job_id=job_id)
        command = self.orchestrator_job_store.get_job_command(job_id=job_id)
        if details is None or command is None or not _is_xl_product_editor_command(command):
            raise ProductEditorXlFlowError("product_editor_job_not_found", "Product Editor job was not found.", 404, details={"job_id": job_id})

        summary = _map_xl_orchestrator_summary(details=details)
        targets = _map_xl_orchestrator_targets(details=details, request_id=request_id)
        error = details.error
        facade_status = details.status
        if details.status is JobStatus.COMPLETED and int(summary.get("failed") or 0) > 0:
            facade_status = JobStatus.FAILED
        return ProductEditorJobResponse(
            request_id=request_id,
            job_id=job_id,
            status=facade_status,
            active_group=ProductEditorGroupId.XL,
            summary=summary,
            targets=targets,
            error=error,
        )

    def _resolve_baseline_site_key(
        self,
        *,
        ean: str,
        request_id: str,
        preferred_target_id: str | None,
        available_target_ids: list[str] | None = None,
    ) -> str | None:
        found_target_ids = _normalize_xl_target_ids(available_target_ids)
        if not found_target_ids:
            found_target_ids = self._found_target_ids(ean=ean, request_id=request_id)
        if preferred_target_id and preferred_target_id in found_target_ids:
            return preferred_target_id
        return "XLMOEBEL_DE" if "XLMOEBEL_DE" in found_target_ids else None

    def _found_target_ids(self, *, ean: str, request_id: str) -> list[str]:
        results = self.discover_targets(ean=ean, request_id=request_id)
        return [target_id for target_id, state in results.items() if state["status"] is ProductEditorTargetStatus.FOUND]


class ProductEditorXlFlowError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int, details: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def _normalize_xl_draft(payload: dict, baseline_site_key: str) -> dict:
    descriptions = payload.get("descriptions") if isinstance(payload.get("descriptions"), list) else []
    categories = payload.get("categories") if isinstance(payload.get("categories"), list) else []
    stores = payload.get("stores") if isinstance(payload.get("stores"), list) else []
    images = payload.get("images") if isinstance(payload.get("images"), list) else []
    specials = payload.get("specials") if isinstance(payload.get("specials"), list) else []
    return {
        "target_id": baseline_site_key,
        "ean": str(payload.get("ean") or "").strip(),
        "source_model": str(payload.get("source_model") or "").strip(),
        "source_sku": str(payload.get("source_sku") or "").strip(),
        "source_ean_field": str(payload.get("source_ean_field") or "").strip(),
        "price": "" if payload.get("price") in (None, "") else str(payload.get("price")),
        "quantity": payload.get("quantity"),
        "status": bool(payload.get("status", False)),
        "image": str(payload.get("image") or "").strip(),
        "descriptions": descriptions,
        "categories": categories,
        "stores": stores,
        "images": images,
        "specials": specials,
        "xl_attribute_fields": payload.get("xl_attribute_fields") if isinstance(payload.get("xl_attribute_fields"), list) else [],
    }


def _normalize_xl_target_ids(target_ids: list[str] | None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for target_id in target_ids or []:
        value = str(target_id or "").strip().upper()
        if not value or value not in _XL_ACTIVE_SITE_KEYS or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _build_xl_batch_payload(*, draft: dict, changed_fields: list[str], target_ids: list[str], baseline_site_key: str) -> dict:
    filtered = filtered_payload(Marketplace.XLJV, draft if isinstance(draft, dict) else {})
    payload = {field: filtered[field] for field in changed_fields if field in filtered and field not in _XL_DISALLOWED_FIELDS}
    payload["site_family"] = "XL"
    payload["site_keys"] = target_ids
    payload["template_site_key"] = baseline_site_key
    return payload


def _build_xl_orchestrate_request(*, plan: dict) -> OrchestrateRequest:
    draft = plan["draft"] if isinstance(plan.get("draft"), dict) else {}
    selected_target_ids = [
        str(target_id or "").strip().upper()
        for target_id in plan.get("selected_target_ids") or []
        if str(target_id or "").strip()
    ]
    payload = CanonicalPayload(**_normalize_xl_canonical_payload(filtered_payload(Marketplace.XLJV, draft)))
    overrides = {
        "__product_editor_mode": "xl_batch_apply",
        **draft,
        "site_family": "XL",
        "site_keys": selected_target_ids,
    }
    baseline_site_key = str(draft.get("template_site_key") or draft.get("target_id") or "").strip().upper()
    return OrchestrateRequest(
        operation=Operation.UPDATE,
        payload=payload,
        channels=[
            ChannelTarget(
                marketplace=Marketplace.XLJV,
                site="XL",
                site_key=baseline_site_key or None,
                changed_fields=list(plan.get("changed_fields") or []),
                overrides=overrides,
            )
        ],
    )


def _normalize_xl_canonical_payload(payload: dict) -> dict:
    normalized = dict(payload or {})
    images = normalized.get("images")
    if isinstance(images, list):
        normalized["images"] = [
            str(image.get("image") if isinstance(image, dict) else image).strip()
            for image in images
            if str(image.get("image") if isinstance(image, dict) else image).strip()
        ]
    quantity = normalized.get("quantity")
    if quantity == "":
        normalized["quantity"] = None
    elif quantity is not None and not isinstance(quantity, int):
        try:
            normalized["quantity"] = int(quantity)
        except (TypeError, ValueError):
            normalized["quantity"] = None
    price = normalized.get("price")
    if price is not None and not isinstance(price, str):
        normalized["price"] = str(price)
    image = normalized.get("image")
    if image is not None and not isinstance(image, str):
        normalized["image"] = str(image)
    date_available = normalized.get("date_available")
    if date_available is not None and not isinstance(date_available, str):
        normalized["date_available"] = str(date_available)
    normalized.pop("jv_fields", None)
    return normalized


def _plan_warnings_for_xl(*, changed_fields: list[str]) -> list[ProductEditorWarning]:
    warnings = [
        ProductEditorWarning(
            code="product_editor_live_source_batch_apply",
            message="Apply will send a live XL source-site batch update through the orchestrator.",
            level=ProductEditorRiskLevel.HIGH,
        ),
        ProductEditorWarning(
            code="product_editor_xl_de_only",
            message="Current XL Product Editor scope is limited to XLMOEBEL_DE.",
            level=ProductEditorRiskLevel.MEDIUM,
        ),
    ]
    if "images" in changed_fields:
        warnings.append(
            ProductEditorWarning(
                code="product_editor_xl_images_live_update",
                message="Image changes will be pushed to the live XL DE source site.",
                level=ProductEditorRiskLevel.HIGH,
            )
        )
    return warnings


def _plan_risk_level_for_xl(*, changed_fields: list[str]) -> ProductEditorRiskLevel:
    if {"price", "quantity", "images", "descriptions", "specials"} & set(changed_fields):
        return ProductEditorRiskLevel.HIGH
    return ProductEditorRiskLevel.MEDIUM


def _map_xl_batch_targets(batch_body: dict, *, request_id: str) -> list[dict]:
    job = batch_body.get("job") if isinstance(batch_body.get("job"), dict) else {}
    items = job.get("items") if isinstance(job.get("items"), list) else []
    targets: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        status_value = str(item.get("status") or "").strip().lower()
        site_key = str(item.get("site_key") or item.get("site") or "").strip()
        if status_value == "applied":
            targets.append(
                {
                    "target_id": site_key,
                    "status": "success",
                    "status_code": 200,
                    "data": {"domain": item.get("domain"), "status": status_value},
                }
            )
            continue
        targets.append(
            {
                "target_id": site_key,
                "status": "failed",
                "status_code": 409,
                "error": ErrorContract(
                    code=str(item.get("error_code") or "product_editor_xl_target_failed"),
                    message=str(item.get("error_text") or "XL target apply failed."),
                    request_id=request_id,
                    details={"domain": item.get("domain"), "status": status_value},
                ).model_dump(),
            }
        )
    return targets


def _is_xl_product_editor_command(command: OrchestrateRequest) -> bool:
    if len(command.channels) != 1:
        return False
    channel = command.channels[0]
    if channel.marketplace is not Marketplace.XLJV:
        return False
    if str(channel.site or "").strip().upper() != "XL":
        return False
    return str(channel.overrides.get("__product_editor_mode") or "").strip().lower() == "xl_batch_apply"


def _map_xl_orchestrator_summary(*, details) -> dict:
    if details.status is JobStatus.QUEUED:
        return {"supported": True, "success": 0, "failed": 0}
    if details.status is JobStatus.RUNNING:
        return {"supported": True, "success": 0, "failed": 0}
    result = details.result
    if result is None or not result.results:
        return {"supported": True, "success": 0, "failed": 1 if details.status is JobStatus.FAILED else 0}
    channel_result = result.results[0]
    batch_summary = channel_result.data.get("summary") if isinstance(channel_result.data.get("summary"), dict) else {}
    job_payload = channel_result.data.get("job") if isinstance(channel_result.data.get("job"), dict) else {}
    items = job_payload.get("items") if isinstance(job_payload.get("items"), list) else []
    if batch_summary:
        success_count = int(batch_summary.get("applied") or 0) + int(batch_summary.get("skipped") or 0)
        failed_count = int(batch_summary.get("failed") or 0)
        return {
            "supported": True,
            "success": success_count,
            "failed": failed_count,
            "applied": int(batch_summary.get("applied") or 0),
            "skipped": int(batch_summary.get("skipped") or 0),
            "translation_used_sites": int(batch_summary.get("translation_used_sites") or 0),
            "translation_error_sites": int(batch_summary.get("translation_error_sites") or 0),
        }
    targets = _map_xl_batch_targets(channel_result.data, request_id=details.request_id)
    success_count = sum(1 for target in targets if target["status"] == "success")
    failed_count = len(targets) - success_count
    if not targets and items:
        failed_count = len(items)
    return {"supported": True, "success": success_count, "failed": failed_count}


def _map_xl_orchestrator_targets(*, details, request_id: str) -> list[dict]:
    if details.status in {JobStatus.QUEUED, JobStatus.RUNNING}:
        return []
    result = details.result
    if result is None or not result.results:
        return []
    channel_result = result.results[0]
    targets = _map_xl_batch_targets(channel_result.data, request_id=request_id)
    if targets:
        return targets
    return [
        {
            "target_id": "XLMOEBEL_DE",
            "status": "success" if channel_result.status == "success" else "failed",
            "status_code": int(channel_result.status_code),
            "data": channel_result.data,
            "error": channel_result.error.model_dump() if channel_result.error is not None else None,
        }
    ]
