from __future__ import annotations

import hashlib
import json
import logging
import time
import uuid
from collections import deque

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import JSONResponse

from ..application.orchestrator_service import OrchestratorService
from .product_editor_routes import router as product_editor_router
from ..domain.models import (
    BatchJobStatusItem,
    BatchJobStatusRequest,
    BatchJobStatusResponse,
    BatchCreateJobRequest,
    BatchCreateJobResponse,
    BatchCreateJobResult,
    CreateJobRequest,
    CreateJobResponse,
    ErrorContract,
    JobPriority,
    JobStatus,
    Operation,
    OrchestrateRequest,
    ReconciliationRequest,
    ReconciliationResponse,
)
from ..infra.idempotency import SqliteIdempotencyStore
from ..infra.job_store import SqliteJobStore
from ..infra.metrics import InMemoryMetrics
from ..infra.settings import settings


router = APIRouter()
router.include_router(product_editor_router)
logger = logging.getLogger("sofort_orchestrator")
_JOB_INTAKE_TIMESTAMPS_MS = deque()
_JOB_INTAKE_PRIORITY_TIMESTAMPS_MS = {
    JobPriority.URGENT: deque(),
    JobPriority.NORMAL: deque(),
    JobPriority.BACKGROUND: deque(),
}


class Deps:
    service: OrchestratorService | None = None
    idempotency_store: SqliteIdempotencyStore | None = None
    job_store: SqliteJobStore | None = None
    metrics: InMemoryMetrics | None = None


def get_service() -> OrchestratorService:
    if Deps.service is None:
        raise RuntimeError("Service dependency is not configured")
    return Deps.service


def get_idempotency_store() -> SqliteIdempotencyStore:
    if Deps.idempotency_store is None:
        raise RuntimeError("Idempotency store dependency is not configured")
    return Deps.idempotency_store


def get_metrics() -> InMemoryMetrics:
    if Deps.metrics is None:
        raise RuntimeError("Metrics dependency is not configured")
    return Deps.metrics


def get_job_store() -> SqliteJobStore:
    if Deps.job_store is None:
        raise RuntimeError("Job store dependency is not configured")
    return Deps.job_store


@router.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


@router.get("/readyz")
def readyz(idempotency_store: SqliteIdempotencyStore = Depends(get_idempotency_store)):
    try:
        idempotency_store.ping()
        return {"status": "ready"}
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"status": "not_ready", "reason": str(exc)})


@router.get("/metrics")
def metrics(
    idempotency_store: SqliteIdempotencyStore = Depends(get_idempotency_store),
    app_metrics: InMemoryMetrics = Depends(get_metrics),
    service: OrchestratorService = Depends(get_service),
) -> dict:
    circuit_breaker_metrics = (
        service.circuit_breaker.snapshot()
        if service.circuit_breaker is not None
        else {"enabled": False, "tracked_channels_total": 0, "open_channels_total": 0, "open_channels": []}
    )
    return {
        **app_metrics.snapshot(),
        "database_pool_metrics": idempotency_store.metrics(),
        "job_store_metrics": Deps.job_store.metrics() if Deps.job_store is not None else {"enabled": False},
        "circuit_breaker_metrics": circuit_breaker_metrics,
    }


@router.post("/api/v1/orchestrator/products/{ean}/update")
def orchestrate_update(
    ean: str,
    command: OrchestrateRequest,
    request: Request,
    response: Response,
    service: OrchestratorService = Depends(get_service),
    idempotency_store: SqliteIdempotencyStore = Depends(get_idempotency_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    request_id = getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))
    response.headers["X-Request-Id"] = request_id

    if not ean.strip():
        err = ErrorContract(
            code="orchestrator_ean_empty",
            message="EAN must be non-empty",
            request_id=request_id,
            details={},
        )
        return JSONResponse(status_code=400, content=err.model_dump())

    replay_key = (idempotency_key or "").strip()
    if replay_key:
        cached = idempotency_store.get(replay_key)
        if cached is not None:
            return cached

    result = service.execute(ean=ean.strip(), request_id=request_id, command=command)
    payload = result.model_dump()
    logger.info(
        "audit_event=orchestrator_update ean=%s request_id=%s status=%s channels=%d",
        ean.strip(),
        request_id,
        payload["status"],
        len(payload["results"]),
    )
    if replay_key:
        idempotency_store.put(replay_key, payload)
    return payload


