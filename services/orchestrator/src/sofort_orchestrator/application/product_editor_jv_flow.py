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


_JV_PRIORITY = ["JV_DE", "JV_CH", "JV_AT", "JV_CO_UK"]
_JV_TEXTUAL_FIELDS = {"descriptions", "jv_fields"}


class ProductEditorJvFlow:
    def __init__(self, *, gateway: ProductEditorGateway, store: SqliteProductEditorStore) -> None:
        self.gateway = gateway
        self.store = store

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
        for site_key in _JV_PRIORITY:
            if site_key == "JV_CO_UK":
                continue
            if results.get(site_key, {}).get("status") is ProductEditorTargetStatus.FOUND:
                return site_key
        if results.get("JV_CO_UK", {}).get("status") is ProductEditorTargetStatus.FOUND:
            return "JV_CO_UK"
        return None

    def load(self, *, ean: str, request_id: str, baseline_target_id: str | None) -> ProductEditorLoadResponse:
        baseline_site_key = self._resolve_baseline_site_key(ean=ean, request_id=request_id, preferred_target_id=baseline_target_id)
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

        found_target_ids = self._found_target_ids(ean=ean, request_id=request_id)
        target_ids = [target_id for target_id in selected_target_ids if target_id in found_target_ids] if selected_target_ids else found_target_ids
        if not target_ids:
            raise ProductEditorJvFlowError("product_editor_no_found_targets", "No found JV targets are available for this EAN.", 409)

        baseline_site_key = self._resolve_baseline_site_key(ean=ean, request_id=request_id, preferred_target_id=str(draft.get("target_id") or "").strip() or None)
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
        self.store.create_job(
            job_id=job_id,
            request_id=request_id,
            plan_id=plan_id,
            ean=plan["ean"],
            active_group=plan["active_group"],
        )
        self.store.mark_running(job_id=job_id)

        batch = self.gateway.apply_jv_batch_by_ean(ean=plan["ean"], request_id=request_id, payload=plan["draft"])
        if not (200 <= batch.status_code < 300):
            error = ErrorContract(
                code=str(batch.body.get("code") or "product_editor_jv_batch_apply_failed"),
                message="JV batch apply failed.",
                request_id=request_id,
                details={"upstream_status_code": batch.status_code, "upstream_response": batch.body},
            )
            summary = {"supported": True, "success": 0, "failed": len(plan["selected_target_ids"])}
            self.store.mark_failed(job_id=job_id, summary=summary, targets=[], error=error)
            return ProductEditorApplyResponse(
                request_id=request_id,
                job_id=job_id,
                status=JobStatus.FAILED,
                active_group=ProductEditorGroupId.JV,
                accepted=False,
            )

        targets = _map_jv_batch_targets(batch.body, request_id=request_id)
        success_count = sum(1 for target in targets if target["status"] == "success")
        failed_count = len(targets) - success_count
        summary = {
            "supported": True,
            "success": success_count,
            "failed": failed_count,
            "applied": batch.body.get("summary", {}).get("applied", 0),
            "skipped": batch.body.get("summary", {}).get("skipped", 0),
            "translation_used_sites": batch.body.get("summary", {}).get("translation_used_sites", 0),
            "translation_error_sites": batch.body.get("summary", {}).get("translation_error_sites", 0),
        }
        if failed_count == 0:
            self.store.mark_completed(job_id=job_id, summary=summary, targets=targets)
            return ProductEditorApplyResponse(
                request_id=request_id,
                job_id=job_id,
                status=JobStatus.COMPLETED,
                active_group=ProductEditorGroupId.JV,
                accepted=True,
            )

        error = ErrorContract(
            code="product_editor_apply_partial_failure",
            message="One or more JV targets failed during Product Editor apply.",
            request_id=request_id,
            details={"job_id": job_id, "failed_targets": failed_count},
        )
        self.store.mark_failed(job_id=job_id, summary=summary, targets=targets, error=error)
        return ProductEditorApplyResponse(
            request_id=request_id,
            job_id=job_id,
            status=JobStatus.FAILED,
            active_group=ProductEditorGroupId.JV,
            accepted=False,
        )

    def get_job(self, *, job_id: str, request_id: str) -> ProductEditorJobResponse:
        job = self.store.get_job(job_id=job_id)
        if job is None:
            raise ProductEditorJvFlowError("product_editor_job_not_found", "Product Editor job was not found.", 404, details={"job_id": job_id})
        return ProductEditorJobResponse(
            request_id=request_id,
            job_id=job_id,
            status=job["status"],
            active_group=job["active_group"],
            summary=job["summary"],
            targets=job["targets"],
            error=job["error"],
        )

    def _resolve_baseline_site_key(self, *, ean: str, request_id: str, preferred_target_id: str | None) -> str | None:
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
