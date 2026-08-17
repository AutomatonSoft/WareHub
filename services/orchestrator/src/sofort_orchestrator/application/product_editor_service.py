from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from ..domain.product_editor_models import (
    ProductEditorDiscoverResponse,
    ProductEditorGroupId,
    ProductEditorJobResponse,
    ProductEditorLoadResponse,
    ProductEditorTargetStatus,
    ProductEditorWarning,
)
from ..domain.product_editor_registry import build_product_editor_groups
from ..infra.product_editor_gateway import ProductEditorGateway
from ..infra.job_store import SqliteJobStore
from ..infra.product_editor_store import SqliteProductEditorStore
from ..infra.http_client import RetryExhaustedError
from .product_editor_hood_flow import ProductEditorHoodFlow, ProductEditorHoodFlowError
from .product_editor_jv_flow import ProductEditorJvFlow, ProductEditorJvFlowError
from .product_editor_kaufland_flow import ProductEditorKauflandFlow, ProductEditorKauflandFlowError
from .product_editor_otto_flow import ProductEditorOttoFlow, ProductEditorOttoFlowError
from .product_editor_xl_flow import ProductEditorXlFlow, ProductEditorXlFlowError


class ProductEditorService:
    def __init__(self, *, gateway: ProductEditorGateway, store: SqliteProductEditorStore, orchestrator_job_store: SqliteJobStore) -> None:
        self.gateway = gateway
        self.store = store
        self.hood_flow = ProductEditorHoodFlow(gateway=gateway, store=store)
        self.jv_flow = ProductEditorJvFlow(gateway=gateway, store=store, orchestrator_job_store=orchestrator_job_store)
        self.kaufland_flow = ProductEditorKauflandFlow(gateway=gateway, store=store)
        self.otto_flow = ProductEditorOttoFlow(gateway=gateway, store=store, orchestrator_job_store=orchestrator_job_store)
        self.xl_flow = ProductEditorXlFlow(gateway=gateway, store=store, orchestrator_job_store=orchestrator_job_store)

    def discover(self, *, ean: str, request_id: str, active_group: ProductEditorGroupId | None = None) -> ProductEditorDiscoverResponse:
        groups = build_product_editor_groups()
        if active_group is None:
            with ThreadPoolExecutor(max_workers=5, thread_name_prefix="product-editor-discover") as executor:
                hood_future = executor.submit(self.hood_flow.discover_targets, ean=ean, request_id=request_id)
                jv_future = executor.submit(self.jv_flow.discover_targets, ean=ean, request_id=request_id)
                kaufland_future = executor.submit(self.kaufland_flow.discover_targets, ean=ean, request_id=request_id)
                otto_future = executor.submit(self.otto_flow.discover_targets, ean=ean, request_id=request_id)
                xl_future = executor.submit(self.xl_flow.discover_targets, ean=ean, request_id=request_id)
                hood_results = hood_future.result()
                jv_results = jv_future.result()
                kaufland_results = kaufland_future.result()
                otto_results = otto_future.result()
                xl_results = xl_future.result()
        else:
            hood_results = self.hood_flow.discover_targets(ean=ean, request_id=request_id) if active_group is ProductEditorGroupId.HOOD else {}
            jv_results = self.jv_flow.discover_targets(ean=ean, request_id=request_id) if active_group is ProductEditorGroupId.JV else {}
            kaufland_results = self.kaufland_flow.discover_targets(ean=ean, request_id=request_id) if active_group is ProductEditorGroupId.KAUFLAND else {}
            otto_results = self.otto_flow.discover_targets(ean=ean, request_id=request_id) if active_group is ProductEditorGroupId.OTTO else {}
            xl_results = self.xl_flow.discover_targets(ean=ean, request_id=request_id) if active_group is ProductEditorGroupId.XL else {}

        hood_found_target_ids: list[str] = []
        jv_found_target_ids: list[str] = []
        kaufland_found_target_ids: list[str] = []
        xl_found_target_ids: list[str] = []
        otto_found_target_ids: list[str] = []
        for group in groups:
            current_results = (
                hood_results if group.id is ProductEditorGroupId.HOOD
                else jv_results if group.id is ProductEditorGroupId.JV
                else kaufland_results if group.id is ProductEditorGroupId.KAUFLAND
                else otto_results if group.id is ProductEditorGroupId.OTTO
                else xl_results if group.id is ProductEditorGroupId.XL
                else None
            )
            if current_results is None:
                continue
            for target in group.targets:
                state = current_results.get(target.id)
                if state is None:
                    continue
                target.status = state["status"]
                target.metadata = state["metadata"]
                target.warnings.extend(state["warnings"])
                if target.status is ProductEditorTargetStatus.FOUND:
                    if group.id is ProductEditorGroupId.HOOD:
                        hood_found_target_ids.append(target.id)
                    if group.id is ProductEditorGroupId.JV:
                        jv_found_target_ids.append(target.id)
                    if group.id is ProductEditorGroupId.KAUFLAND:
                        kaufland_found_target_ids.append(target.id)
                    if group.id is ProductEditorGroupId.XL:
                        xl_found_target_ids.append(target.id)
                    if group.id is ProductEditorGroupId.OTTO:
                        otto_found_target_ids.append(target.id)

        warnings = [
            ProductEditorWarning(
                code="product_editor_hood_first_rollout",
                message="HOOD remains the first fully active Product Editor flow, while JV is now available through the same orchestrator facade.",
            )
        ]
        if active_group is ProductEditorGroupId.JV:
            selected_group_id = ProductEditorGroupId.JV
        elif active_group is ProductEditorGroupId.XL:
            selected_group_id = ProductEditorGroupId.XL
        elif active_group is ProductEditorGroupId.HOOD:
            selected_group_id = ProductEditorGroupId.HOOD
        elif active_group is ProductEditorGroupId.KAUFLAND:
            selected_group_id = ProductEditorGroupId.KAUFLAND
        elif active_group is ProductEditorGroupId.OTTO:
            selected_group_id = ProductEditorGroupId.OTTO
        else:
            selected_group_id = ProductEditorGroupId.HOOD if hood_found_target_ids else ProductEditorGroupId.JV if jv_found_target_ids else ProductEditorGroupId.HOOD
        selected_target_ids = (
            hood_found_target_ids if selected_group_id is ProductEditorGroupId.HOOD
            else jv_found_target_ids if selected_group_id is ProductEditorGroupId.JV
            else kaufland_found_target_ids if selected_group_id is ProductEditorGroupId.KAUFLAND
            else otto_found_target_ids if selected_group_id is ProductEditorGroupId.OTTO
            else xl_found_target_ids
        )
        if selected_group_id is ProductEditorGroupId.HOOD:
            recommended_baseline = hood_found_target_ids[0] if hood_found_target_ids else None
        elif selected_group_id is ProductEditorGroupId.XL:
            recommended_baseline = self.xl_flow.recommended_baseline_from_results(xl_results) or "XLMOEBEL_DE"
        elif selected_group_id is ProductEditorGroupId.KAUFLAND:
            recommended_baseline = kaufland_found_target_ids[0] if kaufland_found_target_ids else None
        elif selected_group_id is ProductEditorGroupId.OTTO:
            recommended_baseline = otto_found_target_ids[0] if otto_found_target_ids else None
        else:
            recommended_baseline = self.jv_flow.recommended_baseline_from_results(jv_results) or "JV_DE"
        if active_group is ProductEditorGroupId.XL:
            groups = [
                group.model_copy(update={"targets": [target for target in group.targets if target.id == "XLMOEBEL_DE"]})
                if group.id is ProductEditorGroupId.XL
                else group
                for group in groups
                if group.id is ProductEditorGroupId.XL
            ]
        if active_group is ProductEditorGroupId.KAUFLAND:
            groups = [group for group in groups if group.id is ProductEditorGroupId.KAUFLAND]
        if active_group is ProductEditorGroupId.OTTO:
            groups = [group for group in groups if group.id is ProductEditorGroupId.OTTO]
        return ProductEditorDiscoverResponse(
            request_id=request_id,
            ean=ean,
            groups=groups,
            recommended_baseline_target_id=recommended_baseline,
            selected_group_id=selected_group_id,
            selected_target_ids=selected_target_ids,
            warnings=warnings,
        )

    def load(
        self,
        *,
        ean: str,
        request_id: str,
        active_group: ProductEditorGroupId,
        baseline_target_id: str | None,
        publishing_target_id: str | None = None,
    ) -> ProductEditorLoadResponse:
        try:
            if active_group is ProductEditorGroupId.HOOD:
                return self.hood_flow.load(ean=ean, request_id=request_id, baseline_target_id=baseline_target_id)
            if active_group is ProductEditorGroupId.JV:
                return self.jv_flow.load(
                    ean=ean,
                    request_id=request_id,
                    baseline_target_id=baseline_target_id,
                    publishing_target_id=publishing_target_id,
                )
            if active_group is ProductEditorGroupId.XL:
                return self.xl_flow.load(ean=ean, request_id=request_id, baseline_target_id=baseline_target_id)
            if active_group is ProductEditorGroupId.KAUFLAND:
                return self.kaufland_flow.load(ean=ean, request_id=request_id, baseline_target_id=baseline_target_id)
            if active_group is ProductEditorGroupId.OTTO:
                return self.otto_flow.load(ean=ean, request_id=request_id, baseline_target_id=baseline_target_id)
        except RetryExhaustedError as exc:
            raise _map_retry_exhausted_error(exc) from exc
        except (ProductEditorHoodFlowError, ProductEditorJvFlowError, ProductEditorXlFlowError, ProductEditorKauflandFlowError, ProductEditorOttoFlowError) as exc:
            raise ProductEditorServiceError(exc.code, exc.message, exc.status_code, details=exc.details) from exc
        raise ProductEditorServiceError(
            "product_editor_group_not_supported_yet",
            "Requested Product Editor group is not supported yet",
            501,
            details={"active_group": active_group.value},
        )

    def plan(
        self,
        *,
        ean: str,
        request_id: str,
        active_group: ProductEditorGroupId,
        changed_fields: list[str],
        draft: dict,
        selected_target_ids: list[str],
    ):
        try:
            if active_group is ProductEditorGroupId.HOOD:
                return self.hood_flow.plan(
                    ean=ean,
                    request_id=request_id,
                    changed_fields=changed_fields,
                    draft=draft,
                    selected_target_ids=selected_target_ids,
                )
            if active_group is ProductEditorGroupId.JV:
                return self.jv_flow.plan(
                    ean=ean,
                    request_id=request_id,
                    changed_fields=changed_fields,
                    draft=draft,
                    selected_target_ids=selected_target_ids,
                )
            if active_group is ProductEditorGroupId.XL:
                return self.xl_flow.plan(
                    ean=ean,
                    request_id=request_id,
                    changed_fields=changed_fields,
                    draft=draft,
                    selected_target_ids=selected_target_ids,
                )
            if active_group is ProductEditorGroupId.KAUFLAND:
                return self.kaufland_flow.plan(ean=ean, request_id=request_id, changed_fields=changed_fields, draft=draft, selected_target_ids=selected_target_ids)
            if active_group is ProductEditorGroupId.OTTO:
                return self.otto_flow.plan(ean=ean, request_id=request_id, changed_fields=changed_fields, draft=draft, selected_target_ids=selected_target_ids)
        except RetryExhaustedError as exc:
            raise _map_retry_exhausted_error(exc) from exc
        except (ProductEditorHoodFlowError, ProductEditorJvFlowError, ProductEditorXlFlowError, ProductEditorKauflandFlowError, ProductEditorOttoFlowError) as exc:
            raise ProductEditorServiceError(exc.code, exc.message, exc.status_code, details=exc.details) from exc
        raise ProductEditorServiceError(
            "product_editor_group_not_supported_yet",
            "Requested Product Editor group is not supported yet",
            501,
            details={"active_group": active_group.value},
        )

    def apply(self, *, plan_id: str, request_id: str):
        plan = self.store.get_plan(plan_id=plan_id)
        if plan is None:
            raise ProductEditorServiceError("product_editor_plan_not_found", "Product Editor plan was not found.", 404, details={"plan_id": plan_id})
        try:
            if plan["active_group"] is ProductEditorGroupId.HOOD:
                return self.hood_flow.apply(plan_id=plan_id, request_id=request_id)
            if plan["active_group"] is ProductEditorGroupId.JV:
                return self.jv_flow.apply(plan_id=plan_id, request_id=request_id)
            if plan["active_group"] is ProductEditorGroupId.XL:
                return self.xl_flow.apply(plan_id=plan_id, request_id=request_id)
            if plan["active_group"] is ProductEditorGroupId.KAUFLAND:
                return self.kaufland_flow.apply(plan_id=plan_id, request_id=request_id)
            if plan["active_group"] is ProductEditorGroupId.OTTO:
                return self.otto_flow.apply(plan_id=plan_id, request_id=request_id)
        except RetryExhaustedError as exc:
            raise _map_retry_exhausted_error(exc) from exc
        except (ProductEditorHoodFlowError, ProductEditorJvFlowError, ProductEditorXlFlowError, ProductEditorKauflandFlowError, ProductEditorOttoFlowError) as exc:
            raise ProductEditorServiceError(exc.code, exc.message, exc.status_code, details=exc.details) from exc
        raise ProductEditorServiceError(
            "product_editor_group_not_supported_yet",
            "Requested Product Editor group is not supported yet",
            501,
            details={"active_group": plan["active_group"].value},
        )

    def execute_queued_job(self, *, job_id: str) -> None:
        job = self.store.get_job(job_id=job_id)
        if job is None:
            raise ProductEditorServiceError("product_editor_job_not_found", "Product Editor job was not found.", 404, details={"job_id": job_id})
        if job["active_group"] is ProductEditorGroupId.HOOD:
            self.hood_flow.execute_job(job_id=job_id)
            return
        if job["active_group"] is ProductEditorGroupId.KAUFLAND:
            self.kaufland_flow.execute_job(job_id=job_id)
            return
        raise ProductEditorServiceError(
            "product_editor_job_not_queueable",
            "Product Editor job is handled by a different worker.",
            409,
            details={"job_id": job_id, "active_group": job["active_group"].value},
        )

    def list_jobs(self, *, request_id: str, limit: int, offset: int = 0, query: str = "") -> list[ProductEditorJobResponse]:
        return [
            ProductEditorJobResponse(
                request_id=request_id,
                job_id=job["job_id"],
                ean=job["ean"],
                status=job["status"],
                active_group=job["active_group"],
                summary=job["summary"],
                targets=job["targets"],
                error=job["error"],
                created_at_unix_ms=job["created_at_unix_ms"],
                updated_at_unix_ms=job["updated_at_unix_ms"],
            )
            for job in self.store.list_jobs(limit=limit, offset=offset, query=query)
        ]

    def get_job(self, *, job_id: str, request_id: str) -> ProductEditorJobResponse:
        job = self.store.get_job(job_id=job_id)
        if job is None:
            try:
                return self.jv_flow.get_job(job_id=job_id, request_id=request_id)
            except ProductEditorJvFlowError:
                try:
                    return self.xl_flow.get_job(job_id=job_id, request_id=request_id)
                except ProductEditorXlFlowError as exc:
                    try:
                        return self.kaufland_flow.get_job(job_id=job_id, request_id=request_id)
                    except ProductEditorKauflandFlowError:
                        try:
                            return self.otto_flow.get_job(job_id=job_id, request_id=request_id)
                        except ProductEditorOttoFlowError:
                            raise ProductEditorServiceError(exc.code, exc.message, exc.status_code, details=exc.details) from exc
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


class ProductEditorServiceError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int, details: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def _map_retry_exhausted_error(exc: RetryExhaustedError) -> ProductEditorServiceError:
    if exc.kind == "timeout":
        return ProductEditorServiceError(
            "product_editor_upstream_timeout",
            "Product Editor upstream request timed out.",
            504,
            details={"kind": exc.kind},
        )
    return ProductEditorServiceError(
        "product_editor_upstream_unavailable",
        "Product Editor upstream service is unavailable.",
        502,
        details={"kind": exc.kind},
    )
