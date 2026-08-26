from __future__ import annotations

import logging
from dataclasses import dataclass
from hmac import compare_digest
from typing import Any
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from database.kid_number_utils import primary_kid_number
from database.models import Kid

from .bot_client import TelegramBotClient
from .config import TelegramRuntimeConfig
from .kids_client import TelegramKidsClient
from .models import (
    TelegramAccessBinding,
    TelegramActionAudit,
    TelegramConversationState,
    TelegramMarketplaceJob,
    TelegramUpdateAudit,
)
from .orchestrator_client import TelegramMarketplaceJobClient


logger = logging.getLogger(__name__)

ACTION_DELETE_LABEL = "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0442\u043e\u0432\u0430\u0440"
ACTION_LIST_LABEL = "\u0412\u044b\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0442\u043e\u0432\u0430\u0440"
ACTION_CANCEL_LABEL = "\u041e\u0442\u043c\u0435\u043d\u0430"
CONFIRM_YES_LABEL = "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c"
REQUEST_ACCESS_LABEL = "\u041f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0434\u043e\u0441\u0442\u0443\u043f"
SKIP_OPTIONAL_LABEL = "\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c"

LEGACY_ACTION_DELETE = "action:delete"
LEGACY_ACTION_LIST = "action:list"
LEGACY_ACTION_CANCEL = "action:cancel"
LEGACY_CONFIRM_YES = "confirm:yes"
LEGACY_CONFIRM_NO = "confirm:no"


@dataclass
class TelegramUpdateContext:
    update_id: int
    update_type: str
    chat_id: int | None
    user_id: int | None
    username: str
    display_name: str
    text: str
    callback_data: str
    callback_query_id: str
    message_id: int | None
    message_thread_id: int | None

    @property
    def thread_key(self) -> str:
        return str(self.message_thread_id or "")


