import contextvars
import json
import logging
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any

try:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
except ImportError:  # pragma: no cover - local environments may not have optional deps yet.
    sentry_sdk = None
    DjangoIntegration = None


_request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)
_configured = False
_sentry_configured = False


def get_request_id() -> str | None:
    return _request_id_var.get()


def set_request_id(request_id: str | None):
    return _request_id_var.set(request_id)


def reset_request_id(token) -> None:
    _request_id_var.reset(token)


def capture_exception(exc: BaseException) -> None:
    if sentry_sdk is not None and sentry_sdk.Hub.current.client is not None:
        sentry_sdk.capture_exception(exc)


def configure_observability() -> None:
    global _configured

    if not _configured:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonLogFormatter())

        root_logger = logging.getLogger()
        root_logger.handlers = [handler]
        root_logger.setLevel(_parse_log_level(os.getenv("SERVICES_LOG_LEVEL", "INFO")))

        _configured = True

    _configure_sentry()


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "level": record.levelname,
            "service": os.getenv("SERVICES_SERVICE_NAME", "warehub-database-service"),
            "environment": os.getenv("APP_ENV", "dev"),
            "logger": record.name,
            "message": record.getMessage(),
        }

        request_id = get_request_id()
        if request_id:
            payload["request_id"] = request_id

        for field in ("job_id", "route", "method", "status_code", "latency_ms", "ean", "site", "site_key"):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False, default=str)


class RequestLogContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.logger = logging.getLogger("database_service.request")

    def __call__(self, request):
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.request_id = request_id
        started = time.perf_counter()
        token = set_request_id(request_id)

        try:
            response = self.get_response(request)
        except Exception as exc:  # noqa: BLE001
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            self.logger.exception(
                "request_failed",
                extra={
                    "request_id": request_id,
                    "route": request.path,
                    "method": request.method,
                    "status_code": 500,
                    "latency_ms": latency_ms,
                },
            )
            capture_exception(exc)
            reset_request_id(token)
            raise

        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        self.logger.info(
            "request_finished",
            extra={
                "request_id": request_id,
                "route": request.path,
                "method": request.method,
                "status_code": response.status_code,
                "latency_ms": latency_ms,
            },
        )
        response["X-Request-Id"] = request_id
        reset_request_id(token)
        return response


def _configure_sentry() -> None:
    global _sentry_configured

    if _sentry_configured:
        return

    if sentry_sdk is None:
        return

    dsn = (os.getenv("SERVICES_SENTRY_DSN") or os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        return

    integrations = [DjangoIntegration()] if DjangoIntegration is not None else []

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("APP_ENV", "dev"),
        release=os.getenv("SERVICES_APP_VERSION") or os.getenv("APP_VERSION"),
        traces_sample_rate=_parse_sample_rate(
            os.getenv("SERVICES_SENTRY_TRACES_SAMPLE_RATE") or os.getenv("SENTRY_TRACES_SAMPLE_RATE"),
            fallback=0.1,
        ),
        integrations=integrations,
        send_default_pii=False,
    )
    _sentry_configured = True


def _parse_sample_rate(raw: str | None, *, fallback: float) -> float:
    try:
        parsed = float((raw or "").strip())
    except ValueError:
        return fallback
    if 0.0 <= parsed <= 1.0:
        return parsed
    return fallback


def _parse_log_level(raw: str) -> int:
    return getattr(logging, (raw or "INFO").strip().upper(), logging.INFO)
