import logging

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from jv_services.batch_service import _json_safe, apply_batch, build_batch_plan
from jv_services.models import ImportedProduct, JVBatchJob, JVBatchJobItem

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run JV batch job by id in worker process."

    def add_arguments(self, parser):
        parser.add_argument("job_id", type=int)

    def handle(self, *args, **options):
        job_id = int(options["job_id"])
        close_old_connections()
        try:
            job = JVBatchJob.objects.get(pk=job_id)
        except JVBatchJob.DoesNotExist as exc:
            raise CommandError(f"JV batch job not found: {job_id}") from exc

        if job.status in {JVBatchJob.Status.APPLIED, JVBatchJob.Status.FAILED}:
            self.stdout.write(self.style.WARNING(f"JV batch job {job_id} already finished: {job.status}"))
            return

        JVBatchJob.objects.filter(pk=job_id).update(status=JVBatchJob.Status.RUNNING)
        job.refresh_from_db()

        if not job.items.exists():
            payload = job.request_payload or {}
            plan_items = build_batch_plan(ean=str(job.ean or "").strip(), payload=payload)
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

        summary = apply_batch(job=job)
        logger.info("JV_BATCH_WORKER_DONE code=jv_batch_worker_done job_id=%s summary=%s", job_id, summary)
        self.stdout.write(self.style.SUCCESS(f"JV batch job {job_id} done"))
