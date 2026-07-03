from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .bot_client import TelegramBotClient
from .config import load_telegram_runtime_config
from .service import TelegramConversationService


logger = logging.getLogger(__name__)


class TelegramWebhookAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        config = load_telegram_runtime_config()
        if not config.enabled:
            return Response(
                {"code": "telegram_webhook_disabled", "detail": "Telegram webhook config is incomplete."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        provided_secret = str(request.headers.get("x-telegram-bot-api-secret-token") or "").strip()
        service = TelegramConversationService(config=config, bot=TelegramBotClient(config))
        if not service.validate_secret(provided_secret):
            return Response(
                {"code": "telegram_webhook_secret_invalid", "detail": "Invalid Telegram webhook secret."},
                status=status.HTTP_403_FORBIDDEN,
            )

        update = request.data if isinstance(request.data, dict) else None
        if update is None:
            return Response(
                {"code": "telegram_webhook_invalid_payload", "detail": "Expected Telegram Update JSON object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = service.handle_update(update)
        except Exception:  # noqa: BLE001
            logger.exception("TELEGRAM_WEBHOOK_UNHANDLED_ERROR")
            return Response(
                {"code": "telegram_webhook_processing_failed", "detail": "Webhook processing failed."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"ok": True, **result}, status=status.HTTP_200_OK)