@router.post("/api/v1/orchestrator/jobs")
def create_orchestrator_job(
    body: CreateJobRequest,
    request: Request,
    response: Response,
    job_store: SqliteJobStore = Depends(get_job_store),
    idempotency_store: SqliteIdempotencyStore = Depends(get_idempotency_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    request_id = getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))
    response.headers["X-Request-Id"] = request_id
    replay_key = _single_replay_key(idempotency_key=idempotency_key, body=body)
    if replay_key is not None:
        cached = idempotency_store.get(replay_key)
        if cached is not None:
            return cached
    if not _try_consume_job_intake_slots([body.priority]):
        err = ErrorContract(
            code="orchestrator_jobs_rate_limited",
            message="Job intake rate limit exceeded",
            request_id=request_id,
            details={
                "window_seconds": settings.job_intake_rate_limit_window_seconds,
                "max_jobs": settings.job_intake_rate_limit_max_jobs,
            },
        )
        return JSONResponse(status_code=429, content=err.model_dump())

    ean = body.ean.strip()
    if not ean:
        err = ErrorContract(
            code="orchestrator_ean_empty",
            message="EAN must be non-empty",
            request_id=request_id,
            details={},
        )
        return JSONResponse(status_code=400, content=err.model_dump())
    scheduled_at_unix_ms = body.scheduled_at_unix_ms
    if scheduled_at_unix_ms is not None and scheduled_at_unix_ms < int(time.time() * 1000):
        err = ErrorContract(
            code="orchestrator_job_scheduled_in_past",
            message="scheduled_at_unix_ms must be in the future",
            request_id=request_id,
            details={"scheduled_at_unix_ms": scheduled_at_unix_ms},
        )
        return JSONResponse(status_code=400, content=err.model_dump())

    job_id = str(uuid.uuid4())
    job_store.create_job(
        job_id=job_id,
        request_id=request_id,
        ean=ean,
        command=body.command,
        scheduled_at_unix_ms=scheduled_at_unix_ms,
        priority=body.priority,
    )
    payload = CreateJobResponse(job_id=job_id, request_id=request_id, status=JobStatus.QUEUED).model_dump()
    if replay_key is not None:
        idempotency_store.put(replay_key, payload)
    return payload


