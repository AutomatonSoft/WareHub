from __future__ import annotations

import requests
from django.core.management.base import BaseCommand, CommandError

from telegram_service.config import load_telegram_runtime_config


class Command(BaseCommand):
    help = "Register Telegram webhook for the configured bot."

    ALLOWED_UPDATES = [
        "message",
        "edited_message",
        "channel_post",
        "edited_channel_post",
        "callback_query",
    ]

    def add_arguments(self, parser):
        parser.add_argument("--base-url", required=True, help="Public HTTPS base URL, for example https://example.com")
        parser.add_argument(
            "--drop-pending-updates",
            action="store_true",
            help="Drop pending Telegram updates when registering the webhook.",
        )

    def handle(self, *args, **options):
        config = load_telegram_runtime_config()
        if not config.bot_token:
            raise CommandError("TELEGRAM_BOT_TOKEN is not configured.")
        if not config.webhook_secret:
            raise CommandError("TELEGRAM_WEBHOOK_SECRET is not configured.")

        base_url = str(options["base_url"]).strip().rstrip("/")
        if not base_url.startswith("https://"):
            raise CommandError("--base-url must start with https://")

        webhook_url = f"{base_url}{config.public_webhook_path}"
        response = requests.post(
            f"{config.api_base_url}/bot{config.bot_token}/setWebhook",
            json={
                "url": webhook_url,
                "secret_token": config.webhook_secret,
                "drop_pending_updates": bool(options.get("drop_pending_updates")),
                "allowed_updates": self.ALLOWED_UPDATES,
            },
            timeout=20,
        )
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict) or not body.get("ok"):
            raise CommandError(f"Telegram setWebhook failed: {body}")
        self.stdout.write(self.style.SUCCESS(f"Webhook registered: {webhook_url}"))
