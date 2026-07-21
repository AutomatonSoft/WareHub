from __future__ import annotations

import logging
import os
import tempfile
import time
from contextlib import contextmanager

import requests
from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from telegram_service.bot_client import TelegramBotClient
from telegram_service.config import load_telegram_runtime_config
from telegram_service.service import TelegramConversationService


logger = logging.getLogger(__name__)


@contextmanager
def _poller_single_instance_lock():
    lock_path = os.path.join(tempfile.gettempdir(), "warehub-telegram-update-poller.lock")
    lock_file = open(lock_path, "a+", encoding="utf-8")
    acquired = False

    try:
        if os.name == "nt":
            import msvcrt

            try:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                acquired = True
            except OSError as exc:
                raise CommandError(f"Telegram poller is already running (lock: {lock_path}).") from exc
        else:
            import fcntl

            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
            except OSError as exc:
                raise CommandError(f"Telegram poller is already running (lock: {lock_path}).") from exc

        lock_file.seek(0)
        lock_file.truncate()
        lock_file.write(str(os.getpid()))
        lock_file.flush()
        yield
    finally:
        try:
            if acquired:
                if os.name == "nt":
                    import msvcrt

                    lock_file.seek(0)
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        finally:
            lock_file.close()


class Command(BaseCommand):
    help = "Run Telegram bot in local long-polling mode instead of webhook delivery."

    ALLOWED_UPDATES = [
        "message",
        "edited_message",
        "channel_post",
        "edited_channel_post",
        "callback_query",
    ]

    def add_arguments(self, parser):
        parser.add_argument("--poll-timeout", type=int, default=30)
        parser.add_argument("--idle-sleep", type=float, default=1.0)
        parser.add_argument("--drop-pending-updates", action="store_true")
        parser.add_argument("--keep-webhook", action="store_true")
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        config = load_telegram_runtime_config()
        if not config.bot_token:
            raise CommandError("TELEGRAM_BOT_TOKEN is not configured.")

        with _poller_single_instance_lock():
            poll_timeout = max(int(options["poll_timeout"]), 1)
            idle_sleep = max(float(options["idle_sleep"]), 0.05)
            run_once = bool(options["once"])
            keep_webhook = bool(options["keep_webhook"])
            drop_pending_updates = bool(options["drop_pending_updates"])
            bot = TelegramBotClient(config)
            recovered_webhook_conflict = False

            if not keep_webhook:
                bot.delete_webhook(drop_pending_updates=drop_pending_updates)
                self.stdout.write(
                    self.style.WARNING(
                        "Telegram webhook deleted for local polling mode. Re-register the production webhook after local testing."
                    )
                )

            service = TelegramConversationService(config=config, bot=bot)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Telegram update poller started (mode={config.delivery_mode}, timeout={poll_timeout}s, once={run_once})"
                )
            )

            next_offset: int | None = None
            while True:
                close_old_connections()
                handled_any = False
                try:
                    updates = bot.get_updates(
                        offset=next_offset,
                        timeout_seconds=poll_timeout,
                        allowed_updates=self.ALLOWED_UPDATES,
                    )
                    recovered_webhook_conflict = False
                except requests.HTTPError as exc:
                    response = getattr(exc, "response", None)
                    if (
                        response is not None
                        and response.status_code == 409
                        and not keep_webhook
                        and not recovered_webhook_conflict
                    ):
                        logger.warning("TELEGRAM_POLLING_WEBHOOK_CONFLICT_RECOVERING")
                        bot.delete_webhook(drop_pending_updates=drop_pending_updates)
                        recovered_webhook_conflict = True
                        time.sleep(idle_sleep)
                        continue
                    logger.exception("TELEGRAM_POLLING_FAILED")
                    if run_once:
                        raise
                    time.sleep(idle_sleep)
                    continue
                except Exception:  # noqa: BLE001
                    logger.exception("TELEGRAM_POLLING_FAILED")
                    if run_once:
                        raise
                    time.sleep(idle_sleep)
                    continue

                for update in updates:
                    update_id = int(update.get("update_id") or 0)
                    if update_id > 0:
                        next_offset = update_id + 1
                    try:
                        service.handle_update(update)
                    except Exception:  # noqa: BLE001
                        logger.exception("TELEGRAM_POLLING_UPDATE_FAILED", extra={"update_id": update_id})
                    handled_any = True

                if run_once:
                    return
                if not handled_any:
                    time.sleep(idle_sleep)
