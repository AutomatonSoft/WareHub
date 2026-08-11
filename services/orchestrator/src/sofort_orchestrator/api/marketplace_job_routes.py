from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import JSONResponse

from ..application.marketplace_job_service import MarketplaceJobService
from ..domain.marketplace_job_models import (
    MarketplaceToggleCreateResponse,
    MarketplaceToggleJobResponse,
    MarketplaceToggleRequest,
)
from ..domain.models import ErrorContract, JobStatus
from ..infra.marketplace_job_store import SqliteMarketplaceJobStore


router = APIRouter()


class MarketplaceJobDeps:
    service: MarketplaceJobService | None = None
    store: SqliteMarketplaceJobStore | None = None


def get_marketplace_job_service() -> MarketplaceJobService:
    if MarketplaceJobDeps.service is None:
        raise RuntimeError("Marketplace job service dependency is not configured")
    return MarketplaceJobDeps.service


def get_marketplace_job_store() -> SqliteMarketplaceJobStore:
    if MarketplaceJobDeps.store is None:
        raise RuntimeError("Marketplace job store dependency is not configured")
    return MarketplaceJobDeps.store


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


@router.post("/api/v1/orchestrator/marketplace/toggle-by-kid")
def create_marketplace_toggle_job(
    body: MarketplaceToggleRequest,
    request: Request,
    response: Response,
    store: SqliteMarketplaceJobStore = Depends(get_marketplace_job_store),
    _service: MarketplaceJobService = Depends(get_marketplace_job_service),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
    x_warehub_actor_login: str | None = Header(default=None, alias="X-WareHub-Actor-Login"),
    x_warehub_actor_name: str | None = Header(default=None, alias="X-WareHub-Actor-Name"),
) -> MarketplaceToggleCreateResponse:
    request_id = _request_id(request, x_request_id)
    response.headers["X-Request-Id"] = request_id
    kid_number = body.kid_number.strip()
    if not kid_number:
        return _error_response(
            status_code=400,
            request_id=request_id,
            code="marketplace_toggle_kid_number_empty",
            message="kid_number must be non-empty",
        )
    job_id = str(uuid.uuid4())
    place = body.place.strip() if isinstance(body.place, str) else ""
    store.create_job(
        job_id=job_id,
        request_id=request_id,
        kid_number=kid_number,
        inactive=body.inactive,
        place=place or None,
        workspace=body.workspace,
        actor_login=(x_warehub_actor_login or "").strip() or None,
        actor_name=(x_warehub_actor_name or "").strip() or None,
    )
    return MarketplaceToggleCreateResponse(
        job_id=job_id,
        request_id=request_id,
        status=JobStatus.QUEUED,
        workspace=body.workspace,
    )


@router.get("/api/v1/orchestrator/marketplace/jobs/{job_id}")
def get_marketplace_toggle_job(
    job_id: str,
    request: Request,
    response: Response,
    store: SqliteMarketplaceJobStore = Depends(get_marketplace_job_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> MarketplaceToggleJobResponse:
    request_id = _request_id(request, x_request_id)
    response.headers["X-Request-Id"] = request_id
    clean_job_id = job_id.strip()
    if not clean_job_id:
        return _error_response(
            status_code=400,
            request_id=request_id,
            code="marketplace_toggle_job_id_empty",
            message="job_id must be non-empty",
        )
    payload = store.get_job(job_id=clean_job_id)
    if payload is None:
        return _error_response(
            status_code=404,
            request_id=request_id,
            code="marketplace_toggle_job_not_found",
            message="Marketplace toggle job not found",
            details={"job_id": clean_job_id},
        )
    return payload
