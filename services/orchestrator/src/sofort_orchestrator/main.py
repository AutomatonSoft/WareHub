from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .api.product_editor_routes import ProductEditorDeps
from .api.routes import Deps, router
from .application.product_editor_service import ProductEditorService
from .application.job_worker import run_job_worker
from .application.reconciliation_scheduler import run_reconciliation_scheduler
from .application.orchestrator_service import OrchestratorService
from .domain.models import ErrorContract
from .infra.channel_limiter import InMemoryChannelLimiter
from .infra.circuit_breaker import InMemoryCircuitBreaker
from .infra.http_client import HttpClient
from .infra.idempotency import SqliteIdempotencyStore
from .infra.job_store import SqliteJobStore
from .infra.marketplace_adapters import MarketplaceAdapters
from .infra.metrics import InMemoryMetrics
from .infra.product_editor_gateway import ProductEditorGateway
from .infra.product_editor_store import SqliteProductEditorStore
from .infra.settings import settings

logger = logging.getLogger("sofort_orchestrator")
logging.basicConfig(level=getattr(logging, settings.log_level, logging.INFO), format="%(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    job_worker_task: asyncio.Task | None = None
    reconciliation_scheduler_task: asyncio.Task | None = None
    if settings.enable_job_worker:
        service = Deps.service
        job_store = Deps.job_store
        if service is None or job_store is None:
            raise RuntimeError("Worker dependencies are not configured")
        job_worker_task = asyncio.create_task(
            run_job_worker(
                service=service,
                job_store=job_store,
                poll_interval_seconds=settings.job_worker_poll_interval_seconds,
            )
        )
    if settings.enable_reconciliation_scheduler:
        job_store = Deps.job_store
        if job_store is None:
            raise RuntimeError("Reconciliation scheduler dependencies are not configured")
        reconciliation_scheduler_task = asyncio.create_task(
            run_reconciliation_scheduler(
                job_store=job_store,
                poll_interval_seconds=settings.reconciliation_scheduler_poll_interval_seconds,
                reports_ttl_seconds=settings.reconciliation_reports_ttl_seconds,
                reports_max_per_ean=settings.reconciliation_reports_max_per_ean,
            )
        )
    try:
        yield
    finally:
        if job_worker_task is not None:
            job_worker_task.cancel()
            try:
                await job_worker_task
            except asyncio.CancelledError:
                pass
        if reconciliation_scheduler_task is not None:
            reconciliation_scheduler_task.cancel()
            try:
                await reconciliation_scheduler_task
            except asyncio.CancelledError:
                pass


app = FastAPI(title="sb-sofort-orchestrator-service", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    request.state.request_id = request_id
    started = time.perf_counter()

    response = await call_next(request)

    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    payload = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "level": "INFO",
        "service": settings.service_name,
        "request_id": request_id,
        "route": request.url.path,
        "status": response.status_code,
        "latency_ms": latency_ms,
    }
    logger.info(json.dumps(payload, ensure_ascii=False))
    _metrics.record_request(status_code=response.status_code, latency_ms=latency_ms)
    response.headers["X-Request-Id"] = request_id
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", request.headers.get("X-Request-Id") or str(uuid.uuid4()))
    payload = ErrorContract(
        code="orchestrator_request_validation_failed",
        message="Request body validation failed",
        request_id=request_id,
        details={"errors": exc.errors()},
    ).model_dump()
    return JSONResponse(status_code=422, content=payload, headers={"X-Request-Id": request_id})


_http_client = HttpClient(timeout_seconds=settings.timeout_seconds, retries=settings.retries)
_adapters = MarketplaceAdapters(base_url=settings.base_url, http_client=_http_client)
_circuit_breaker = InMemoryCircuitBreaker(
    failure_threshold=settings.circuit_breaker_failure_threshold,
    open_seconds=settings.circuit_breaker_open_seconds,
    enabled=settings.enable_circuit_breaker,
)
_channel_limiter = InMemoryChannelLimiter(
    max_inflight_per_key=settings.channel_limiter_max_inflight_per_key,
    enabled=settings.enable_channel_limiter,
)
_service = OrchestratorService(adapters=_adapters, circuit_breaker=_circuit_breaker, channel_limiter=_channel_limiter)
_idempotency_store = SqliteIdempotencyStore(
    db_path=settings.idempotency_sqlite_path,
    ttl_seconds=settings.idempotency_ttl_seconds,
)
_job_store = SqliteJobStore(db_path=settings.jobs_sqlite_path)
_metrics = InMemoryMetrics()
_product_editor_gateway = ProductEditorGateway(base_url=settings.base_url, http_client=_http_client)
_product_editor_store = SqliteProductEditorStore(db_path=settings.jobs_sqlite_path.replace(".sqlite3", "_product_editor.sqlite3"))
_product_editor_service = ProductEditorService(
    gateway=_product_editor_gateway,
    store=_product_editor_store,
    orchestrator_job_store=_job_store,
)

Deps.service = _service
Deps.idempotency_store = _idempotency_store
Deps.job_store = _job_store
Deps.metrics = _metrics
ProductEditorDeps.service = _product_editor_service


app.include_router(router)
