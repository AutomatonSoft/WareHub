import logging
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from telegram_service.bot_client import TelegramBotClient
from telegram_service.config import load_telegram_runtime_config
from telegram_service.notifier import TelegramMarketplaceJobNotifier


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run persistent Telegram marketplace notifier loop and deliver job results back to Telegram."

    def add_arguments(self, parser):
        parser.add_argument("--poll-interval", type=float, default=2.0)
        parser.add_argument("--max-jobs", type=int, default=0)
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        poll_interval = float(options["poll_interval"])
        max_jobs = int(options["max_jobs"])
        run_once = bool(options["once"])

        config = load_telegram_runtime_config()
        notifier = TelegramMarketplaceJobNotifier(
            config=config,
            bot=TelegramBotClient(config),
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Telegram marketplace notifier started (poll_interval={poll_interval}s, once={run_once}, max_jobs={max_jobs})"
            )
        )

        processed = 0
        while True:
            close_old_connections()
            handled = notifier.process_next_job()
            if handled:
                processed += 1
                if run_once or (max_jobs > 0 and processed >= max_jobs):
                    return
                continue

            if run_once:
                return
            time.sleep(poll_interval)
