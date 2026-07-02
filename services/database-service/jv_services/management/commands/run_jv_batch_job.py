import logging
import os
import socket
import sys
import traceback

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from jv_services.batch_item_status import update_job_progress
from jv_services.batch_service import (
    _json_safe,
    apply_batch,
    build_batch_plan,
    build_job_precompute_context,
    load_job_precompute_context,
    normalize_job_items_for_payload,
    save_job_precompute_context,
)
from jv_services.models import ImportedProduct, JVBatchJob, JVBatchJobItem

logger = logging.getLogger(__name__)


def _runtime_debug_context() -> dict:
    return {
        "pid": os.getpid(),
        "hostname": socket.gethostname(),
        "argv": list(sys.argv),
        "stack": traceback.format_stack(limit=8),
    }


class Command(BaseCommand):
    help = "Run JV batch job by id in worker process."

    def add_arguments(self, parser):
        parser.add_argument("job_id", type=int)
        parser.add_argument("--already-claimed", action="store_true")

    def handle(self, *args, **options):
        job_id = int(options["job_id"])
        already_claimed = bool(options.get("already_claimed"))
        close_old_connections()
        try:
            job = JVBatchJob.objects.get(pk=job_id)
        except JVBatchJob.DoesNotExist as exc:
            raise CommandError(f"JV batch job not found: {job_id}") from exc

        if job.status in {JVBatchJob.Status.APPLIED, JVBatchJob.Status.FAILED}:
            self.stdout.write(self.style.WARNING(f"JV batch job {job_id} already finished: {job.status}"))
            return

        logger.warning(
            "JV_BATCH_JOB_CLAIM_ATTEMPT code=jv_batch_job_claim_attempt job_id=%s status_before=%s payload_site_keys=%s runtime=%s",
            job_id,
            job.status,
            (job.request_payload or {}).get("site_keys"),
            _runtime_debug_context(),
        )
        print(
            "JV_BATCH_JOB_CLAIM_ATTEMPT",
            {
                "job_id": job_id,
                "status_before": job.status,
                "payload_site_keys": (job.request_payload or {}).get("site_keys"),
                "runtime": _runtime_debug_context(),
            },
        )
        if already_claimed:
            if job.status != JVBatchJob.Status.RUNNING:
                self.stdout.write(self.style.WARNING(f"JV batch job {job_id} is not running after worker claim: {job.status}"))
                return
        else:
            moved_to_running = JVBatchJob.objects.filter(pk=job_id, status=JVBatchJob.Status.PENDING).update(
                status=JVBatchJob.Status.RUNNING
            )
            job.refresh_from_db()
            if not moved_to_running:
                logger.warning(
                    "JV_BATCH_JOB_CLAIM_SKIPPED code=jv_batch_job_claim_skipped job_id=%s status_after=%s payload_site_keys=%s runtime=%s",
                    job_id,
                    job.status,
                    (job.request_payload or {}).get("site_keys"),
                    _runtime_debug_context(),
                )
                print(
                    "JV_BATCH_JOB_CLAIM_SKIPPED",
                    {
                        "job_id": job_id,
                        "status_after": job.status,
                        "payload_site_keys": (job.request_payload or {}).get("site_keys"),
                        "runtime": _runtime_debug_context(),
                    },
                )
                self.stdout.write(self.style.WARNING(f"JV batch job {job_id} is already running: {job.status}"))
                return
            logger.warning(
                "JV_BATCH_JOB_CLAIM_OK code=jv_batch_job_claim_ok job_id=%s status_after=%s payload_site_keys=%s runtime=%s",
                job_id,
                job.status,
                (job.request_payload or {}).get("site_keys"),
                _runtime_debug_context(),
            )
            print(
                "JV_BATCH_JOB_CLAIM_OK",
                {
                    "job_id": job_id,
                    "status_after": job.status,
                    "payload_site_keys": (job.request_payload or {}).get("site_keys"),
                    "runtime": _runtime_debug_context(),
                },
            )
        if job.operation == JVBatchJob.Operation.CREATE:
            # "create JV sofort" job: reuse the same worker but a different
            # handler (create-and-push per site instead of plan + update).
            from jv_services.create_service import run_create_job

            summary = run_create_job(job)
            logger.info(
                "JV_CREATE_WORKER_DONE code=jv_create_worker_done job_id=%s summary=%s", job_id, summary
            )
            self.stdout.write(self.style.SUCCESS(f"JV create job {job_id} done"))
            return

        update_job_progress(job, phase="building_plan", message="Worker is building the site plan.")

        if not job.items.exists():
            payload = job.request_payload or {}
            precomputed = load_job_precompute_context(job)
            if not precomputed:
                precomputed = build_job_precompute_context(ean=str(job.ean or "").strip(), payload=payload)
                save_job_precompute_context(job, precomputed=precomputed)
            plan_items = build_batch_plan(ean=str(job.ean or "").strip(), payload=payload, precomputed=precomputed)
            logger.warning(
                "JV_BATCH_JOB_PLAN_READY code=jv_batch_job_plan_ready job_id=%s payload_site_keys=%s precomputed_site_keys=%s plan_site_keys=%s runtime=%s",
                job_id,
                payload.get("site_keys"),
                precomputed.get("selected_site_keys"),
                [row.get("site_key") for row in plan_items],
                _runtime_debug_context(),
            )
            print(
                "JV_BATCH_JOB_PLAN_READY",
                {
                    "job_id": job_id,
                    "payload_site_keys": payload.get("site_keys"),
                    "precomputed_site_keys": precomputed.get("selected_site_keys"),
                    "plan_site_keys": [row.get("site_key") for row in plan_items],
                    "runtime": _runtime_debug_context(),
                },
            )
            forced_site_family = ImportedProduct.Site.JV
            for row in plan_items:
                JVBatchJobItem.objects.create(
                    job=job,
                    site=row.get("site") or forced_site_family,
                    site_key=row.get("site_key") or "",
                    domain=row.get("domain") or "",
                    status=row.get("status") or JVBatchJobItem.Status.PENDING,
                    source_product_id=row.get("source_product_id"),
                    effective_ean=row.get("effective_ean") or "",
                    currency_code=row.get("currency_code") or "",
                    old_price=_json_safe(row.get("old_price")),
                    new_price=_json_safe(row.get("new_price")),
                    error_code=row.get("error_code") or "",
                    error_text=row.get("error_text") or "",
                    details=_json_safe(row.get("details") or {}),
                )
        normalize_job_items_for_payload(job)
        update_job_progress(job, phase="plan_ready", message="Site plan is ready. Applying updates.")

        summary = apply_batch(job=job)
        logger.info("JV_BATCH_WORKER_DONE code=jv_batch_worker_done job_id=%s summary=%s", job_id, summary)
        self.stdout.write(self.style.SUCCESS(f"JV batch job {job_id} done"))
