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
from ..infra.product_editor_gateway import ProductEditorGateway
from ..infra.product_editor_store import SqliteProductEditorStore
from ..infra.job_store import SqliteJobStore


_JV_PRIORITY = ["JV_DE", "JV_CH", "JV_AT", "JV_CO_UK"]
_JV_TEXTUAL_FIELDS = {"descriptions", "jv_fields"}


class ProductEditorJvFlow:
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
        fetch = self.gateway.fetch_jv_sites_by_ean(ean=ean, request_id=request_id)
        if not (200 <= fetch.status_code < 300):
            return {
                site_key: {
                    "status": ProductEditorTargetStatus.ERROR,
                    "metadata": {"status_code": fetch.status_code},
                    "warnings": [ProductEditorWarning(code="product_editor_jv_discover_error", message="Failed to discover JV site status.")],
                }
                for site_key in _JV_PRIORITY
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
        for site_key in _JV_PRIORITY:
            if site_key in found_by_key:
                row = found_by_key[site_key]
                warnings: list[ProductEditorWarning] = []
                if site_key == "JV_CO_UK":
                    warnings.append(
                        ProductEditorWarning(
                            code="product_editor_translation_required",
                            message="JV_CO_UK is included in apply, but should never be auto-baseline and may require translation.",
                            level=ProductEditorRiskLevel.MEDIUM,
                        )
                    )
                results[site_key] = {
                    "status": ProductEditorTargetStatus.FOUND,
                    "metadata": {
                        "domain": row.get("domain"),
                        "product_id": row.get("product_id"),
                        "effective_ean": row.get("ean"),
                        "price": row.get("price"),
                        "title": row.get("title"),
                    },
                    "warnings": warnings,
                }
                continue

            row = missing_by_key.get(site_key) or {}
            reason = str(row.get("reason") or "").strip().lower()
            if reason == "query_error":
                results[site_key] = {
                    "status": ProductEditorTargetStatus.ERROR,
                    "metadata": {"domain": row.get("domain"), "reason": reason},
                    "warnings": [ProductEditorWarning(code="product_editor_jv_site_query_error", message="JV site query failed during discover.")],
                }
                continue

            results[site_key] = {
                "status": ProductEditorTargetStatus.MISSING,
                "metadata": {"domain": row.get("domain"), "reason": reason or "not_found"},
                "warnings": [],
            }
        return results

    def recommended_baseline(self, *, ean: str, request_id: str) -> str | None:
        results = self.discover_targets(ean=ean, request_id=request_id)
        return self.recommended_baseline_from_results(results)

    def recommended_baseline_from_results(self, results: dict[str, dict]) -> str | None:
        for site_key in _JV_PRIORITY:
            if site_key == "JV_CO_UK":
                continue
            if results.get(site_key, {}).get("status") is ProductEditorTargetStatus.FOUND:
                return site_key
        if results.get("JV_CO_UK", {}).get("status") is ProductEditorTargetStatus.FOUND:
            return "JV_CO_UK"
        return None

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
                active_group=ProductEditorGroupId.JV,
                baseline_target_id=baseline_target_id,
                supported=False,
                warnings=[ProductEditorWarning(code="product_editor_jv_target_not_found", message="No JV target was found for this EAN.")],
            )

        local = self.gateway.fetch_jv_local_by_ean(ean=ean, site_key=baseline_site_key, request_id=request_id)
        if local.status_code == 404:
            self.gateway.sync_jv_by_ean(ean=ean, site_key=baseline_site_key, request_id=request_id)
            local = self.gateway.fetch_jv_local_by_ean(ean=ean, site_key=baseline_site_key, request_id=request_id)

        if not (200 <= local.status_code < 300):
            return ProductEditorLoadResponse(
                request_id=request_id,
                ean=ean,
                active_group=ProductEditorGroupId.JV,
                baseline_target_id=baseline_site_key,
                supported=False,
                warnings=[ProductEditorWarning(code="product_editor_jv_load_failed", message="Failed to load JV baseline draft.")],
            )

        warnings: list[ProductEditorWarning] = []
        if baseline_site_key == "JV_CO_UK":
            warnings.append(
                ProductEditorWarning(
                    code="product_editor_uk_manual_baseline_only",
                    message="JV_CO_UK should not be auto-selected as baseline. Review translation-sensitive fields carefully.",
                    level=ProductEditorRiskLevel.MEDIUM,
                )
            )

        return ProductEditorLoadResponse(
            request_id=request_id,
            ean=ean,
            active_group=ProductEditorGroupId.JV,
            baseline_target_id=baseline_site_key,
            draft=_normalize_jv_draft(local.body, baseline_site_key),
            supported=True,
            warnings=warnings,
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
            raise ProductEditorJvFlowError("product_editor_changed_fields_empty", "At least one changed field is required to generate a plan.", 400)

        unknown = validate_changed_fields(Marketplace.XLJV, changed_fields)
        if unknown:
            raise ProductEditorJvFlowError(
                "product_editor_changed_fields_invalid",
                "Plan contains field names that are not supported by the JV adapter.",
                400,
                details={"unknown_fields": unknown},
            )

        target_ids = _normalize_target_ids(selected_target_ids)
        if not target_ids:
            target_ids = self._found_target_ids(ean=ean, request_id=request_id)
        if not target_ids:
            raise ProductEditorJvFlowError("product_editor_no_found_targets", "No found JV targets are available for this EAN.", 409)

        baseline_site_key = self._resolve_baseline_site_key(
            ean=ean,
            request_id=request_id,
            preferred_target_id=str(draft.get("target_id") or "").strip() or None,
            available_target_ids=target_ids,
        )
        if baseline_site_key is None:
            raise ProductEditorJvFlowError("product_editor_jv_baseline_missing", "JV baseline target could not be resolved.", 409)

        payload = _build_jv_batch_payload(draft=draft, changed_fields=changed_fields, target_ids=target_ids, baseline_site_key=baseline_site_key)
        warnings = _plan_warnings_for_jv(changed_fields=changed_fields, target_ids=target_ids)
        risk_level = _plan_risk_level_for_jv(changed_fields=changed_fields)
        plan_id = str(uuid.uuid4())
        summary = {
            "supported": True,
            "selected_target_count": len(target_ids),
            "changed_fields_count": len(changed_fields),
            "target_policy": "all_found_in_active_group",
            "baseline_site_key": baseline_site_key,
        }
        self.store.create_plan(
            plan_id=plan_id,
            request_id=request_id,
            ean=ean,
            active_group=ProductEditorGroupId.JV,
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
            if group.id is ProductEditorGroupId.JV
            for target in group.targets
            if target.id in target_ids
        ]
        return ProductEditorPlanResponse(
            request_id=request_id,
            plan_id=plan_id,
            ean=ean,
            active_group=ProductEditorGroupId.JV,
            targets=targets,
            changed_fields=changed_fields,
            warnings=warnings,
            risk_level=risk_level,
            summary=summary,
        )

    def apply(self, *, plan_id: str, request_id: str) -> ProductEditorApplyResponse:
        plan = self.store.get_plan(plan_id=plan_id)
        if plan is None:
            raise ProductEditorJvFlowError("product_editor_plan_not_found", "Product Editor plan was not found.", 404, details={"plan_id": plan_id})

        job_id = str(uuid.uuid4())
        command = _build_jv_orchestrate_request(plan=plan)
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
            active_group=ProductEditorGroupId.JV,
            accepted=True,
        )

    def get_job(self, *, job_id: str, request_id: str) -> ProductEditorJobResponse:
        details = self.orchestrator_job_store.get_job(job_id=job_id)
        command = self.orchestrator_job_store.get_job_command(job_id=job_id)
        if details is None or command is None or not _is_jv_product_editor_command(command):
            raise ProductEditorJvFlowError("product_editor_job_not_found", "Product Editor job was not found.", 404, details={"job_id": job_id})

        batch_job_id = _extract_jv_batch_job_id(details)
        if batch_job_id is not None and _should_refresh_live_jv_batch(details):
            live_batch = self.gateway.fetch_jv_batch_job_status(job_id=batch_job_id, request_id=request_id)
            if 200 <= live_batch.status_code < 300:
                return _map_live_jv_batch_job_response(
                    orchestrator_job_id=job_id,
                    request_id=request_id,
                    batch_body=live_batch.body,
                )

        summary = _map_jv_orchestrator_summary(details=details)
        targets = _map_jv_orchestrator_targets(details=details, command=command, request_id=request_id)
        error = details.error
        facade_status = details.status
        if details.status is JobStatus.COMPLETED and int(summary.get("failed") or 0) > 0:
            facade_status = JobStatus.FAILED
        return ProductEditorJobResponse(
            request_id=request_id,
            job_id=job_id,
            status=facade_status,
            active_group=ProductEditorGroupId.JV,
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
        found_target_ids = _normalize_target_ids(available_target_ids)
        if not found_target_ids:
            found_target_ids = self._found_target_ids(ean=ean, request_id=request_id)
        if preferred_target_id and preferred_target_id in found_target_ids:
            return preferred_target_id
        for site_key in _JV_PRIORITY:
            if site_key == "JV_CO_UK":
                continue
            if site_key in found_target_ids:
                return site_key
        return "JV_CO_UK" if "JV_CO_UK" in found_target_ids else None

    def _found_target_ids(self, *, ean: str, request_id: str) -> list[str]:
        results = self.discover_targets(ean=ean, request_id=request_id)
        return [target_id for target_id, state in results.items() if state["status"] is ProductEditorTargetStatus.FOUND]


class ProductEditorJvFlowError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int, details: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def _normalize_jv_draft(payload: dict, baseline_site_key: str) -> dict:
    descriptions = payload.get("descriptions") if isinstance(payload.get("descriptions"), list) else []
    categories = payload.get("categories") if isinstance(payload.get("categories"), list) else []
    images = payload.get("images") if isinstance(payload.get("images"), list) else []
    jv_fields = payload.get("jv_fields") if isinstance(payload.get("jv_fields"), dict) else {}
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
        "images": images,
        "jv_fields": jv_fields,
    }


