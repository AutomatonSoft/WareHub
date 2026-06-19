from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import JSONResponse

from ..application.product_editor_service import ProductEditorService, ProductEditorServiceError
from ..domain.models import ErrorContract
from ..domain.product_editor_models import (
    ProductEditorApplyRequest,
    ProductEditorApplyResponse,
    ProductEditorDiscoverRequest,
    ProductEditorDiscoverResponse,
    ProductEditorGroupId,
    ProductEditorJobResponse,
    ProductEditorLoadRequest,
    ProductEditorLoadResponse,
    ProductEditorPlanRequest,
    ProductEditorPlanResponse,
)


router = APIRouter()
_SUPPORTED_GROUPS = {ProductEditorGroupId.HOOD, ProductEditorGroupId.JV}


class ProductEditorDeps:
    service: ProductEditorService | None = None


def get_product_editor_service() -> ProductEditorService:
    if ProductEditorDeps.service is None:
        raise RuntimeError("Product Editor service dependency is not configured")
    return ProductEditorDeps.service


def _request_id(request: Request, x_request_id: str | None) -> str:
    return getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))


def _error_response(
    *,
    status_code: int,
    request_id: str,
    code: str,
    message: str,
    details: dict | None = None,
) -> JSONResponse:
    payload = ErrorContract(
        code=code,
        message=message,
        request_id=request_id,
        details=details or {},
    ).model_dump()
    return JSONResponse(status_code=status_code, content=payload, headers={"X-Request-Id": request_id})


@router.post("/api/v1/orchestrator/product-editor/discover")
def product_editor_discover(
    body: ProductEditorDiscoverRequest,
    request: Request,
    response: Response,
    service: ProductEditorService = Depends(get_product_editor_service),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> ProductEditorDiscoverResponse:
    request_id = _request_id(request, x_request_id)
    response.headers["X-Request-Id"] = request_id
    ean = body.ean.strip()
    if not ean:
        return _error_response(
            status_code=400,
            request_id=request_id,
            code="product_editor_ean_empty",
            message="EAN must be non-empty",
        )

    return service.discover(ean=ean, request_id=request_id, active_group=body.active_group)


@router.post("/api/v1/orchestrator/product-editor/load")
def product_editor_load(
    body: ProductEditorLoadRequest,
    request: Request,
    response: Response,
    service: ProductEditorService = Depends(get_product_editor_service),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> ProductEditorLoadResponse:
    request_id = _request_id(request, x_request_id)
    response.headers["X-Request-Id"] = request_id
    if not body.ean.strip():
        return _error_response(
            status_code=400,
            request_id=request_id,
            code="product_editor_ean_empty",
            message="EAN must be non-empty",
        )
    if body.active_group not in _SUPPORTED_GROUPS:
        return _error_response(
            status_code=501,
            request_id=request_id,
            code="product_editor_group_not_supported_yet",
            message="Requested Product Editor group is not supported yet",
            details={"active_group": body.active_group.value},
        )
    try:
        return service.load(
            ean=body.ean.strip(),
            request_id=request_id,
            active_group=body.active_group,
            baseline_target_id=body.baseline_target_id,
        )
    except ProductEditorServiceError as exc:
        return _error_response(status_code=exc.status_code, request_id=request_id, code=exc.code, message=exc.message, details=exc.details)


@router.post("/api/v1/orchestrator/product-editor/plan")
def product_editor_plan(
    body: ProductEditorPlanRequest,
    request: Request,
    response: Response,
    service: ProductEditorService = Depends(get_product_editor_service),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> ProductEditorPlanResponse:
    request_id = _request_id(request, x_request_id)
    response.headers["X-Request-Id"] = request_id
    if not body.ean.strip():
        return _error_response(
            status_code=400,
            request_id=request_id,
            code="product_editor_ean_empty",
            message="EAN must be non-empty",
        )
    if body.active_group not in _SUPPORTED_GROUPS:
        return _error_response(
            status_code=501,
            request_id=request_id,
            code="product_editor_group_not_supported_yet",
            message="Requested Product Editor group is not supported yet",
            details={"active_group": body.active_group.value},
        )
    try:
        return service.plan(
            ean=body.ean.strip(),
            request_id=request_id,
            active_group=body.active_group,
            changed_fields=body.changed_fields,
            draft=body.draft,
            selected_target_ids=body.selected_target_ids,
        )
    except ProductEditorServiceError as exc:
        return _error_response(status_code=exc.status_code, request_id=request_id, code=exc.code, message=exc.message, details=exc.details)


@router.post("/api/v1/orchestrator/product-editor/apply")
def product_editor_apply(
    body: ProductEditorApplyRequest,
    request: Request,
    response: Response,
    service: ProductEditorService = Depends(get_product_editor_service),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> ProductEditorApplyResponse:
    request_id = _request_id(request, x_request_id)
    response.headers["X-Request-Id"] = request_id
    if not body.plan_id.strip():
        return _error_response(
            status_code=400,
            request_id=request_id,
            code="product_editor_plan_id_empty",
            message="plan_id must be non-empty",
        )
    if not body.confirmation:
        return _error_response(
            status_code=400,
            request_id=request_id,
            code="product_editor_confirmation_required",
            message="Apply requires explicit confirmation",
        )
    try:
        return service.apply(plan_id=body.plan_id.strip(), request_id=request_id)
    except ProductEditorServiceError as exc:
        return _error_response(status_code=exc.status_code, request_id=request_id, code=exc.code, message=exc.message, details=exc.details)


@router.get("/api/v1/orchestrator/product-editor/jobs/{job_id}")
def product_editor_job_status(
    job_id: str,
    request: Request,
    response: Response,
    service: ProductEditorService = Depends(get_product_editor_service),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> ProductEditorJobResponse:
    request_id = _request_id(request, x_request_id)
    response.headers["X-Request-Id"] = request_id
    if not job_id.strip():
        return _error_response(
            status_code=400,
            request_id=request_id,
            code="product_editor_job_id_empty",
            message="job_id must be non-empty",
        )
    try:
        return service.get_job(job_id=job_id.strip(), request_id=request_id)
    except ProductEditorServiceError as exc:
        return _error_response(status_code=exc.status_code, request_id=request_id, code=exc.code, message=exc.message, details=exc.details)
