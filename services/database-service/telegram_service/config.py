from __future__ import annotations

import os
from dataclasses import dataclass


def _clean_text(value: str | None) -> str:
    return str(value or "").strip()


def _clean_webhook_path(value: str | None) -> str:
    raw = _clean_text(value) or "/api/v1/telegram/webhook/"
    normalized = "/" + raw.strip("/") + "/"
    return normalized


def _derive_public_webhook_path(webhook_path: str, value: str | None) -> str:
    explicit = _clean_text(value)
    if explicit:
        return "/" + explicit.strip("/") + "/"
    if webhook_path.startswith("/api/v1/"):
        return "/api/v1/services/" + webhook_path.removeprefix("/api/v1/").lstrip("/")
    return webhook_path


def _parse_optional_int(value: str | None) -> int | None:
    raw = _clean_text(value)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _parse_csv_ints(value: str | None) -> tuple[int, ...]:
    raw = _clean_text(value)
    if not raw:
        return ()
    values: list[int] = []
    for part in raw.split(","):
        item = part.strip()
        if not item:
            continue
        try:
            values.append(int(item))
        except ValueError:
            continue
    return tuple(values)


@dataclass(frozen=True)
class TelegramRuntimeConfig:
    bot_token: str
    chat_id: int | None
    message_thread_id: int | None
    webhook_secret: str
    webhook_path: str
    public_webhook_path: str
    api_base_url: str
    allowed_user_ids: tuple[int, ...]
    services_base_url: str
    service_auth_token: str
    orchestrator_base_url: str
    orchestrator_poll_attempts: int
    orchestrator_poll_interval_seconds: float

    @property
    def enabled(self) -> bool:
        return bool(self.bot_token and self.webhook_secret)


def load_telegram_runtime_config() -> TelegramRuntimeConfig:
    services_base_url = (
        _clean_text(os.getenv("TELEGRAM_SERVICES_BASE_URL"))
        or _clean_text(os.getenv("SERVICES_ORIGIN"))
        or "http://127.0.0.1:8934"
    ).rstrip("/")
    orchestrator_base_url = (
        _clean_text(os.getenv("TELEGRAM_ORCHESTRATOR_BASE_URL"))
        or _clean_text(os.getenv("ORCHESTRATOR_ORIGIN"))
        or "http://127.0.0.1:8935"
    ).rstrip("/")
    webhook_path = _clean_webhook_path(os.getenv("TELEGRAM_WEBHOOK_PATH"))
    return TelegramRuntimeConfig(
        bot_token=_clean_text(os.getenv("TELEGRAM_BOT_TOKEN")),
        chat_id=_parse_optional_int(os.getenv("TELEGRAM_CHAT_ID")),
        message_thread_id=_parse_optional_int(os.getenv("MESSAGE_THREAD_ID")),
        webhook_secret=_clean_text(os.getenv("TELEGRAM_WEBHOOK_SECRET")),
        webhook_path=webhook_path,
        public_webhook_path=_derive_public_webhook_path(webhook_path, os.getenv("TELEGRAM_PUBLIC_WEBHOOK_PATH")),
        api_base_url=(
            _clean_text(os.getenv("TELEGRAM_API_BASE_URL"))
            or "https://api.telegram.org"
        ).rstrip("/"),
        allowed_user_ids=_parse_csv_ints(os.getenv("TELEGRAM_ALLOWED_USER_IDS")),
        services_base_url=services_base_url,
        service_auth_token=_clean_text(os.getenv("ORCHESTRATOR_SERVICE_AUTH_TOKEN")),
        orchestrator_base_url=orchestrator_base_url,
        orchestrator_poll_attempts=max(int(_clean_text(os.getenv("TELEGRAM_ORCHESTRATOR_POLL_ATTEMPTS")) or "45"), 1),
        orchestrator_poll_interval_seconds=max(float(_clean_text(os.getenv("TELEGRAM_ORCHESTRATOR_POLL_INTERVAL_SECONDS")) or "0.4"), 0.05),
    )
