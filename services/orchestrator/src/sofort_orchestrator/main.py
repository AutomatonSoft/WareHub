from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

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
from .openapi_schema import install_custom_openapi
from .infra.settings import settings

logger = logging.getLogger("sofort_orchestrator")
logging.basicConfig(level=getattr(logging, settings.log_level, logging.INFO), format="%(message)s")
_shared_http_client: HttpClient | None = None
_ORCHESTRATOR_SERVICE_ROOT = Path(__file__).resolve().parents[2]


def _ensure_sqlite_parent_dir(db_path: str) -> str:
    path = Path(db_path)
    if not path.is_absolute():
        path = _ORCHESTRATOR_SERVICE_ROOT / path
    if path.parent != Path():
        path.parent.mkdir(parents=True, exist_ok=True)
    return str(path)


def _build_http_client() -> HttpClient:
    global _shared_http_client
    if _shared_http_client is None:
        _shared_http_client = HttpClient(timeout_seconds=settings.timeout_seconds, retries=settings.retries)
    return _shared_http_client


def _build_service() -> OrchestratorService:
    http_client = _build_http_client()
    adapters = MarketplaceAdapters(
        base_url=settings.base_url,
        http_client=http_client,
        service_auth_token=settings.service_auth_token,
    )
    circuit_breaker = InMemoryCircuitBreaker(
        failure_threshold=settings.circuit_breaker_failure_threshold,
        open_seconds=settings.circuit_breaker_open_seconds,
        enabled=settings.enable_circuit_breaker,
    )
    channel_limiter = InMemoryChannelLimiter(
        max_inflight_per_key=settings.channel_limiter_max_inflight_per_key,
        enabled=settings.enable_channel_limiter,
    )
    return OrchestratorService(adapters=adapters, circuit_breaker=circuit_breaker, channel_limiter=channel_limiter)


def _build_idempotency_store() -> SqliteIdempotencyStore:
    return SqliteIdempotencyStore(
        db_path=_ensure_sqlite_parent_dir(settings.idempotency_sqlite_path),
        ttl_seconds=settings.idempotency_ttl_seconds,
    )


def _build_job_store() -> SqliteJobStore:
    return SqliteJobStore(db_path=_ensure_sqlite_parent_dir(settings.jobs_sqlite_path))


def _build_metrics() -> InMemoryMetrics:
    return InMemoryMetrics()


def _build_product_editor_service(*, job_store: SqliteJobStore) -> ProductEditorService:
    http_client = _build_http_client()
    gateway = ProductEditorGateway(
        base_url=settings.base_url,
        http_client=http_client,
        service_auth_token=settings.service_auth_token,
    )
    store_path = settings.jobs_sqlite_path.replace(".sqlite3", "_product_editor.sqlite3")
    store = SqliteProductEditorStore(db_path=_ensure_sqlite_parent_dir(store_path))
    return ProductEditorService(
        gateway=gateway,
        store=store,
        orchestrator_job_store=job_store,
    )


def configure_runtime_dependencies() -> None:
    if Deps.service is None:
        Deps.service = _build_service()
    if Deps.idempotency_store is None:
        Deps.idempotency_store = _build_idempotency_store()
    if Deps.job_store is None:
        Deps.job_store = _build_job_store()
    if Deps.metrics is None:
        Deps.metrics = _build_metrics()
    if ProductEditorDeps.service is None:
        ProductEditorDeps.service = _build_product_editor_service(job_store=Deps.job_store)


def close_runtime_dependencies() -> None:
    global _shared_http_client

    if _shared_http_client is not None:
        _shared_http_client.close()
        _shared_http_client = None

    Deps.service = None
    ProductEditorDeps.service = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    job_worker_task: asyncio.Task | None = None
    reconciliation_scheduler_task: asyncio.Task | None = None
    configure_runtime_dependencies()
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
        close_runtime_dependencies()


app = FastAPI(
    title="sb-sofort-orchestrator-service",
    version="1.0.0",
    lifespan=lifespan,
    openapi_url="/api/v1/openapi.json",
    docs_url=None,
    redoc_url=None,
)
install_custom_openapi(app)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    configure_runtime_dependencies()
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
    if Deps.metrics is not None:
        Deps.metrics.record_request(status_code=response.status_code, latency_ms=latency_ms)
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


app.include_router(router)
