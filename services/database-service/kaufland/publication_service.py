from datetime import timedelta
import logging
import uuid

import requests
from django.db import transaction
from django.utils import timezone

from database.models import Ean, EanStatus
from .external_requests import get_product_publication_status
from .models import KauflandPublication

logger = logging.getLogger(__name__)
CHECK_INTERVAL = timedelta(hours=1)
CHECK_LEASE = timedelta(minutes=5)


def sync_mapping_visibility(publication):
    field = f"kaufland_{publication.controller}"
    kid_ids = Ean.objects.filter(**{field: publication.ean}).values_list("kid_id", flat=True)
    EanStatus.objects.filter(ean_id__in=kid_ids).update(**{field: publication.online})


def record_submission(*, controller, ean):
    now = timezone.now()
    with transaction.atomic():
        publication, _ = KauflandPublication.objects.update_or_create(
            controller=controller, ean=ean, defaults={
                "submission_id": uuid.uuid4(), "online": False, "errors": [],
                "submitted_at": now, "checked_at": None, "next_check_at": now + CHECK_INTERVAL,
            },
        )
        sync_mapping_visibility(publication)
    return publication


def apply_active_state(*, controller, ean, active):
    if active:
        record_submission(controller=controller, ean=ean)
        return
    with transaction.atomic():
        publication = KauflandPublication.objects.select_for_update().filter(controller=controller, ean=ean).first()
        if publication is not None:
            publication.submission_id = uuid.uuid4()
            publication.online = False
            publication.next_check_at = None
            publication.save(update_fields=["submission_id", "online", "next_check_at"])
            sync_mapping_visibility(publication)


def reconcile_next_publication():
    now = timezone.now()
    with transaction.atomic():
        publication = KauflandPublication.objects.select_for_update().filter(
            online=False, next_check_at__lte=now,
        ).order_by("next_check_at", "pk").first()
        if publication is None:
            return None
        publication.next_check_at = now + CHECK_LEASE
        publication.save(update_fields=["next_check_at"])
    online, errors = False, []
    try:
        result = get_product_publication_status(publication.ean, publication.controller)
        if result.get("ean") != publication.ean or result.get("controller") != publication.controller:
            raise ValueError("Kaufland returned another EAN or account")
        online = result.get("is_live") is True and result.get("is_valid") is True
        errors = result.get("issues_detected") or []
    except (requests.RequestException, ValueError):
        logger.warning("KAUFLAND_PUBLICATION_STATUS_UNAVAILABLE controller=%s ean=%s", publication.controller, publication.ean)
        errors = [{"code": "kaufland_status_unavailable"}]
    with transaction.atomic():
        current = KauflandPublication.objects.select_for_update().get(pk=publication.pk)
        if current.submission_id != publication.submission_id:
            return None
        current.online, current.errors, current.checked_at = online, errors, now
        current.next_check_at = None if online else now + CHECK_INTERVAL
        current.save()
        sync_mapping_visibility(current)
    return {"ean": current.ean, "controller": current.controller, "online": current.online}