@router.post("/api/v1/orchestrator/jobs/batch")
def create_orchestrator_jobs_batch(
    body: BatchCreateJobRequest,
    request: Request,
    response: Response,
    job_store: SqliteJobStore = Depends(get_job_store),
    idempotency_store: SqliteIdempotencyStore = Depends(get_idempotency_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    request_id = getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))
    response.headers["X-Request-Id"] = request_id
    replay_key = _batch_replay_key(idempotency_key=idempotency_key, body=body)
    if replay_key is not None:
        cached = idempotency_store.get(replay_key)
        if cached is not None:
            return cached
    if len(body.items) > settings.jobs_batch_max_items:
        err = ErrorContract(
            code="orchestrator_jobs_batch_too_large",
            message="Batch size exceeds configured limit",
            request_id=request_id,
            details={"max_items": settings.jobs_batch_max_items, "received_items": len(body.items)},
        )
        return JSONResponse(status_code=400, content=err.model_dump())
    if not _try_consume_job_intake_slots([item.priority for item in body.items]):
        err = ErrorContract(
            code="orchestrator_jobs_rate_limited",
            message="Job intake rate limit exceeded",
            request_id=request_id,
            details={
                "window_seconds": settings.job_intake_rate_limit_window_seconds,
                "max_jobs": settings.job_intake_rate_limit_max_jobs,
                "requested_jobs": len(body.items),
            },
        )
        return JSONResponse(status_code=429, content=err.model_dump())

    results: list[BatchCreateJobResult] = []
    for item in body.items:
        ean = item.ean.strip()
        if not ean:
            results.append(
                BatchCreateJobResult(
                    ean=item.ean,
                    status="failed",
                    error=ErrorContract(
                        code="orchestrator_ean_empty",
                        message="EAN must be non-empty",
                        request_id=request_id,
                        details={},
                    ),
                )
            )
            continue
        if item.scheduled_at_unix_ms is not None and item.scheduled_at_unix_ms < int(time.time() * 1000):
            results.append(
                BatchCreateJobResult(
                    ean=ean,
                    status="failed",
                    error=ErrorContract(
                        code="orchestrator_job_scheduled_in_past",
                        message="scheduled_at_unix_ms must be in the future",
                        request_id=request_id,
                        details={"scheduled_at_unix_ms": item.scheduled_at_unix_ms},
                    ),
                )
            )
            continue
        job_id = str(uuid.uuid4())
        job_store.create_job(
            job_id=job_id,
            request_id=request_id,
            ean=ean,
            command=item.command,
            scheduled_at_unix_ms=item.scheduled_at_unix_ms,
            priority=item.priority,
        )
        results.append(BatchCreateJobResult(ean=ean, job_id=job_id, status="queued"))

    queued = sum(1 for item in results if item.status == "queued")
    failed = len(results) - queued
    payload = BatchCreateJobResponse(request_id=request_id, queued=queued, failed=failed, results=results).model_dump()
    if replay_key is not None:
        idempotency_store.put(replay_key, payload)
    return payload


@router.post("/api/v1/orchestrator/jobs/status/batch")
def get_orchestrator_jobs_status_batch(
    body: BatchJobStatusRequest,
    request: Request,
    response: Response,
    job_store: SqliteJobStore = Depends(get_job_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
):
    request_id = getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))
    response.headers["X-Request-Id"] = request_id
    if len(body.job_ids) > settings.jobs_status_batch_max_items:
        err = ErrorContract(
            code="orchestrator_jobs_status_batch_too_large",
            message="Status batch size exceeds configured limit",
            request_id=request_id,
            details={"max_items": settings.jobs_status_batch_max_items, "received_items": len(body.job_ids)},
        )
        return JSONResponse(status_code=400, content=err.model_dump())

    results: list[BatchJobStatusItem] = []
    for job_id in body.job_ids:
        details = job_store.get_job(job_id=job_id)
        if details is None:
            results.append(BatchJobStatusItem(job_id=job_id, found=False, status="not_found"))
            continue
        results.append(
            BatchJobStatusItem(
                job_id=job_id,
                found=True,
                status=details.status,
                ean=details.ean,
                operation=details.operation,
                updated_at_unix_ms=details.updated_at_unix_ms,
                error=details.error,
            )
        )

    found_total = sum(1 for item in results if item.found)
    return BatchJobStatusResponse(
        request_id=request_id,
        total=len(results),
        found=found_total,
        not_found=len(results) - found_total,
        results=results,
    ).model_dump()


@router.get("/api/v1/orchestrator/jobs/{job_id}")
def get_orchestrator_job(
    job_id: str,
    request: Request,
    response: Response,
    job_store: SqliteJobStore = Depends(get_job_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
):
    request_id = getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))
    response.headers["X-Request-Id"] = request_id
    details = job_store.get_job(job_id=job_id)
    if details is None:
        err = ErrorContract(
            code="orchestrator_job_not_found",
            message="Orchestrator job not found",
            request_id=request_id,
            details={"job_id": job_id},
        )
        return JSONResponse(status_code=404, content=err.model_dump())
    return details.model_dump()


@router.get("/api/v1/orchestrator/jobs/{job_id}/events")
def get_orchestrator_job_events(
    job_id: str,
    request: Request,
    response: Response,
    job_store: SqliteJobStore = Depends(get_job_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
):
    request_id = getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))
    response.headers["X-Request-Id"] = request_id
    details = job_store.get_job(job_id=job_id)
    if details is None:
        err = ErrorContract(
            code="orchestrator_job_not_found",
            message="Orchestrator job not found",
            request_id=request_id,
            details={"job_id": job_id},
        )
        return JSONResponse(status_code=404, content=err.model_dump())
    events = job_store.get_job_events(job_id=job_id)
    return {"job_id": job_id, "events": [event.model_dump() for event in events]}


