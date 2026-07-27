from __future__ import annotations

import logging

from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission

from .bot_client import TelegramBotClient
from .config import load_telegram_runtime_config
from .models import TelegramAccessBinding
from .service import TelegramConversationService


logger = logging.getLogger(__name__)


def _session_role(request) -> str:
    session = getattr(request, "session", None)
    if session is None:
        return ""
    return str(session.get("role") or "").strip().lower()


def _session_actor(request) -> str:
    session = getattr(request, "session", None)
    if session is None:
        return ""
    for key in ("login", "username", "user", "email"):
        value = str(session.get(key) or "").strip()
        if value:
            return value
    return ""


def _ensure_admin(request) -> Response | None:
    if _session_role(request) != "admin":
        return Response(
            {"code": "telegram_access_forbidden", "detail": "Admin role required."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _serialize_binding(binding: TelegramAccessBinding) -> dict[str, object]:
    return {
        "id": binding.id,
        "telegram_user_id": binding.telegram_user_id,
        "chat_id": binding.chat_id,
        "thread_key": binding.thread_key,
        "username": binding.login,
        "display_name": binding.display_name,
        "email": binding.email or None,
        "app_user": {
            "id": binding.app_user_id or None,
            "username": binding.app_user_username or None,
            "login": binding.app_user_login or None,
            "email": binding.app_user_email or None,
        },
        "status": binding.status,
        "requested_at": binding.requested_at.isoformat() if binding.requested_at else None,
        "approved_at": binding.approved_at.isoformat() if binding.approved_at else None,
        "approved_by": binding.approved_by or None,
        "revoked_at": binding.revoked_at.isoformat() if binding.revoked_at else None,
        "revoked_by": binding.revoked_by or None,
        "last_seen_at": binding.last_seen_at.isoformat() if binding.last_seen_at else None,
        "created_at": binding.created_at.isoformat(),
        "updated_at": binding.updated_at.isoformat(),
    }


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


class TelegramAccessListAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        forbidden = _ensure_admin(request)
        if forbidden is not None:
            return forbidden

        queryset = TelegramAccessBinding.objects.all()
        status_filter = str(request.query_params.get("status") or "").strip().lower()
        search = str(request.query_params.get("search") or "").strip()
        sort = str(request.query_params.get("sort") or "newest").strip().lower()

        if status_filter in {
            TelegramAccessBinding.STATUS_PENDING,
            TelegramAccessBinding.STATUS_APPROVED,
            TelegramAccessBinding.STATUS_REVOKED,
        }:
            queryset = queryset.filter(status=status_filter)

        if search:
            search_filter = (
                Q(login__icontains=search)
                | Q(display_name__icontains=search)
                | Q(email__icontains=search)
            )
            if search.isdigit():
                search_filter |= Q(telegram_user_id=int(search)) | Q(chat_id=int(search))
            queryset = queryset.filter(search_filter)

        order_by = "requested_at" if sort == "oldest" else "-requested_at"
        queryset = queryset.order_by(order_by, "-id")

        return Response([_serialize_binding(binding) for binding in queryset], status=status.HTTP_200_OK)


class TelegramAccessApproveAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request, binding_id: int):
        forbidden = _ensure_admin(request)
        if forbidden is not None:
            return forbidden

        binding = TelegramAccessBinding.objects.filter(id=binding_id).first()
        if binding is None:
            return Response(
                {"code": "telegram_access_not_found", "detail": "Telegram access binding not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        actor = _session_actor(request)
        payload = request.data if isinstance(request.data, dict) else {}
        app_user = payload.get("app_user") if isinstance(payload.get("app_user"), dict) else {}
        binding.status = TelegramAccessBinding.STATUS_APPROVED
        binding.is_active = True
        binding.approved_at = timezone.now()
        binding.approved_by = actor
        binding.app_user_id = str(app_user.get("id") or "").strip()
        binding.app_user_username = str(app_user.get("username") or "").strip()
        binding.app_user_login = str(app_user.get("login") or "").strip()
        binding.app_user_email = str(app_user.get("email") or "").strip().lower()
        binding.revoked_at = None
        binding.revoked_by = ""
        binding.save(
            update_fields=[
                "status",
                "is_active",
                "approved_at",
                "approved_by",
                "app_user_id",
                "app_user_username",
                "app_user_login",
                "app_user_email",
                "revoked_at",
                "revoked_by",
                "updated_at",
            ]
        )
        logger.info("TELEGRAM_ACCESS_APPROVED", extra={"binding_id": binding.id, "actor": actor})
        return Response(_serialize_binding(binding), status=status.HTTP_200_OK)


class TelegramAccessRevokeAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request, binding_id: int):
        forbidden = _ensure_admin(request)
        if forbidden is not None:
            return forbidden

        binding = TelegramAccessBinding.objects.filter(id=binding_id).first()
        if binding is None:
            return Response(
                {"code": "telegram_access_not_found", "detail": "Telegram access binding not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        actor = _session_actor(request)
        binding.status = TelegramAccessBinding.STATUS_REVOKED
        binding.is_active = False
        binding.revoked_at = timezone.now()
        binding.revoked_by = actor
        binding.save(
            update_fields=[
                "status",
                "is_active",
                "revoked_at",
                "revoked_by",
                "updated_at",
            ]
        )
        logger.info("TELEGRAM_ACCESS_REVOKED", extra={"binding_id": binding.id, "actor": actor})
        return Response(_serialize_binding(binding), status=status.HTTP_200_OK)


class TelegramAccessDeleteAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def delete(self, request, binding_id: int):
        forbidden = _ensure_admin(request)
        if forbidden is not None:
            return forbidden

        binding = TelegramAccessBinding.objects.filter(id=binding_id).first()
        if binding is None:
            return Response(
                {"code": "telegram_access_not_found", "detail": "Telegram access binding not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        actor = _session_actor(request)
        binding.delete()
        logger.info("TELEGRAM_ACCESS_DELETED", extra={"binding_id": binding_id, "actor": actor})
        return Response(status=status.HTTP_204_NO_CONTENT)
