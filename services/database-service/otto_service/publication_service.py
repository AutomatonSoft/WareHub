from datetime import timedelta
import logging
import re
import uuid

from django.db import transaction
from django.utils import timezone

from database.models import Ean, EanStatus
from .external_requests import OttoExternalAPIError, OttoExternalProductsClient
from .models import OttoPublication

logger = logging.getLogger(__name__)
CHECK_INTERVAL = timedelta(minutes=1)
CHECK_DEADLINE = timedelta(hours=48)
CHECK_LEASE = timedelta(minutes=5)


def extract_task_id(payload):
    if not isinstance(payload, dict):
        return ""
    for key in ("processId", "process_id", "processUuid", "otto_task_id", "ottoTaskId"):
        try:
            return str(uuid.UUID(str(payload.get(key))))
        except (ValueError, TypeError, AttributeError):
            pass
    links = payload.get("links")
    for link in links if isinstance(links, list) else []:
        if isinstance(link, dict):
            match = re.search(r"/update-tasks/([0-9a-fA-F-]{36})(?:/|$)", str(link.get("href", "")))
            if match:
                try:
                    return str(uuid.UUID(match[1]))
                except ValueError:
                    continue
    for key in ("upstream_response", "result", "data", "response"):
        task_id = extract_task_id(payload.get(key))
        if task_id:
            return task_id
    return ""


def record_submissions(profile, products, response):
    now = timezone.now()
    task_id = extract_task_id(response)
    with transaction.atomic():
        for product in products:
            sku = str(product.get("sku") or "").strip()
            if not sku:
                continue
            publication, _ = OttoPublication.objects.update_or_create(profile=profile, sku=sku, defaults={
                "ean": str(product.get("ean") or sku), "task_id": task_id,
                "submission_id": uuid.uuid4(), "state": "pending", "errors": [],
                "submitted_at": now, "next_check_at": now, "checked_at": None,
            })
            _sync_mapping_visibility(publication)


def _sync_mapping_visibility(publication):
    field = f"otto_{publication.profile}"
    kid_ids = Ean.objects.filter(**{field: publication.ean}).values_list("kid_id", flat=True)
    EanStatus.objects.filter(ean_id__in=kid_ids).update(**{field: publication.online is True})


def publication_data(publication):
    return {"sku": publication.sku, "task_id": publication.task_id, "state": publication.state,
            "online": publication.online, "errors": publication.errors,
            "checking": publication.next_check_at is not None,
            "checked_at": publication.checked_at.isoformat() if publication.checked_at else None}


def _task_rows(payload, sku):
    results = payload.get("results")
    if not isinstance(results, list):
        raise OttoExternalAPIError("OTTO task results have an unexpected format.")
    return [row for row in results if isinstance(row, dict) and
            (row.get("sku") == sku or str(row.get("variation", "")).rstrip("/").endswith(f"/{sku}"))]


def check_publication(publication, client):
    state, errors = "pending", []
    if publication.task_id:
        task = client.fetch_update_task(task_id=publication.task_id, controller=publication.profile)
        if task.get("state") == "done":
            failed = client.fetch_update_task(task_id=publication.task_id, controller=publication.profile, result="failed")
            rows = _task_rows(failed, publication.sku)
            if rows:
                state = "rejected"
                errors = [error for row in rows for error in (row.get("errors") or []) if isinstance(error, dict)]
            else:
                state = "unknown"
                for result in ("succeeded", "unchanged"):
                    if _task_rows(client.fetch_update_task(task_id=publication.task_id, controller=publication.profile, result=result), publication.sku):
                        state = "processed"
                        break
    else:
        state = "unknown"
        errors = [{"code": "otto_task_id_missing", "title": "OTTO did not return a recognised update task ID."}]
    online = publication.online
    try:
        status = client.fetch_publication_status(sku=publication.sku, controller=publication.profile)
        if (status.get("sku") == publication.sku and status.get("controller") == publication.profile
                and isinstance(status.get("is_live"), bool) and status.get("marketplace_status")):
            online = status.get("marketplace_status") == "ONLINE" and status.get("is_live") is True
    except OttoExternalAPIError:
        logger.warning("OTTO visibility unavailable profile=%s sku=%s", publication.profile, publication.sku)
    if state == "processed" and online is True:
        state = "online"
    return state, online, errors


def reconcile_next_publication(client=None):
    now = timezone.now()
    with transaction.atomic():
        publication = OttoPublication.objects.select_for_update().filter(
            state__in=["pending", "processed", "unknown"], next_check_at__lte=now,
        ).order_by("next_check_at", "pk").first()
        if publication is None:
            return None
        publication.next_check_at = now + CHECK_LEASE
        publication.save(update_fields=["next_check_at"])
    expired = now - publication.submitted_at >= CHECK_DEADLINE
    try:
        if expired:
            state, online, errors = "unknown", publication.online, [{"code": "otto_check_timeout", "title": "OTTO publication was not confirmed within 48 hours."}]
        else:
            state, online, errors = check_publication(publication, client or OttoExternalProductsClient(read_timeout=8, connect_timeout=3))
    except OttoExternalAPIError:
        logger.warning("OTTO task check unavailable profile=%s sku=%s", publication.profile, publication.sku)
        state, online, errors = "unknown", publication.online, [{"code": "otto_status_unavailable", "title": "OTTO processing status could not be confirmed."}]
    with transaction.atomic():
        current = OttoPublication.objects.select_for_update().get(pk=publication.pk)
        if current.submission_id != publication.submission_id:
            return None
        current.state, current.online, current.errors = state, online, errors
        current.checked_at = now
        current.next_check_at = None if expired or state in ("online", "rejected") else now + CHECK_INTERVAL
        current.save()
        if online is not None:
            _sync_mapping_visibility(current)
    return publication_data(current)