def _normalize_target_ids(target_ids: list[str] | None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for target_id in target_ids or []:
        value = str(target_id or "").strip().upper()
        if not value or value not in _JV_PRIORITY or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _first_jv_description_source(draft: dict) -> dict[str, str]:
    descriptions = draft.get("descriptions") if isinstance(draft.get("descriptions"), list) else []
    preferred = next(
        (
            row for row in descriptions
            if isinstance(row, dict) and int(row.get("language_id") or 0) == 1
        ),
        None,
    )
    if preferred is None:
        preferred = next((row for row in descriptions if isinstance(row, dict)), None)
    if not isinstance(preferred, dict):
        return {}

    result: dict[str, str] = {}
    for key in ("name", "description", "meta_title", "meta_description", "meta_keyword", "tag"):
        value = str(preferred.get(key) or "").strip()
        if value:
            result[key] = value
    return result


def _jv_content_translation_source(draft: dict) -> dict[str, str]:
    jv_fields = draft.get("jv_fields") if isinstance(draft.get("jv_fields"), dict) else {}
    content_rows = jv_fields.get("content_by_language") if isinstance(jv_fields.get("content_by_language"), list) else []
    preferred = next(
        (
            row for row in content_rows
            if isinstance(row, dict) and str(row.get("language_code") or "").strip().lower() == "de"
        ),
        None,
    )
    if preferred is None:
        preferred = next((row for row in content_rows if isinstance(row, dict)), None)

    source = _first_jv_description_source(draft)
    if isinstance(preferred, dict):
        field_map = {
            "name": "name",
            "description": "description",
            "meta_title": "meta_title",
            "meta_description": "meta_description",
            "meta_keyword": "meta_keyword",
            "tag": "tag",
            "BESCHREIBUNG": "description",
            "KURZBESCHREIBUNG": "kurzbeschreibung",
        }
        for output_key, input_key in field_map.items():
            value = str(preferred.get(input_key) or "").strip()
            if value:
                source[output_key] = value
    return source


def _normalize_jv_categories_payload(draft: dict) -> tuple[list[dict], int | None]:
    categories = draft.get("categories") if isinstance(draft.get("categories"), list) else []
    normalized: list[dict] = []
    seen: set[int] = set()
    for row in categories:
        if not isinstance(row, dict):
            continue
        try:
            category_id = int(row.get("category_id"))
        except (TypeError, ValueError):
            continue
        if category_id in seen:
            continue
        seen.add(category_id)
        normalized.append(
            {
                "category_id": category_id,
                "main_category": bool(row.get("main_category", False)),
            }
        )

    if not normalized:
        return [], None

    main_category_id = next(
        (item["category_id"] for item in normalized if bool(item.get("main_category"))),
        None,
    )
    if main_category_id is None:
        main_category_id = normalized[0]["category_id"]

    return (
        [
            {
                "category_id": item["category_id"],
                "main_category": item["category_id"] == main_category_id,
            }
            for item in normalized
        ],
        main_category_id,
    )


def _build_jv_batch_payload(*, draft: dict, changed_fields: list[str], target_ids: list[str], baseline_site_key: str) -> dict:
    filtered = filtered_payload(Marketplace.XLJV, draft if isinstance(draft, dict) else {})
    payload = {field: filtered[field] for field in changed_fields if field in filtered}
    if "categories" in changed_fields:
        normalized_categories, template_main_category_id = _normalize_jv_categories_payload(draft if isinstance(draft, dict) else {})
        payload["categories"] = normalized_categories
        if template_main_category_id is not None:
            payload["template_main_category_id"] = template_main_category_id
    textual_changed = any(field in _JV_TEXTUAL_FIELDS for field in changed_fields)
    if textual_changed and "JV_CO_UK" in target_ids:
        payload["translate_texts"] = True
        payload["translation_source_language"] = "de"
        translation_source = _jv_content_translation_source(draft if isinstance(draft, dict) else {})
        if translation_source:
            payload["translation_source"] = translation_source
    payload["site_family"] = "JV"
    payload["site_keys"] = target_ids
    payload["template_site_key"] = baseline_site_key
    return payload


def _build_jv_orchestrate_request(*, plan: dict) -> OrchestrateRequest:
    draft = plan["draft"] if isinstance(plan.get("draft"), dict) else {}
    selected_target_ids = [
        str(target_id or "").strip().upper()
        for target_id in plan.get("selected_target_ids") or []
        if str(target_id or "").strip()
    ]
    payload = CanonicalPayload(**_normalize_jv_canonical_payload(filtered_payload(Marketplace.XLJV, draft)))
    overrides = {
        "__product_editor_mode": "jv_batch_apply",
        **draft,
        "site_family": "JV",
        "site_keys": selected_target_ids,
    }
    baseline_site_key = str(draft.get("template_site_key") or draft.get("target_id") or "").strip().upper()
    return OrchestrateRequest(
        operation=Operation.UPDATE,
        payload=payload,
        channels=[
            ChannelTarget(
                marketplace=Marketplace.XLJV,
                site="JV",
                site_key=baseline_site_key or None,
                changed_fields=list(plan.get("changed_fields") or []),
                overrides=overrides,
            )
        ],
    )


def _normalize_jv_canonical_payload(payload: dict) -> dict:
    normalized = dict(payload or {})

    images = normalized.get("images")
    if isinstance(images, list):
        normalized["images"] = [
            str(
                image.get("image")
                if isinstance(image, dict)
                else image
            ).strip()
            for image in images
            if str(
                image.get("image")
                if isinstance(image, dict)
                else image
            ).strip()
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

    return normalized


def _plan_warnings_for_jv(*, changed_fields: list[str], target_ids: list[str]) -> list[ProductEditorWarning]:
    warnings = [
        ProductEditorWarning(
            code="product_editor_live_source_batch_apply",
            message="Apply will send a live JV source-site batch update through the orchestrator.",
            level=ProductEditorRiskLevel.HIGH,
        )
    ]
    if "JV_CO_UK" in target_ids:
        warnings.append(
            ProductEditorWarning(
                code="product_editor_translation_required",
                message="JV_CO_UK is included in update scope and may trigger translation handling.",
                level=ProductEditorRiskLevel.MEDIUM,
            )
        )
    if "images" in changed_fields:
        warnings.append(
            ProductEditorWarning(
                code="product_editor_jv_images_live_update",
                message="Image changes will be pushed to all found JV sites in the active tab.",
                level=ProductEditorRiskLevel.HIGH,
            )
        )
    return warnings


def _plan_risk_level_for_jv(*, changed_fields: list[str]) -> ProductEditorRiskLevel:
    if {"price", "quantity", "images", "descriptions", "jv_fields"} & set(changed_fields):
        return ProductEditorRiskLevel.HIGH
    return ProductEditorRiskLevel.MEDIUM


def _map_jv_batch_targets(batch_body: dict, *, request_id: str) -> list[dict]:
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
                    code=str(item.get("error_code") or "product_editor_jv_target_failed"),
                    message=str(item.get("error_text") or "JV target apply failed."),
                    request_id=request_id,
                    details={"domain": item.get("domain"), "status": status_value},
                ).model_dump(),
            }
        )
    return targets


