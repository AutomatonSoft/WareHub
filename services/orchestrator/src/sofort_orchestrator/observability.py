from __future__ import annotations

import contextvars
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any

try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
except ImportError:  # pragma: no cover - local environments may not have optional deps yet.
    sentry_sdk = None
    FastApiIntegration = None


_request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)
_configured = False
_sentry_configured = False


def configure_observability(*, service_name: str, log_level: str) -> None:
    global _configured

    if not _configured:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonLogFormatter(service_name=service_name))
        root_logger = logging.getLogger()
        root_logger.handlers = [handler]
        root_logger.setLevel(_parse_log_level(log_level))
        _configured = True

    _configure_sentry()


def set_request_id(request_id: str | None):
    return _request_id_var.set(request_id)


def reset_request_id(token) -> None:
    _request_id_var.reset(token)


def capture_exception(exc: BaseException) -> None:
    if sentry_sdk is not None and sentry_sdk.Hub.current.client is not None:
        sentry_sdk.capture_exception(exc)


class JsonLogFormatter(logging.Formatter):
    def __init__(self, *, service_name: str) -> None:
        super().__init__()
        self._service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "level": record.levelname,
            "service": self._service_name,
            "environment": os.getenv("APP_ENV", "dev"),
            "logger": record.name,
            "message": record.getMessage(),
        }

        request_id = _request_id_var.get()
        if request_id:
            payload["request_id"] = request_id

        for field in ("route", "status", "latency_ms", "worker", "job_id", "ean"):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False, default=str)


def _configure_sentry() -> None:
    global _sentry_configured

    if _sentry_configured:
        return

    if sentry_sdk is None:
        return

    dsn = (os.getenv("ORCHESTRATOR_SENTRY_DSN") or os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        return

    integrations = [FastApiIntegration()] if FastApiIntegration is not None else []

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("APP_ENV", "dev"),
        release=os.getenv("ORCHESTRATOR_APP_VERSION") or os.getenv("APP_VERSION"),
        traces_sample_rate=_parse_sample_rate(
            os.getenv("ORCHESTRATOR_SENTRY_TRACES_SAMPLE_RATE") or os.getenv("SENTRY_TRACES_SAMPLE_RATE"),
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