@router.get("/api/v1/orchestrator/jobs/{job_id}/attempts")
def get_orchestrator_job_attempts(
    job_id: str,
    request: Request,
    response: Response,
    job_store: SqliteJobStore = Depends(get_job_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
):
    request_id = getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))
    response.headers["X-Request-Id"] = request_id
    details = job_store.get_job(job_id=job_id)
    if details is None:
        err = ErrorContract(
            code="orchestrator_job_not_found",
            message="Orchestrator job not found",
            request_id=request_id,
            details={"job_id": job_id},
        )
        return JSONResponse(status_code=404, content=err.model_dump())
    attempts = job_store.get_job_attempts(job_id=job_id)
    return {"job_id": job_id, "attempts": [attempt.model_dump() for attempt in attempts]}


@router.post("/api/v1/orchestrator/reconciliation/diff")
def reconcile_orchestrator_state(
    body: ReconciliationRequest,
    request: Request,
    response: Response,
    service: OrchestratorService = Depends(get_service),
    job_store: SqliteJobStore = Depends(get_job_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
):
    request_id = getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))
    response.headers["X-Request-Id"] = request_id
    ean = body.ean.strip()
    if not ean:
        err = ErrorContract(
            code="orchestrator_ean_empty",
            message="EAN must be non-empty",
            request_id=request_id,
            details={},
        )
        return JSONResponse(status_code=400, content=err.model_dump())

    actual_by_target = {}
    for state in body.actual:
        key = ",".join([state.target.marketplace.value] + [f"{k}={v}" for k, v in (
            ("account", state.target.account),
            ("profile", state.target.profile),
            ("site", state.target.site),
            ("site_key", state.target.site_key),
        ) if v])
        actual_by_target[key] = state.payload

    diffs = service.diff_channel_payloads(desired_command=body.desired, actual_by_target=actual_by_target)
    drifted_targets = {item.target for item in diffs if item.has_drift}
    repair_job_id = None
    if body.apply_repair and drifted_targets:
        repair_channels = [channel for channel in body.desired.channels if _channel_target_label(channel) in drifted_targets]
        if repair_channels:
            repair_job_id = str(uuid.uuid4())
            repair_command = OrchestrateRequest(
                operation=Operation.UPDATE,
                payload=body.desired.payload,
                channels=repair_channels,
            )
            job_store.create_job(job_id=repair_job_id, request_id=request_id, ean=ean, command=repair_command)

    report_id = str(uuid.uuid4())
    job_store.create_reconciliation_report(
        report_id=report_id,
        request_id=request_id,
        ean=ean,
        total_channels=len(diffs),
        channels_with_drift=len(drifted_targets),
        diffs=diffs,
        desired_command=body.desired,
        repair_job_id=repair_job_id,
    )
    return ReconciliationResponse(
        request_id=request_id,
        report_id=report_id,
        ean=ean,
        total_channels=len(diffs),
        channels_with_drift=len(drifted_targets),
        diffs=diffs,
        repair_job_id=repair_job_id,
    ).model_dump()


@router.get("/api/v1/orchestrator/reconciliation/reports/{report_id}")
def get_reconciliation_report(
    report_id: str,
    request: Request,
    response: Response,
    job_store: SqliteJobStore = Depends(get_job_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
):
    request_id = getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))
    response.headers["X-Request-Id"] = request_id
    report = job_store.get_reconciliation_report(report_id=report_id)
    if report is None:
        err = ErrorContract(
            code="orchestrator_reconciliation_report_not_found",
            message="Reconciliation report not found",
            request_id=request_id,
            details={"report_id": report_id},
        )
        return JSONResponse(status_code=404, content=err.model_dump())
    return report.model_dump()