def _extract_jv_batch_job_id(details) -> int | None:
    result = details.result
    if result is None or not result.results:
        return None
    channel_data = result.results[0].data
    job = channel_data.get("job") if isinstance(channel_data.get("job"), dict) else {}
    raw_id = job.get("id")
    try:
        batch_job_id = int(raw_id)
    except (TypeError, ValueError):
        return None
    return batch_job_id if batch_job_id > 0 else None


def _should_refresh_live_jv_batch(details) -> bool:
    if details.status in {JobStatus.QUEUED, JobStatus.RUNNING}:
        return True
    if details.status is not JobStatus.COMPLETED:
        return False
    result = details.result
    if result is None or not result.results:
        return False
    channel_data = result.results[0].data
    return _jv_batch_payload_is_nonterminal(channel_data)


def _jv_batch_payload_is_nonterminal(batch_body: dict) -> bool:
    if not isinstance(batch_body, dict):
        return False
    batch_summary = batch_body.get("summary") if isinstance(batch_body.get("summary"), dict) else {}
    job = batch_body.get("job") if isinstance(batch_body.get("job"), dict) else {}
    job_status = str(job.get("status") or "").strip().lower()
    if batch_summary:
        return False
    if job_status in {"pending", "queued", "running", "processing", "created"}:
        return True
    items = job.get("items") if isinstance(job.get("items"), list) else []
    terminal_item_statuses = {"applied", "failed", "skipped"}
    return any(str(item.get("status") or "").strip().lower() not in terminal_item_statuses for item in items if isinstance(item, dict))