def build_action_keyboard() -> dict[str, Any]:
    return {
        "keyboard": [
            [
                {"text": ACTION_DELETE_LABEL},
                {"text": ACTION_LIST_LABEL},
            ],
            [
                {"text": ACTION_CANCEL_LABEL},
            ],
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False,
        "input_field_placeholder": "\u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435",
    }


def build_confirm_keyboard() -> dict[str, Any]:
    return {
        "keyboard": [
            [
                {"text": CONFIRM_YES_LABEL},
                {"text": ACTION_CANCEL_LABEL},
            ]
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False,
        "input_field_placeholder": "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438 \u0438\u043b\u0438 \u043e\u0442\u043c\u0435\u043d\u0438",
    }


def build_access_keyboard() -> dict[str, Any]:
    return {
        "keyboard": [[{"text": REQUEST_ACCESS_LABEL}]],
        "resize_keyboard": True,
        "one_time_keyboard": False,
        "input_field_placeholder": "\u0417\u0430\u043f\u0440\u043e\u0441\u0438 \u0434\u043e\u0441\u0442\u0443\u043f",
    }


def build_optional_step_keyboard() -> dict[str, Any]:
    return {
        "keyboard": [
            [{"text": SKIP_OPTIONAL_LABEL}],
            [{"text": ACTION_CANCEL_LABEL}],
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False,
        "input_field_placeholder": "\u0412\u0432\u0435\u0434\u0438 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u0438\u043b\u0438 \u043f\u0440\u043e\u043f\u0443\u0441\u0442\u0438 \u0448\u0430\u0433",
    }


def _extract_update_context(update: dict[str, Any]) -> TelegramUpdateContext:
    callback = update.get("callback_query") if isinstance(update.get("callback_query"), dict) else None
    message = None
    if callback and isinstance(callback.get("message"), dict):
        message = callback["message"]
    elif isinstance(update.get("message"), dict):
        message = update["message"]

    from_user = None
    if callback and isinstance(callback.get("from"), dict):
        from_user = callback["from"]
    elif message and isinstance(message.get("from"), dict):
        from_user = message["from"]

    chat = message.get("chat") if isinstance(message, dict) and isinstance(message.get("chat"), dict) else {}
    user_first = str((from_user or {}).get("first_name") or "").strip()
    user_last = str((from_user or {}).get("last_name") or "").strip()
    display_name = " ".join(part for part in (user_first, user_last) if part).strip()

    return TelegramUpdateContext(
        update_id=int(update.get("update_id") or 0),
        update_type="callback_query" if callback else "message",
        chat_id=int(chat["id"]) if isinstance(chat.get("id"), int) else None,
        user_id=int(from_user["id"]) if isinstance((from_user or {}).get("id"), int) else None,
        username=str((from_user or {}).get("username") or "").strip(),
        display_name=display_name,
        text=str(message.get("text") or "").strip() if isinstance(message, dict) else "",
        callback_data=str(callback.get("data") or "").strip() if callback else "",
        callback_query_id=str(callback.get("id") or "").strip() if callback else "",
        message_id=int(message["message_id"]) if isinstance(message, dict) and isinstance(message.get("message_id"), int) else None,
        message_thread_id=int(message["message_thread_id"]) if isinstance(message, dict) and isinstance(message.get("message_thread_id"), int) else None,
    )


def _is_place_text(value: str) -> bool:
    return value.lstrip("-").isdigit() and bool(value.strip())


def _is_quantity_text(value: str) -> bool:
    return value.isdigit() and bool(value.strip())


def _is_price_text(value: str) -> bool:
    normalized = str(value or "").strip().replace(",", ".")
    if not normalized:
        return False
    try:
        float(normalized)
    except ValueError:
        return False
    return True


def _normalize_price_text(value: str) -> str:
    return str(value or "").strip().replace(",", ".")


def _is_main_ean_text(value: str) -> bool:
    normalized = str(value or "").strip()
    return len(normalized) == 13 and normalized.isdigit()


def _normalize_command_text(value: str) -> str:
    return str(value or "").strip().casefold()


def _parse_listing_form(text: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for raw_line in str(text or "").splitlines():
        line = raw_line.strip()
        if not line or ":" not in line:
            continue
        raw_key, raw_value = line.split(":", 1)
        key = raw_key.strip().casefold()
        value = raw_value.strip()
        if not value:
            continue
        if key in {"kid", "kid_number"}:
            parsed["kid_number"] = value
        elif key in {"place", "platz", "место"}:
            parsed["place"] = value
        elif key in {"main_ean_jv", "ean", "eanka"}:
            parsed["main_ean_jv"] = value
        elif key in {"quantity", "qty", "count", "количество"}:
            parsed["quantity"] = value
        elif key in {"price", "цена"}:
            parsed["price"] = value
    return parsed


def _build_listing_form_prompt(kid: Kid | None = None) -> str:
    lines = [
        "Отправь данные одним сообщением по шаблону:",
        "",
        "KID: 538053450",
        "Place: 9999",
        "main_ean_jv: 4260174428871",
        "Quantity: 5",
        "Price: 4564",
        "",
        "Обязательные поля: KID, Place",
        "Опциональные поля: main_ean_jv, Quantity, Price",
    ]
    if kid is not None:
        lines.extend(
            [
                "",
                "Найдена локальная запись:",
                _format_kid_summary(kid),
            ]
        )
    return "\n".join(lines)


def _lookup_kid_by_number(kid_number: str) -> Kid | None:
    normalized = str(kid_number or "").strip()
    if not normalized:
        return None
    return Kid.objects.filter(kid_number__contains=[normalized]).order_by("id").first()


def _format_kid_summary(kid: Kid) -> str:
    ean_row = getattr(kid, "ean", None)
    status_row = getattr(kid, "status", None)
    product = getattr(kid, "product_attributes", None)
    return "\n".join(
        [
            f"KID: {primary_kid_number(kid.kid_number)}",
            f"Place: {kid.place or '-'}",
            f"JV EAN: {getattr(ean_row, 'jv', '') or '-'}",
            f"Main EAN JV: {getattr(ean_row, 'main_ean_jv', '') or '-'}",
            f"Quantity: {getattr(product, 'quantity', '') or '-'}",
            f"Status JV: {'on' if bool(getattr(status_row, 'jv', False)) else 'off'}",
        ]
    )


def _format_result_message(action_label: str, kid_number: str, payload: dict[str, Any]) -> str:
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    results = payload.get("results") if isinstance(payload.get("results"), list) else []
    success_sites: list[str] = []
    failed_sites: list[str] = []
    for row in results:
        if not isinstance(row, dict):
            continue
        site_key = str(row.get("site_key") or row.get("channel") or "-").strip()
        if row.get("ok"):
            success_sites.append(site_key)
        else:
            failed_sites.append(site_key)
    lines = [
        f"{action_label}: {kid_number}",
        f"Status: {payload.get('status') or '-'}",
        f"Success: {summary.get('success', 0)} / {summary.get('total', len(results))}",
    ]
    if success_sites:
        lines.append("OK: " + ", ".join(success_sites))
    if failed_sites:
        lines.append("Failed: " + ", ".join(failed_sites))
    return "\n".join(lines)


class TelegramConversationService:
    def __init__(self, *, config: TelegramRuntimeConfig, bot: TelegramBotClient) -> None:
        self.config = config
        self.bot = bot
        self.kids = TelegramKidsClient(config)
        self.marketplace_jobs = TelegramMarketplaceJobClient(config)

    def validate_secret(self, provided_secret: str) -> bool:
        expected = self.config.webhook_secret
        if not expected:
            return False
        return compare_digest(str(provided_secret or "").strip(), expected)

    @transaction.atomic
    def handle_update(self, update: dict[str, Any]) -> dict[str, Any]:
        ctx = _extract_update_context(update)
        if not ctx.update_id:
            return {"status": "ignored", "reason": "missing_update_id"}

        audit, created = TelegramUpdateAudit.objects.get_or_create(
            update_id=ctx.update_id,
            defaults={
                "chat_id": ctx.chat_id,
                "telegram_user_id": ctx.user_id,
                "thread_key": ctx.thread_key,
                "update_type": ctx.update_type,
                "status": "processed",
                "payload": update,
            },
        )
        if not created:
            return {"status": "ignored", "reason": "duplicate_update"}

        if not self._is_allowed_context(ctx):
            audit.status = "ignored"
            audit.error_text = "Update ignored by chat/thread policy."
            audit.save(update_fields=["status", "error_text", "processed_at"])
            return {"status": "ignored", "reason": "unauthorized_scope"}

        try:
            result = self._dispatch(ctx)
            audit.status = result.get("status", "processed")
            audit.error_text = str(result.get("reason") or "")
            audit.save(update_fields=["status", "error_text", "processed_at"])
            return result
        except Exception as exc:  # noqa: BLE001
            logger.exception("TELEGRAM_WEBHOOK_PROCESSING_FAILED")
            audit.status = "failed"
            audit.error_text = str(exc)
            audit.save(update_fields=["status", "error_text", "processed_at"])
            raise

    def _is_allowed_context(self, ctx: TelegramUpdateContext) -> bool:
        if ctx.chat_id is None or ctx.user_id is None:
            return False
        if self.config.chat_id is not None and ctx.chat_id != self.config.chat_id:
            return False
        if self.config.message_thread_id is not None and ctx.message_thread_id != self.config.message_thread_id:
            return False
        return True

    def _dispatch(self, ctx: TelegramUpdateContext) -> dict[str, Any]:
        if ctx.callback_query_id:
            self.bot.answer_callback_query(callback_query_id=ctx.callback_query_id)

        normalized_text = _normalize_command_text(ctx.text)
        callback_data = str(ctx.callback_data or "").strip()

        if normalized_text in {"/start", "/menu"}:
            self._reset_state(ctx)
            return self._show_entrypoint(ctx)

        access_binding = self._get_access_binding(ctx)
        if access_binding is not None and access_binding.status == TelegramAccessBinding.STATUS_APPROVED:
            self._touch_binding(access_binding, ctx)

        if normalized_text == "/cancel" or normalized_text == _normalize_command_text(ACTION_CANCEL_LABEL):
            self._reset_state(ctx)
            if access_binding is not None and access_binding.status == TelegramAccessBinding.STATUS_APPROVED:
                self._send_action_menu(ctx, "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043e\u0442\u043c\u0435\u043d\u0435\u043d\u043e. \u0412\u044b\u0431\u0435\u0440\u0438 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433:")
                return {"status": "processed"}
            self._send_access_state_message(ctx, access_binding)
            return {"status": "processed"}

        if access_binding is None or access_binding.status != TelegramAccessBinding.STATUS_APPROVED:
            return self._handle_pre_auth(ctx, normalized_text)

        if normalized_text in {
            _normalize_command_text(ACTION_DELETE_LABEL),
            _normalize_command_text(ACTION_LIST_LABEL),
        } or callback_data in {LEGACY_ACTION_DELETE, LEGACY_ACTION_LIST}:
            return self._handle_action_choice(ctx)

        if normalized_text == _normalize_command_text(CONFIRM_YES_LABEL) or callback_data == LEGACY_CONFIRM_YES:
            return self._handle_confirmation(ctx)

        if callback_data in {LEGACY_ACTION_CANCEL, LEGACY_CONFIRM_NO}:
            self._reset_state(ctx)
            self._send_action_menu(ctx, "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043e\u0442\u043c\u0435\u043d\u0435\u043d\u043e. \u0412\u044b\u0431\u0435\u0440\u0438 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433:")
            return {"status": "processed"}

        state_row = self._get_or_create_state(ctx)
        if state_row.state == "awaiting_kid":
            return self._handle_kid_input(ctx, state_row)
        if state_row.state == "awaiting_list_form":
            return self._handle_list_form_input(ctx, state_row)
        if state_row.state == "awaiting_place":
            return self._handle_place_input(ctx, state_row)
        if state_row.state == "awaiting_main_ean":
            return self._handle_main_ean_input(ctx, state_row)
        if state_row.state == "awaiting_quantity":
            return self._handle_quantity_input(ctx, state_row)
        if state_row.state == "awaiting_price":
            return self._handle_price_input(ctx, state_row)

        self._send_action_menu(ctx, "\u041d\u0435 \u043f\u043e\u043d\u044f\u043b \u043a\u043e\u043c\u0430\u043d\u0434\u0443. \u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435:")
        return {"status": "ignored", "reason": "unknown_input"}

    def _show_entrypoint(self, ctx: TelegramUpdateContext) -> dict[str, Any]:
        binding = self._get_access_binding(ctx)
        if binding is not None and binding.status == TelegramAccessBinding.STATUS_APPROVED:
            self._touch_binding(binding, ctx)
            self._send_action_menu(ctx, "\u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435:")
            return {"status": "processed"}
        self._send_access_state_message(ctx, binding)
        return {"status": "processed"}

    def _handle_pre_auth(self, ctx: TelegramUpdateContext, normalized_text: str) -> dict[str, Any]:
        state_row = self._get_or_create_state(ctx)
        binding = self._get_access_binding(ctx)
        if binding is not None:
            self._touch_binding(binding, ctx)
        if state_row.state == "awaiting_access_email":
            return self._handle_access_email_input(ctx, state_row)

        if normalized_text == _normalize_command_text(REQUEST_ACCESS_LABEL):
            state_row.state = "awaiting_access_email"
            state_row.payload = {}
            state_row.save(update_fields=["state", "payload", "updated_at"])
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="\u041e\u0442\u043f\u0440\u0430\u0432\u044c email, \u043a\u043e\u0442\u043e\u0440\u044b\u0439 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0448\u044c \u043d\u0430 \u0441\u0430\u0439\u0442\u0435 WareHub.",
                reply_markup=build_access_keyboard(),
            )
            return {"status": "processed"}

        self._send_access_state_message(ctx, binding)
        return {"status": "ignored", "reason": "access_not_approved"}

    def _handle_access_email_input(
        self,
        ctx: TelegramUpdateContext,
        state_row: TelegramConversationState,
    ) -> dict[str, Any]:
        email = str(ctx.text or "").strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="\u041d\u0443\u0436\u0435\u043d \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 email. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u0435\u0449\u0435 \u0440\u0430\u0437.",
                reply_markup=build_access_keyboard(),
            )
            return {"status": "ignored", "reason": "invalid_access_email"}

        now = timezone.now()
        binding, _created = TelegramAccessBinding.objects.update_or_create(
            telegram_user_id=ctx.user_id or 0,
            chat_id=ctx.chat_id or 0,
            defaults={
                "thread_key": ctx.thread_key,
                "login": ctx.username,
                "display_name": ctx.display_name,
                "email": email,
                "status": TelegramAccessBinding.STATUS_PENDING,
                "is_active": False,
                "requested_at": now,
                "approved_at": None,
                "approved_by": "",
                "revoked_at": None,
                "revoked_by": "",
                "last_seen_at": now,
            },
        )
        state_row.state = "idle"
        state_row.payload = {}
        state_row.save(update_fields=["state", "payload", "updated_at"])
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text="\u0417\u0430\u044f\u0432\u043a\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430. \u041e\u0436\u0438\u0434\u0430\u0439 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430.",
            reply_markup=build_access_keyboard(),
        )
        logger.info(
            "TELEGRAM_ACCESS_REQUEST_CREATED",
            extra={
                "telegram_user_id": binding.telegram_user_id,
                "chat_id": binding.chat_id,
                "email": binding.email,
            },
        )
        return {"status": "processed"}

    def _send_access_state_message(
        self,
        ctx: TelegramUpdateContext,
        binding: TelegramAccessBinding | None,
    ) -> None:
        if binding is None:
            text = "\u0423 \u0442\u0435\u0431\u044f \u043d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0430 \u043a \u044d\u0442\u043e\u043c\u0443 \u0431\u043e\u0442\u0443."
        elif binding.status == TelegramAccessBinding.STATUS_PENDING:
            text = "\u0417\u0430\u044f\u0432\u043a\u0430 \u0443\u0436\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430 \u0438 \u0436\u0434\u0451\u0442 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f."
        else:
            text = "\u0414\u043e\u0441\u0442\u0443\u043f \u043e\u0442\u043a\u043b\u044e\u0447\u0451\u043d. \u041e\u0431\u0440\u0430\u0442\u0438\u0441\u044c \u043a \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0443."

        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text=text,
            reply_markup=build_access_keyboard(),
        )

    def _get_access_binding(self, ctx: TelegramUpdateContext) -> TelegramAccessBinding | None:
        if ctx.chat_id is None or ctx.user_id is None:
            return None
        binding = TelegramAccessBinding.objects.filter(
            telegram_user_id=ctx.user_id,
            chat_id=ctx.chat_id,
        ).first()
        if binding is None:
            return None
        if binding.thread_key and binding.thread_key != ctx.thread_key:
            return None
        return binding

    def _touch_binding(self, binding: TelegramAccessBinding, ctx: TelegramUpdateContext) -> None:
        updated = False
        if binding.thread_key != ctx.thread_key:
            binding.thread_key = ctx.thread_key
            updated = True
        if binding.login != ctx.username:
            binding.login = ctx.username
            updated = True
        if binding.display_name != ctx.display_name:
            binding.display_name = ctx.display_name
            updated = True
        binding.last_seen_at = timezone.now()
        update_fields = ["last_seen_at", "updated_at"]
        if updated:
            update_fields.extend(["thread_key", "login", "display_name"])
        binding.save(update_fields=update_fields)

    def _get_or_create_state(self, ctx: TelegramUpdateContext) -> TelegramConversationState:
        state_row, _created = TelegramConversationState.objects.get_or_create(
            chat_id=ctx.chat_id or 0,
            telegram_user_id=ctx.user_id or 0,
            thread_key=ctx.thread_key,
            defaults={"state": "awaiting_action", "payload": {}},
        )
        return state_row

    def _reset_state(self, ctx: TelegramUpdateContext) -> None:
        state_row = self._get_or_create_state(ctx)
        state_row.state = "awaiting_action"
        state_row.payload = {}
        state_row.save(update_fields=["state", "payload", "updated_at"])

    def _send_action_menu(self, ctx: TelegramUpdateContext, text: str) -> None:
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text=text,
            reply_markup=build_action_keyboard(),
        )

    def _handle_action_choice(self, ctx: TelegramUpdateContext) -> dict[str, Any]:
        normalized_text = _normalize_command_text(ctx.text)
        action = "delete" if normalized_text == _normalize_command_text(ACTION_DELETE_LABEL) or ctx.callback_data == LEGACY_ACTION_DELETE else "list"
        state_row = self._get_or_create_state(ctx)
        if action == "list":
            state_row.state = "awaiting_kid"
            state_row.payload = {"action": action}
            state_row.save(update_fields=["state", "payload", "updated_at"])
            prompt = "\u0412\u0432\u0435\u0434\u0438 KID \u0434\u043b\u044f \u0432\u044b\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u0442\u043e\u0432\u0430\u0440\u0430:"
        else:
            state_row.state = "awaiting_kid"
            state_row.payload = {"action": action}
            state_row.save(update_fields=["state", "payload", "updated_at"])
            prompt = "\u0412\u0432\u0435\u0434\u0438 KID \u0434\u043b\u044f \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u044f:"
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text=prompt,
            reply_markup=build_action_keyboard(),
        )
        return {"status": "processed"}

    def _handle_kid_input(self, ctx: TelegramUpdateContext, state_row: TelegramConversationState) -> dict[str, Any]:
        action = str(state_row.payload.get("action") or "").strip()
        if action == "list":
            kid_number = str(ctx.text or "").strip()
            if not kid_number:
                self.bot.send_message(
                    chat_id=ctx.chat_id or 0,
                    message_thread_id=ctx.message_thread_id,
                    text="KID \u043d\u0435 \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u043f\u0443\u0441\u0442\u044b\u043c. \u0412\u0432\u0435\u0434\u0438 KID \u0435\u0449\u0451 \u0440\u0430\u0437.",
                    reply_markup=build_action_keyboard(),
                )
                return {"status": "ignored", "reason": "kid_missing"}

            kid = _lookup_kid_by_number(kid_number)
            state_row.state = "awaiting_place"
            state_row.payload = {
                "action": "list",
                "kid_number": kid_number,
            }
            state_row.save(update_fields=["state", "payload", "updated_at"])

            prompt_lines = [
                f"KID: {kid_number}",
                "\u0412\u0432\u0435\u0434\u0438 Place (\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e):",
            ]
            if kid is not None:
                prompt_lines.insert(0, _format_kid_summary(kid))
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="\n".join(prompt_lines),
                reply_markup=build_action_keyboard(),
            )
            return {"status": "processed"}

        kid = _lookup_kid_by_number(ctx.text)
        if kid is None:
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text=f"KID \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d: {ctx.text}",
                reply_markup=build_action_keyboard(),
            )
            return {"status": "ignored", "reason": "kid_not_found"}

        state_row.state = "awaiting_confirmation"
        state_row.payload = {
            "action": action,
            "kid_number": primary_kid_number(kid.kid_number),
            "place": "",
        }
        state_row.save(update_fields=["state", "payload", "updated_at"])
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text="\n".join(
                [
                    "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438 \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u0435 \u0442\u043e\u0432\u0430\u0440\u0430:",
                    _format_kid_summary(kid),
                ]
            ),
            reply_markup=build_confirm_keyboard(),
        )
        return {"status": "processed"}

    def _handle_list_form_input(self, ctx: TelegramUpdateContext, state_row: TelegramConversationState) -> dict[str, Any]:
        payload = _parse_listing_form(ctx.text)
        kid_number = str(payload.get("kid_number") or "").strip()
        place = str(payload.get("place") or "").strip()
        if not kid_number or not place:
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="Нужно заполнить обязательные поля KID и Place одним сообщением.",
                reply_markup=build_action_keyboard(),
            )
            return {"status": "ignored", "reason": "missing_required_list_form_fields"}
        if not _is_place_text(place):
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="Place должен быть целым числом. Отправь форму ещё раз.",
                reply_markup=build_action_keyboard(),
            )
            return {"status": "ignored", "reason": "invalid_place"}

        normalized_payload: dict[str, Any] = {
            "action": "list",
            "kid_number": kid_number,
            "place": place,
        }
        main_ean_jv = str(payload.get("main_ean_jv") or "").strip()
        if main_ean_jv:
            if not _is_main_ean_text(main_ean_jv):
                self.bot.send_message(
                    chat_id=ctx.chat_id or 0,
                    message_thread_id=ctx.message_thread_id,
                    text="main_ean_jv должен состоять ровно из 13 цифр. Отправь форму ещё раз.",
                    reply_markup=build_action_keyboard(),
                )
                return {"status": "ignored", "reason": "invalid_main_ean_jv"}
            normalized_payload["main_ean_jv"] = main_ean_jv

        quantity_text = str(payload.get("quantity") or "").strip()
        if quantity_text:
            if not _is_quantity_text(quantity_text):
                self.bot.send_message(
                    chat_id=ctx.chat_id or 0,
                    message_thread_id=ctx.message_thread_id,
                    text="Quantity должен быть целым числом 0 или больше. Отправь форму ещё раз.",
                    reply_markup=build_action_keyboard(),
                )
                return {"status": "ignored", "reason": "invalid_quantity"}
            normalized_payload["quantity"] = int(quantity_text)

        price_text = str(payload.get("price") or "").strip()
        if price_text:
            if not _is_price_text(price_text):
                self.bot.send_message(
                    chat_id=ctx.chat_id or 0,
                    message_thread_id=ctx.message_thread_id,
                    text="Price должен быть числом. Отправь форму ещё раз.",
                    reply_markup=build_action_keyboard(),
                )
                return {"status": "ignored", "reason": "invalid_price"}
            normalized_payload["price"] = _normalize_price_text(price_text)

        state_row.state = "awaiting_confirmation"
        state_row.payload = normalized_payload
        state_row.save(update_fields=["state", "payload", "updated_at"])
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text="\n".join(
                [
                    "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438 \u0432\u044b\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0442\u043e\u0432\u0430\u0440\u0430:",
                    f"KID: {kid_number}",
                    f"Place: {place}",
                    f"main_ean_jv: {normalized_payload.get('main_ean_jv') or '-'}",
                    f"Quantity: {normalized_payload.get('quantity') if 'quantity' in normalized_payload else '-'}",
                    f"Price: {normalized_payload.get('price') or '-'}",
                ]
            ),
            reply_markup=build_confirm_keyboard(),
        )
        return {"status": "processed"}

    def _handle_place_input(self, ctx: TelegramUpdateContext, state_row: TelegramConversationState) -> dict[str, Any]:
        if not _is_place_text(ctx.text):
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="Place \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0446\u0435\u043b\u044b\u043c \u0447\u0438\u0441\u043b\u043e\u043c. \u0412\u0432\u0435\u0434\u0438 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437.",
                reply_markup=build_action_keyboard(),
            )
            return {"status": "ignored", "reason": "invalid_place"}
        kid_number = str(state_row.payload.get("kid_number") or "").strip()
        kid = _lookup_kid_by_number(kid_number)
        place_value = ctx.text.strip()
        state_row.state = "awaiting_main_ean"
        state_row.payload = {
            "action": "list",
            "kid_number": kid_number,
            "place": place_value,
        }
        state_row.save(update_fields=["state", "payload", "updated_at"])
        confirm_lines = [
            "Place \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d.",
            f"KID: {kid_number}",
            f"\u041d\u043e\u0432\u044b\u0439 place: {place_value}",
            "\u0412\u0432\u0435\u0434\u0438 main_ean_jv (13 \u0446\u0438\u0444\u0440) \u0438\u043b\u0438 \u043d\u0430\u0436\u043c\u0438 '\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c':",
        ]
        if kid is not None:
            confirm_lines.insert(1, _format_kid_summary(kid))
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text="\n".join(confirm_lines),
            reply_markup=build_optional_step_keyboard(),
        )
        return {"status": "processed"}

    def _handle_main_ean_input(self, ctx: TelegramUpdateContext, state_row: TelegramConversationState) -> dict[str, Any]:
        if _normalize_command_text(ctx.text) == _normalize_command_text(SKIP_OPTIONAL_LABEL):
            payload = dict(state_row.payload)
            state_row.state = "awaiting_quantity"
            state_row.payload = payload
            state_row.save(update_fields=["state", "payload", "updated_at"])
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="\u0412\u0432\u0435\u0434\u0438 quantity (\u0446\u0435\u043b\u043e\u0435 \u0447\u0438\u0441\u043b\u043e, 0 \u0438\u043b\u0438 \u0431\u043e\u043b\u044c\u0448\u0435) \u0438\u043b\u0438 \u043d\u0430\u0436\u043c\u0438 '\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c':",
                reply_markup=build_optional_step_keyboard(),
            )
            return {"status": "processed"}

        if not _is_main_ean_text(ctx.text):
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="main_ean_jv \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0441\u0442\u043e\u044f\u0442\u044c \u0440\u043e\u0432\u043d\u043e \u0438\u0437 13 \u0446\u0438\u0444\u0440. \u0412\u0432\u0435\u0434\u0438 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437.",
                reply_markup=build_optional_step_keyboard(),
            )
            return {"status": "ignored", "reason": "invalid_main_ean_jv"}
        payload = dict(state_row.payload)
        payload["main_ean_jv"] = ctx.text.strip()
        state_row.state = "awaiting_quantity"
        state_row.payload = payload
        state_row.save(update_fields=["state", "payload", "updated_at"])
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text="\u0412\u0432\u0435\u0434\u0438 quantity (\u0446\u0435\u043b\u043e\u0435 \u0447\u0438\u0441\u043b\u043e, 0 \u0438\u043b\u0438 \u0431\u043e\u043b\u044c\u0448\u0435) \u0438\u043b\u0438 \u043d\u0430\u0436\u043c\u0438 '\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c':",
            reply_markup=build_optional_step_keyboard(),
        )
        return {"status": "processed"}

    def _handle_quantity_input(self, ctx: TelegramUpdateContext, state_row: TelegramConversationState) -> dict[str, Any]:
        if _normalize_command_text(ctx.text) == _normalize_command_text(SKIP_OPTIONAL_LABEL):
            payload = dict(state_row.payload)
            state_row.state = "awaiting_price"
            state_row.payload = payload
            state_row.save(update_fields=["state", "payload", "updated_at"])
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="\u0412\u0432\u0435\u0434\u0438 price (\u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 199.99) \u0438\u043b\u0438 \u043d\u0430\u0436\u043c\u0438 '\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c':",
                reply_markup=build_optional_step_keyboard(),
            )
            return {"status": "processed"}

        if not _is_quantity_text(ctx.text):
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="Quantity \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0446\u0435\u043b\u044b\u043c \u0447\u0438\u0441\u043b\u043e\u043c 0 \u0438\u043b\u0438 \u0431\u043e\u043b\u044c\u0448\u0435. \u0412\u0432\u0435\u0434\u0438 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437.",
                reply_markup=build_optional_step_keyboard(),
            )
            return {"status": "ignored", "reason": "invalid_quantity"}
        payload = dict(state_row.payload)
        payload["quantity"] = int(ctx.text.strip())
        state_row.state = "awaiting_price"
        state_row.payload = payload
        state_row.save(update_fields=["state", "payload", "updated_at"])
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text="\u0412\u0432\u0435\u0434\u0438 price (\u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 199.99) \u0438\u043b\u0438 \u043d\u0430\u0436\u043c\u0438 '\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c':",
            reply_markup=build_optional_step_keyboard(),
        )
        return {"status": "processed"}

    def _handle_price_input(self, ctx: TelegramUpdateContext, state_row: TelegramConversationState) -> dict[str, Any]:
        if _normalize_command_text(ctx.text) == _normalize_command_text(SKIP_OPTIONAL_LABEL):
            kid_number = str(state_row.payload.get("kid_number") or "").strip()
            payload = dict(state_row.payload)
            state_row.state = "awaiting_confirmation"
            state_row.payload = payload
            state_row.save(update_fields=["state", "payload", "updated_at"])
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="\n".join(
                    [
                        "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438 \u0432\u044b\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0442\u043e\u0432\u0430\u0440\u0430:",
                        f"KID: {kid_number}",
                        f"Place: {payload.get('place') or '-'}",
                        f"main_ean_jv: {payload.get('main_ean_jv') or '-'}",
                        f"Quantity: {payload.get('quantity') if 'quantity' in payload else '-'}",
                        "Price: -",
                    ]
                ),
                reply_markup=build_confirm_keyboard(),
            )
            return {"status": "processed"}

        if not _is_price_text(ctx.text):
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="Price \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0447\u0438\u0441\u043b\u043e\u043c. \u0412\u0432\u0435\u0434\u0438 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437.",
                reply_markup=build_optional_step_keyboard(),
            )
            return {"status": "ignored", "reason": "invalid_price"}
        kid_number = str(state_row.payload.get("kid_number") or "").strip()
        payload = dict(state_row.payload)
        payload["price"] = _normalize_price_text(ctx.text)
        state_row.state = "awaiting_confirmation"
        state_row.payload = payload
        state_row.save(update_fields=["state", "payload", "updated_at"])
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text="\n".join(
                [
                    "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438 \u0432\u044b\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0442\u043e\u0432\u0430\u0440\u0430:",
                    f"KID: {kid_number}",
                    f"Place: {payload.get('place') or '-'}",
                    f"main_ean_jv: {payload.get('main_ean_jv') or '-'}",
                    f"Quantity: {payload.get('quantity')}",
                    f"Price: {payload.get('price')}",
                ]
            ),
            reply_markup=build_confirm_keyboard(),
        )
        return {"status": "processed"}

    def _handle_confirmation(self, ctx: TelegramUpdateContext) -> dict[str, Any]:
        state_row = self._get_or_create_state(ctx)
        if state_row.state != "awaiting_confirmation":
            self._send_action_menu(ctx, "\u041d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0433\u043e \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f. \u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435:")
            return {"status": "ignored", "reason": "no_pending_confirmation"}

        action = str(state_row.payload.get("action") or "").strip()
        kid_number = str(state_row.payload.get("kid_number") or "").strip()
        place = str(state_row.payload.get("place") or "").strip()
        main_ean_jv_value = state_row.payload.get("main_ean_jv")
        quantity_value = state_row.payload.get("quantity")
        price_value = state_row.payload.get("price")
        main_ean_jv = str(main_ean_jv_value or "").strip() or None
        quantity = int(quantity_value) if quantity_value not in (None, "") else None
        price = str(price_value or "").strip() or None
        state_row.state = "processing"
        state_row.save(update_fields=["state", "updated_at"])

        if action == "list":
            request_id = str(uuid4())
            try:
                payload = self.kids.create_kid(
                    kid_number=kid_number,
                    place=place,
                    main_ean_jv=main_ean_jv,
                    quantity=quantity,
                    price=price,
                )
                response_data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
                status_code = int(payload.get("status_code") or 0)
                audit_status = "ok"
                action_prefix = "\u0412\u044b\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0441\u043e\u0437\u0434\u0430\u043d\u043e" if status_code == 201 else "\u0412\u044b\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u043e"
                response_text = "\n".join(
                    [
                        f"{action_prefix}: {kid_number}",
                        f"Place: {place}",
                        f"main_ean_jv: {main_ean_jv or '-'}",
                        f"Quantity: {quantity if quantity is not None else '-'}",
                        f"Price: {price or '-'}",
                        f"Kid ID: {response_data.get('id') or '-'}",
                    ]
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("TELEGRAM_KID_LIST_UPDATE_FAILED")
                payload = {
                    "kid_number": kid_number,
                    "place": place,
                    "main_ean_jv": main_ean_jv,
                    "quantity": quantity,
                    "price": price,
                    "error": str(exc),
                }
                audit_status = "failed"
                response_text = "\n".join(
                    [
                        f"\u0412\u044b\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043d\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043e: {kid_number}",
                        f"Place: {place}",
                        f"main_ean_jv: {main_ean_jv or '-'}",
                        f"Quantity: {quantity if quantity is not None else '-'}",
                        f"Price: {price or '-'}",
                        f"\u041e\u0448\u0438\u0431\u043a\u0430: {exc}",
                    ]
                )
            TelegramActionAudit.objects.create(
                chat_id=ctx.chat_id or 0,
                telegram_user_id=ctx.user_id or 0,
                thread_key=ctx.thread_key,
                action="list",
                kid_number=kid_number,
                place=place,
                request_id=request_id,
                status=audit_status,
                result_payload=payload,
            )
            state_row.state = "completed"
            state_row.payload = {}
            state_row.save(update_fields=["state", "payload", "updated_at"])
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text=response_text,
                reply_markup=build_action_keyboard(),
            )
            return {"status": "processed"}

        inactive = action == "delete"
        action_label = "\u0423\u0434\u0430\u043b\u0435\u043d\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e" if inactive else "\u0412\u044b\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e"
        created = self.marketplace_jobs.create_job(
            kid_number=kid_number,
            inactive=inactive,
            place=place if not inactive else None,
        )
        job_id = str(created.get("job_id") or "").strip()
        request_id = str(created.get("request_id") or uuid4())
        if not job_id:
            raise RuntimeError("Marketplace toggle job create returned empty job_id.")
        TelegramMarketplaceJob.objects.update_or_create(
            job_id=job_id,
            defaults={
                "chat_id": ctx.chat_id or 0,
                "telegram_user_id": ctx.user_id or 0,
                "thread_key": ctx.thread_key,
                "action": "delete" if action == "delete" else "list",
                "kid_number": kid_number,
                "place": place if not inactive else "",
                "request_id": request_id,
                "job_status": str(created.get("job_status") or created.get("status") or "queued"),
                "response_status": str(created.get("status") or "queued"),
                "result_payload": created,
                "error_text": "",
                "delivery_status": "pending",
                "lease_expires_at": None,
                "notification_sent_at": None,
            },
        )
        state_row.state = "completed"
        state_row.payload = {}
        state_row.save(update_fields=["state", "payload", "updated_at"])

        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text="\n".join(
                [
                    f"{action_label.replace('\u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e', '\u0437\u0430\u043f\u0443\u0449\u0435\u043d\u043e')}: {kid_number}",
                    f"Job accepted: {job_id}",
                    "\u042f \u043f\u0440\u0438\u0448\u043b\u044e \u0438\u0442\u043e\u0433 \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u044b\u043c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435\u043c \u043f\u043e\u0441\u043b\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f job.",
                ]
            ),
            reply_markup=build_action_keyboard(),
        )
        return {"status": "processed"}
