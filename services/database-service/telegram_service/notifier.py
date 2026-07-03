from __future__ import annotations

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .bot_client import TelegramBotClient
from .config import TelegramRuntimeConfig
from .models import TelegramActionAudit, TelegramMarketplaceJob
from .orchestrator_client import TelegramMarketplaceJobClient
from .service import build_action_keyboard, _format_result_message


logger = logging.getLogger(__name__)

LEASE_SECONDS = 30
TERMINAL_JOB_STATUSES = {"completed", "failed"}


class TelegramMarketplaceJobNotifier:
    def __init__(
        self,
        *,
        config: TelegramRuntimeConfig,
        bot: TelegramBotClient,
        jobs: TelegramMarketplaceJobClient | None = None,
    ) -> None:
        self.config = config
        self.bot = bot
        self.jobs = jobs or TelegramMarketplaceJobClient(config)

    def process_next_job(self) -> bool:
        job = self._claim_next_job()
        if job is None:
            return False
        self._process_claimed_job(job)
        return True

    def _claim_next_job(self) -> TelegramMarketplaceJob | None:
        now = timezone.now()
        with transaction.atomic():
            job = (
                TelegramMarketplaceJob.objects.select_for_update(skip_locked=True)
                .filter(notification_sent_at__isnull=True)
                .filter(delivery_status__in=["pending", "processing"])
                .filter(lease_expires_at__isnull=True)
                .order_by("created_at")
                .first()
            )
            if job is None:
                job = (
                    TelegramMarketplaceJob.objects.select_for_update(skip_locked=True)
                    .filter(notification_sent_at__isnull=True, delivery_status="processing", lease_expires_at__lt=now)
                    .order_by("created_at")
                    .first()
                )
            if job is None:
                return None
            job.delivery_status = "processing"
            job.lease_expires_at = now + timedelta(seconds=LEASE_SECONDS)
            job.save(update_fields=["delivery_status", "lease_expires_at", "updated_at"])
            return job

    def _process_claimed_job(self, job: TelegramMarketplaceJob) -> None:
        try:
            payload = self.jobs.get_job(job_id=job.job_id)
            terminal = str(payload.get("job_status") or "").strip().lower() in TERMINAL_JOB_STATUSES
            if not terminal:
                self._mark_waiting(job=job, payload=payload)
                return

            self.bot.send_message(
                chat_id=job.chat_id,
                message_thread_id=int(job.thread_key) if job.thread_key else None,
                text=_format_result_message(self._action_label(job.action), job.kid_number, payload),
                reply_markup=build_action_keyboard(),
            )
            self._mark_sent(job=job, payload=payload)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "TELEGRAM_MARKETPLACE_JOB_NOTIFY_FAILED job_id=%s request_id=%s",
                job.job_id,
                job.request_id,
            )
            self._mark_retry(job=job, error_text=str(exc))

    @staticmethod
    def _action_label(action: str) -> str:
        return "Удаление завершено" if action == "delete" else "Выставление завершено"

    def _mark_waiting(self, *, job: TelegramMarketplaceJob, payload: dict) -> None:
        TelegramMarketplaceJob.objects.filter(pk=job.pk).update(
            job_status=str(payload.get("job_status") or job.job_status or "queued"),
            response_status=str(payload.get("status") or ""),
            result_payload=payload,
            error_text="",
            last_polled_at=timezone.now(),
            delivery_status="pending",
            lease_expires_at=None,
            updated_at=timezone.now(),
        )

    def _mark_sent(self, *, job: TelegramMarketplaceJob, payload: dict) -> None:
        now = timezone.now()
        with transaction.atomic():
            TelegramMarketplaceJob.objects.filter(pk=job.pk).update(
                job_status=str(payload.get("job_status") or "completed"),
                response_status=str(payload.get("status") or ""),
                result_payload=payload,
                error_text="",
                last_polled_at=now,
                delivery_status="sent",
                lease_expires_at=None,
                notification_sent_at=now,
                updated_at=now,
            )
            TelegramActionAudit.objects.create(
                chat_id=job.chat_id,
                telegram_user_id=job.telegram_user_id,
                thread_key=job.thread_key,
                action=job.action,
                kid_number=job.kid_number,
                place=job.place,
                request_id=job.request_id,
                status=str(payload.get("status") or "failed"),
                result_payload=payload,
            )

    def _mark_retry(self, *, job: TelegramMarketplaceJob, error_text: str) -> None:
        TelegramMarketplaceJob.objects.filter(pk=job.pk).update(
            error_text=error_text,
            last_polled_at=timezone.now(),
            delivery_status="pending",
            lease_expires_at=None,
            updated_at=timezone.now(),
        )