@router.get("/api/v1/orchestrator/reconciliation/reports")
def list_reconciliation_reports(
    ean: str,
    request: Request,
    response: Response,
    job_store: SqliteJobStore = Depends(get_job_store),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
):
    request_id = getattr(request.state, "request_id", x_request_id or str(uuid.uuid4()))
    response.headers["X-Request-Id"] = request_id
    clean_ean = ean.strip()
    if not clean_ean:
        err = ErrorContract(
            code="orchestrator_ean_empty",
            message="EAN must be non-empty",
            request_id=request_id,
            details={},
        )
        return JSONResponse(status_code=400, content=err.model_dump())
    reports = job_store.list_reconciliation_reports_by_ean(ean=clean_ean)
    return {"ean": clean_ean, "reports": [item.model_dump() for item in reports]}


def _channel_target_label(channel) -> str:
    parts = [channel.marketplace.value]
    if channel.account:
        parts.append(f"account={channel.account}")
    if channel.profile:
        parts.append(f"profile={channel.profile}")
    if channel.site:
        parts.append(f"site={channel.site}")
    if channel.site_key:
        parts.append(f"site_key={channel.site_key}")
    return ",".join(parts)


def _try_consume_job_intake_slots(requested_priorities: list[JobPriority]) -> bool:
    requested_jobs = len(requested_priorities)
    window_seconds = settings.job_intake_rate_limit_window_seconds
    max_jobs = settings.job_intake_rate_limit_max_jobs
    if requested_jobs <= 0 or window_seconds <= 0 or max_jobs <= 0:
        return True
    priority_max = {
        JobPriority.URGENT: settings.job_intake_rate_limit_max_urgent_jobs,
        JobPriority.NORMAL: settings.job_intake_rate_limit_max_normal_jobs,
        JobPriority.BACKGROUND: settings.job_intake_rate_limit_max_background_jobs,
    }
    now_ms = int(time.time() * 1000)
    threshold_ms = now_ms - (window_seconds * 1000)
    while _JOB_INTAKE_TIMESTAMPS_MS and _JOB_INTAKE_TIMESTAMPS_MS[0] < threshold_ms:
        _JOB_INTAKE_TIMESTAMPS_MS.popleft()
    for priority in (JobPriority.URGENT, JobPriority.NORMAL, JobPriority.BACKGROUND):
        queue = _JOB_INTAKE_PRIORITY_TIMESTAMPS_MS[priority]
        while queue and queue[0] < threshold_ms:
            queue.popleft()
    if len(_JOB_INTAKE_TIMESTAMPS_MS) + requested_jobs > max_jobs:
        return False
    requested_by_priority = {
        JobPriority.URGENT: 0,
        JobPriority.NORMAL: 0,
        JobPriority.BACKGROUND: 0,
    }
    for priority in requested_priorities:
        requested_by_priority[priority] += 1
    for priority, requested_count in requested_by_priority.items():
        if requested_count <= 0:
            continue
        priority_limit = priority_max[priority]
        if priority_limit > 0 and len(_JOB_INTAKE_PRIORITY_TIMESTAMPS_MS[priority]) + requested_count > priority_limit:
            return False
    for priority in requested_priorities:
        _JOB_INTAKE_TIMESTAMPS_MS.append(now_ms)
        _JOB_INTAKE_PRIORITY_TIMESTAMPS_MS[priority].append(now_ms)
    return True


def _batch_replay_key(*, idempotency_key: str | None, body: BatchCreateJobRequest) -> str | None:
    raw_key = (idempotency_key or "").strip()
    if not raw_key:
        return None
    canonical = json.dumps(body.model_dump(mode="json"), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"orchestrator_jobs_batch::{raw_key}::{digest}"


def _single_replay_key(*, idempotency_key: str | None, body: CreateJobRequest) -> str | None:
    raw_key = (idempotency_key or "").strip()
    if not raw_key:
        return None
    canonical = json.dumps(body.model_dump(mode="json"), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"orchestrator_jobs_single::{raw_key}::{digest}"