def _map_live_jv_batch_job_response(*, orchestrator_job_id: str, request_id: str, batch_body: dict) -> ProductEditorJobResponse:
    job = batch_body.get("job") if isinstance(batch_body.get("job"), dict) else {}
    batch_status = str(job.get("status") or "").strip().lower()
    summary = job.get("result_summary") if isinstance(job.get("result_summary"), dict) else {}
    facade_status = _map_jv_batch_status(batch_status)
    failed_count = int(summary.get("failed") or 0) if isinstance(summary, dict) else 0
    if facade_status is JobStatus.COMPLETED and failed_count > 0:
        facade_status = JobStatus.FAILED
    mapped_summary = _map_live_jv_batch_summary(job=job)
    return ProductEditorJobResponse(
        request_id=request_id,
        job_id=orchestrator_job_id,
        status=facade_status,
        active_group=ProductEditorGroupId.JV,
        summary=mapped_summary,
        targets=_map_jv_batch_targets({"job": job}, request_id=request_id) if batch_status in {"applied", "failed"} else [],
        error=None,
    )


def _map_jv_batch_status(status: str) -> JobStatus:
    if status == "pending":
        return JobStatus.QUEUED
    if status == "running":
        return JobStatus.RUNNING
    if status == "applied":
        return JobStatus.COMPLETED
    if status == "failed":
        return JobStatus.FAILED
    return JobStatus.RUNNING


