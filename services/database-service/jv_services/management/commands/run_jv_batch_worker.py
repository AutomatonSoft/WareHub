import logging
import time

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction, close_old_connections

from jv_services.models import JVBatchJob

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run persistent JV batch worker loop and process pending jobs."

    def add_arguments(self, parser):
        parser.add_argument("--poll-interval", type=float, default=2.0)

    def handle(self, *args, **options):
        poll_interval = float(options["poll_interval"])
        self.stdout.write(self.style.SUCCESS(f"JV batch worker started (poll_interval={poll_interval}s)"))

        while True:
            close_old_connections()
            job_id = self._claim_next_job_id()
            if not job_id:
                time.sleep(poll_interval)
                continue

            try:
                call_command("run_jv_batch_job", str(job_id))
            except Exception:
                logger.exception("JV_BATCH_WORKER_LOOP_JOB_FAILED code=jv_batch_worker_loop_job_failed job_id=%s", job_id)
                JVBatchJob.objects.filter(pk=job_id).update(status=JVBatchJob.Status.FAILED)

    @staticmethod
    def _claim_next_job_id() -> int | None:
        with transaction.atomic():
            job = (
                JVBatchJob.objects.select_for_update(skip_locked=True)
                .filter(status=JVBatchJob.Status.PENDING)
                .order_by("-created_at")
                .first()
            )
            if not job:
                return None
            job.status = JVBatchJob.Status.RUNNING
            job.save(update_fields=["status", "updated_at"])
            return int(job.id)
