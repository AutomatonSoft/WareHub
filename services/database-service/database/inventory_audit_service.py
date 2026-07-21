from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
import logging
from typing import Any

from django.utils import timezone
from django.db.models import Q

from .kid_number_utils import primary_kid_number
from .models import InventoryChangeLog, Kid


logger = logging.getLogger(__name__)

INVENTORY_CHANGE_HISTORY_RETENTION_DAYS = 90


def request_actor(request) -> dict[str, str]:
    session = getattr(request, "session", {})
    login = str(session.get("login") or session.get("username") or session.get("user") or "").strip()
    name = str(session.get("display_name") or "").strip()
    if not name:
        name = " ".join(
            value
            for value in (
                str(session.get("first_name") or "").strip(),
                str(session.get("last_name") or "").strip(),
            )
            if value
        )
    return {"login": login, "name": name or login or "Unknown user"}


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    return value


def changed_fields(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    for field, next_value in after.items():
        previous_value = before.get(field)
        if _json_value(previous_value) != _json_value(next_value):
            changes.append({"field": field, "before": _json_value(previous_value), "after": _json_value(next_value)})
    return changes


def retained_inventory_history_photo_urls(photo_urls: list[str]) -> set[str]:
    """Return requested photo URLs that must remain available for the audit retention window."""
    requested_urls = {str(url).strip() for url in photo_urls if str(url).strip()}
    if not requested_urls:
        return set()

    cutoff = timezone.now() - timedelta(days=INVENTORY_CHANGE_HISTORY_RETENTION_DAYS)
    retained_urls: set[str] = set()
    for changes in InventoryChangeLog.objects.filter(created_at__gte=cutoff).values_list("changes", flat=True).iterator():
        for change in changes or []:
            if not isinstance(change, dict) or change.get("field") != "photo":
                continue
            for value in (change.get("before"), change.get("after")):
                values = value if isinstance(value, list) else [value]
                retained_urls.update(str(url).strip() for url in values if str(url).strip() in requested_urls)
    return retained_urls


def record_inventory_change(
    *,
    kid: Kid,
    actor: dict[str, str],
    action: str,
    changes: list[dict[str, Any]] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    try:
        purge_expired_inventory_change_history()
        normalized_changes = _json_value(changes or [])
        split_change_actions = {"product_updated", "order_memo_updated"}
        change_groups = [[change] for change in normalized_changes] if action in split_change_actions and normalized_changes else [[]]
        common_values = {
            "kid": kid,
            "kid_number": primary_kid_number(kid.kid_number),
            "place": str(kid.place or "").strip(),
            "actor_login": actor.get("login", ""),
            "actor_name": actor.get("name", ""),
            "action": action,
            "metadata": _json_value(metadata or {}),
        }
        InventoryChangeLog.objects.bulk_create(
            [InventoryChangeLog(**common_values, changes=change_group) for change_group in change_groups]
        )
    except Exception:  # noqa: BLE001
        # Audit availability must not block an inventory change while a deployment is being migrated.
        logger.exception("INVENTORY_AUDIT_WRITE_FAILED action=%s kid_id=%s", action, kid.id)


def purge_expired_inventory_change_history() -> int:
    """Delete audit rows outside the fixed retention window."""
    cutoff = timezone.now() - timedelta(days=INVENTORY_CHANGE_HISTORY_RETENTION_DAYS)
    deleted_count, _ = InventoryChangeLog.objects.filter(created_at__lt=cutoff).delete()
    return deleted_count


def _filtered_inventory_change_history_rows(
    *,
    search: str = "",
    actor: str = "",
    occurred_after=None,
    occurred_before=None,
):
    rows = InventoryChangeLog.objects.select_related("kid").all()
    if search:
        rows = rows.filter(Q(kid_number__icontains=search) | Q(place__icontains=search))
    if actor:
        rows = rows.filter(Q(actor_login=actor) | Q(actor_name=actor))
    if occurred_after is not None:
        rows = rows.filter(created_at__gte=occurred_after)
    if occurred_before is not None:
        rows = rows.filter(created_at__lt=occurred_before)
    return rows


def list_inventory_change_history(
    *,
    limit: int,
    page: int = 1,
    search: str = "",
    actor: str = "",
    occurred_after=None,
    occurred_before=None,
) -> dict[str, Any]:
    purge_expired_inventory_change_history()
    capped_limit = max(1, min(limit, 100))
    current_page = max(1, page)
    rows = _filtered_inventory_change_history_rows(
        search=search,
        actor=actor,
        occurred_after=occurred_after,
        occurred_before=occurred_before,
    )
    total = rows.count()
    offset = (current_page - 1) * capped_limit
    results = [
        {
            "id": row.id,
            "occurred_at": row.created_at.isoformat(),
            "actor": {"login": row.actor_login, "name": row.actor_name},
            "action": row.action,
            "product": {"kid_number": row.kid_number, "place": row.place},
            "changes": row.changes,
            "metadata": row.metadata,
        }
        for row in rows[offset:offset + capped_limit]
    ]
    return {"results": results, "total": total, "page": current_page, "page_size": capped_limit}


def list_inventory_change_history_actors(*, search: str = "", occurred_after=None, occurred_before=None) -> list[dict[str, str]]:
    rows = _filtered_inventory_change_history_rows(
        search=search,
        occurred_after=occurred_after,
        occurred_before=occurred_before,
    ).order_by()
    options: dict[str, str] = {}
    for login, name in rows.values_list("actor_login", "actor_name").distinct()[:250]:
        value = (login or name or "").strip()
        if value:
            options[value] = (name or login or value).strip()
    return [{"value": value, "label": label} for value, label in sorted(options.items(), key=lambda item: item[1].casefold())]