def _map_live_jv_batch_summary(*, job: dict) -> dict:
    summary = job.get("result_summary") if isinstance(job.get("result_summary"), dict) else {}
    items = job.get("items") if isinstance(job.get("items"), list) else []
    applied = int(summary.get("applied") or 0)
    skipped = int(summary.get("skipped") or 0)
    failed = int(summary.get("failed") or 0)
    return {
        "supported": True,
        "success": applied + skipped,
        "failed": failed,
        "total": int(summary.get("total") or len(items) or 0),
        "applied": applied,
        "skipped": skipped,
        "translation_used_sites": int(summary.get("translation_used_sites") or 0),
        "translation_error_sites": int(summary.get("translation_error_sites") or 0),
        "progress_phase": str(summary.get("progress_phase") or "").strip(),
        "progress_message": str(summary.get("progress_message") or "").strip(),
        "batch_job_id": job.get("id"),
    }


def _is_jv_product_editor_command(command: OrchestrateRequest) -> bool:
    if len(command.channels) != 1:
        return False
    channel = command.channels[0]
    if channel.marketplace is not Marketplace.XLJV:
        return False
    return str(channel.overrides.get("__product_editor_mode") or "").strip().lower() == "jv_batch_apply"


def _map_jv_orchestrator_summary(*, details) -> dict:
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
    targets = _map_jv_batch_targets(channel_result.data, request_id=details.request_id)
    success_count = sum(1 for target in targets if target["status"] == "success")
    failed_count = len(targets) - success_count
    if not targets and items:
        failed_count = len(items)
    return {"supported": True, "success": success_count, "failed": failed_count}


def _map_jv_orchestrator_targets(*, details, command: OrchestrateRequest, request_id: str) -> list[dict]:
    if details.status in {JobStatus.QUEUED, JobStatus.RUNNING}:
        return []
    result = details.result
    if result is None or not result.results:
        return []
    channel_result = result.results[0]
    targets = _map_jv_batch_targets(channel_result.data, request_id=request_id)
    if targets:
        return targets
    return [
        {
            "target_id": "JV_BATCH",
            "status": "success" if channel_result.status == "success" else "failed",
            "status_code": int(channel_result.status_code),
            "data": channel_result.data,
            "error": channel_result.error.model_dump() if channel_result.error is not None else None,
        }
    ]
