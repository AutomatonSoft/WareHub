import hashlib
import json
import os
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import IdempotencyRecord


DEFAULT_TTL_SECONDS = int(os.getenv("IDEMPOTENCY_TTL_SECONDS", "300"))


def _stable_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def build_request_hash(*, method: str, path: str, query: dict, body) -> str:
    payload = {
        "method": str(method or "").upper(),
        "path": str(path or ""),
        "query": query or {},
        "body": body if body is not None else {},
    }
    raw = _stable_json(payload)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def derive_idem_key(request, request_hash: str) -> str:
    header_key = (
        request.headers.get("Idempotency-Key")
        or request.headers.get("X-Idempotency-Key")
        or ""
    ).strip()
    if header_key:
        return header_key[:255]
    return request_hash[:255]


def claim_or_replay(*, scope: str, idem_key: str, request_hash: str, ttl_seconds: int = DEFAULT_TTL_SECONDS):
    now = timezone.now()
    expires_at = now + timedelta(seconds=max(30, int(ttl_seconds)))

    # Fast-path: try to claim by insert first.
    try:
        with transaction.atomic():
            record = IdempotencyRecord.objects.create(
                scope=scope,
                idem_key=idem_key,
                request_hash=request_hash,
                state="processing",
                expires_at=expires_at,
            )
            return "claimed", record
    except IntegrityError:
        # Another request has inserted this key already.
        # Do not query in the same failed atomic block.
        pass

    with transaction.atomic():
        record = (
            IdempotencyRecord.objects.select_for_update()
            .filter(scope=scope, idem_key=idem_key)
            .first()
        )

        if not record:
            return "error", None

        if record.expires_at <= now:
            # Expired stale lock/request. Re-claim it for current request.
            record.request_hash = request_hash
            record.state = "processing"
            record.expires_at = expires_at
            record.status_code = None
            record.response_payload = {}
            record.error_code = ""
            record.save(
                update_fields=[
                    "request_hash",
                    "state",
                    "expires_at",
                    "status_code",
                    "response_payload",
                    "error_code",
                    "updated_at",
                ]
            )
            return "claimed", record

        if record.request_hash != request_hash:
            return "conflict", record

        if record.state == "completed":
            return "replay", record
        if record.state == "processing":
            return "processing", record

        record.state = "processing"
        record.expires_at = expires_at
        record.save(update_fields=["state", "expires_at", "updated_at"])
        return "claimed", record


def finalize_success(record: IdempotencyRecord, *, status_code: int, payload: dict):
    record.state = "completed"
    record.status_code = int(status_code)
    record.response_payload = payload if isinstance(payload, dict) else {"data": payload}
    record.error_code = ""
    record.save(update_fields=["state", "status_code", "response_payload", "error_code", "updated_at"])


def finalize_error(record: IdempotencyRecord, *, status_code: int, payload: dict, error_code: str):
    record.state = "failed"
    record.status_code = int(status_code)
    record.response_payload = payload if isinstance(payload, dict) else {"data": payload}
    record.error_code = (error_code or "unknown_error")[:128]
    record.save(update_fields=["state", "status_code", "response_payload", "error_code", "updated_at"])
