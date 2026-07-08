from __future__ import annotations

import logging
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from telegram_service.bot_client import TelegramBotClient
from telegram_service.config import load_telegram_runtime_config
from telegram_service.service import TelegramConversationService


logger = logging.getLogger(__name__)


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

        poll_timeout = max(int(options["poll_timeout"]), 1)
        idle_sleep = max(float(options["idle_sleep"]), 0.05)
        run_once = bool(options["once"])
        bot = TelegramBotClient(config)

        if not options["keep_webhook"]:
            bot.delete_webhook(drop_pending_updates=bool(options["drop_pending_updates"]))
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
