"""Server-side "create JV sofort product" job.

The create-product UI used to call the synchronous create-and-push endpoint
once per site, which blocked the page for a long time. This module turns that
into a background job that reuses the existing JV batch worker
(``run_jv_batch_worker``): the frontend uploads the gallery, builds the
per-site payloads, then enqueues a single ``JVBatchJob`` with
``operation="create"``. The worker runs create-and-push per site so the work
survives page reloads and the user can keep working.
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.db import close_old_connections, transaction
from django.utils import timezone

from .batch_item_status import (
    finalize_batch_job,
    mark_item_applied,
    mark_item_failed,
    new_batch_summary,
    update_item_progress,
    update_job_progress,
)
from .batch_service import _json_safe, _merge_batch_summary, _session_actor
from .models import ImportedProduct, JVBatchJob, JVBatchJobItem
from .views_write import (
    create_and_push_jv_product,
    update_and_push_jv_product_by_ean,
)

logger = logging.getLogger(__name__)

_SUCCESS_STATUS = {200, 201}


def enqueue_create_job(*, request, ean: str, name: str, sites: list[dict]) -> JVBatchJob:
    """Create a PENDING ``operation="create"`` batch job for the worker to run.

    ``sites`` is a list of ``{site, site_key, domain, payload}`` where
    ``payload`` is the full create-and-push body the frontend already builds
    per site (with images already uploaded).
    """
    actor = _session_actor(request)
    normalized_sites: list[dict] = []
    for entry in sites or []:
        if not isinstance(entry, dict):
            continue
        site = str(entry.get("site") or ImportedProduct.Site.JV).strip() or ImportedProduct.Site.JV
        site_key = str(entry.get("site_key") or "").strip()
        domain = str(entry.get("domain") or "").strip()
        payload = entry.get("payload")
        if not site_key or not isinstance(payload, dict):
            continue
        normalized_sites.append(
            {"site": site, "site_key": site_key, "domain": domain, "payload": payload}
        )

    request_payload = {
        "ean": ean,
        "name": name,
        "sites": normalized_sites,
    }
    initial_summary = {
        "progress_phase": "queued",
        "progress_message": "Create job queued.",
        "phase_updated_at": timezone.now().isoformat(),
    }
    with transaction.atomic():
        job = JVBatchJob.objects.create(
            ean=ean,
            site_family=ImportedProduct.Site.JV,
            operation=JVBatchJob.Operation.CREATE,
            status=JVBatchJob.Status.PENDING,
            initiated_by=actor,
            request_payload=_json_safe(request_payload),
            result_summary=initial_summary,
        )
        for entry in normalized_sites:
            JVBatchJobItem.objects.create(
                job=job,
                site=entry["site"],
                site_key=entry["site_key"],
                domain=entry["domain"],
                status=JVBatchJobItem.Status.PENDING,
                effective_ean=ean,
                details={"progress_phase": "queued", "progress_message": "Queued in worker."},
            )
    return job


def _payload_for_item(job: JVBatchJob, item: JVBatchJobItem) -> dict | None:
    sites = (job.request_payload or {}).get("sites") or []
    for entry in sites:
        if isinstance(entry, dict) and str(entry.get("site_key") or "") == str(item.site_key or ""):
            payload = entry.get("payload")
            return payload if isinstance(payload, dict) else None
    return None


def _record_jv_ean_marker(item: JVBatchJobItem) -> None:
    """After a successful JV publish, store the article number (artikelnr) in the
    linked Kid's Ean row (``database_ean.jv``), but only while it is still empty —
    never overwrite an existing value."""
    if str(item.site or "").strip().upper() != ImportedProduct.Site.JV:
        return
    ean_digits = "".join(ch for ch in str(item.effective_ean or "") if ch.isdigit())
    if not ean_digits:
        return
    product = (
        ImportedProduct.all_objects.filter(site=item.site, site_key=item.site_key, ean=ean_digits)
        .order_by("-id")
        .first()
    )
    artikelnr = str(getattr(product, "source_model", "") or "").strip() if product else ""
    if not artikelnr:
        return
    try:
        from django.db.models import Q

        from database.models import Ean

        Ean.objects.filter(main_ean=ean_digits).filter(
            Q(jv__isnull=True) | Q(jv="")
        ).update(jv=artikelnr)
    except Exception:  # noqa: BLE001
        logger.warning(
            "JV_EAN_MARKER_WRITE_FAILED code=jv_ean_marker_write_failed item_id=%s ean=%s",
            item.id,
            item.effective_ean,
            exc_info=True,
        )


def _apply_success(item: JVBatchJobItem, summary: dict, data: dict) -> None:
    item_data = data.get("item") if isinstance(data.get("item"), dict) else {}
    raw_spid = item_data.get("source_product_id")
    try:
        source_product_id = int(raw_spid) if raw_spid is not None else None
    except (TypeError, ValueError):
        source_product_id = None
    if source_product_id is not None:
        item.source_product_id = source_product_id
        item.save(update_fields=["source_product_id", "updated_at"])
    mark_item_applied(
        item,
        summary,
        details={"created": bool(data.get("created")), "pushed": bool(data.get("pushed"))},
    )
    _record_jv_ean_marker(item)


def _create_one_item(*, job_id: int, item_id: int, ean: str, actor: str) -> dict:
    close_old_connections()
    summary = new_batch_summary()
    summary["total"] = 1
    item = JVBatchJobItem.objects.select_related("job").get(pk=item_id)
    payload = _payload_for_item(item.job, item)
    if not payload:
        mark_item_failed(
            item, summary, code="jv_create_missing_payload", text="No create payload for this site."
        )
        close_old_connections()
        return summary

    try:
        update_item_progress(item, phase="creating", message="Creating and pushing product to source DB.")
        response = create_and_push_jv_product(
            site=item.site,
            site_key=item.site_key,
            payload_data=payload,
            actor=actor,
        )
        data = response.data if isinstance(response.data, dict) else {}

        if response.status_code in _SUCCESS_STATUS:
            _apply_success(item, summary, data)
            close_old_connections()
            return summary

        # The same article (by artikelnr, or by EAN in the legacy/no-artikelnr case)
        # already exists on the site -> update that product instead of creating a new one,
        # mirroring the previous client-side create-then-update fallback.
        if str(data.get("code") or "") in ("jv_create_artikelnr_conflict", "jv_create_ean_conflict"):
            update_item_progress(item, phase="updating", message="Article already exists; updating instead.")
            update_response = update_and_push_jv_product_by_ean(
                ean=ean,
                site=item.site,
                site_key=item.site_key,
                payload_data=payload,
                actor=actor,
                idem_record=None,
            )
            update_data = update_response.data if isinstance(update_response.data, dict) else {}
            if update_response.status_code in _SUCCESS_STATUS:
                _apply_success(item, summary, update_data)
            else:
                mark_item_failed(
                    item,
                    summary,
                    code=str(update_data.get("code") or f"http_{update_response.status_code}"),
                    text=str(update_data.get("detail") or update_data.get("error") or "Update failed."),
                )
            close_old_connections()
            return summary

        mark_item_failed(
            item,
            summary,
            code=str(data.get("code") or f"http_{response.status_code}"),
            text=str(data.get("detail") or data.get("error") or "Create failed."),
        )
    except Exception as exc:
        logger.exception(
            "JV_CREATE_ITEM_FAILED code=jv_create_item_failed job_id=%s item_id=%s", job_id, item_id
        )
        mark_item_failed(item, summary, code="jv_create_item_exception", text=str(exc))

    close_old_connections()
    return summary


def run_create_job(job: JVBatchJob) -> dict:
    """Run a ``operation="create"`` job: create-and-push the product per site."""
    ean = str(job.ean or "").strip()
    actor = str(job.initiated_by or "system_import")
    update_job_progress(job, phase="creating", message="Worker is creating products on sites.")

    items = list(job.items.all().order_by("id"))
    pending_items = [it for it in items if it.status == JVBatchJobItem.Status.PENDING]
    summary = new_batch_summary()
    if not pending_items:
        return finalize_batch_job(job, summary)

    max_workers = max(1, min(4, len(pending_items)))
    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="jv-create") as executor:
        futures = {
            executor.submit(
                _create_one_item,
                job_id=int(job.id),
                item_id=int(it.id),
                ean=ean,
                actor=actor,
            ): int(it.id)
            for it in pending_items
        }
        for future in as_completed(futures):
            item_id = futures[future]
            try:
                fragment = future.result()
            except Exception as exc:
                item = JVBatchJobItem.objects.get(pk=item_id)
                fragment = new_batch_summary()
                fragment["total"] = 1
                mark_item_failed(item, fragment, code="jv_create_thread_failed", text=str(exc))
            _merge_batch_summary(summary, fragment)

    return finalize_batch_job(job, summary)
