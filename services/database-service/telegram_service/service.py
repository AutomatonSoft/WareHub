from __future__ import annotations

import logging
from dataclasses import dataclass
from hmac import compare_digest
from typing import Any
from uuid import uuid4

from django.db import transaction

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

ACTION_DELETE_LABEL = "Удалить товар"
ACTION_LIST_LABEL = "Выставить товар"
ACTION_CANCEL_LABEL = "Отмена"
CONFIRM_YES_LABEL = "Подтвердить"

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
        "input_field_placeholder": "Выбери действие",
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
        "input_field_placeholder": "Подтверди или отмени",
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
            f"Listing: {getattr(kid, 'listing_status', '') or '-'}",
            f"JV EAN: {getattr(ean_row, 'jv', '') or '-'}",
            f"Main EAN: {getattr(ean_row, 'main_ean', '') or '-'}",
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
            audit.error_text = "Update ignored by chat/user/thread policy."
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
        if self.config.allowed_user_ids and ctx.user_id not in self.config.allowed_user_ids:
            return False
        binding = TelegramAccessBinding.objects.filter(
            telegram_user_id=ctx.user_id,
            chat_id=ctx.chat_id,
            is_active=True,
        ).first()
        if binding is not None:
            if binding.thread_key and binding.thread_key != ctx.thread_key:
                return False
            return True
        return True

    def _dispatch(self, ctx: TelegramUpdateContext) -> dict[str, Any]:
        if ctx.callback_query_id:
            self.bot.answer_callback_query(callback_query_id=ctx.callback_query_id)

        normalized_text = _normalize_command_text(ctx.text)
        callback_data = str(ctx.callback_data or "").strip()

        if normalized_text in {"/start", "/menu"}:
            self._reset_state(ctx)
            self._send_action_menu(ctx, "Выбери действие:")
            return {"status": "processed"}

        if normalized_text == "/cancel" or normalized_text == _normalize_command_text(ACTION_CANCEL_LABEL):
            self._reset_state(ctx)
            self._send_action_menu(ctx, "Действие отменено. Выбери следующий шаг:")
            return {"status": "processed"}

        if normalized_text in {
            _normalize_command_text(ACTION_DELETE_LABEL),
            _normalize_command_text(ACTION_LIST_LABEL),
        } or callback_data in {LEGACY_ACTION_DELETE, LEGACY_ACTION_LIST}:
            return self._handle_action_choice(ctx)

        if normalized_text == _normalize_command_text(CONFIRM_YES_LABEL) or callback_data == LEGACY_CONFIRM_YES:
            return self._handle_confirmation(ctx)

        if callback_data in {LEGACY_ACTION_CANCEL, LEGACY_CONFIRM_NO}:
            self._reset_state(ctx)
            self._send_action_menu(ctx, "Действие отменено. Выбери следующий шаг:")
            return {"status": "processed"}

        state_row = self._get_or_create_state(ctx)
        if state_row.state == "awaiting_kid":
            return self._handle_kid_input(ctx, state_row)
        if state_row.state == "awaiting_place":
            return self._handle_place_input(ctx, state_row)
        if state_row.state == "awaiting_main_ean":
            return self._handle_main_ean_input(ctx, state_row)
        if state_row.state == "awaiting_quantity":
            return self._handle_quantity_input(ctx, state_row)
        if state_row.state == "awaiting_price":
            return self._handle_price_input(ctx, state_row)

        self._send_action_menu(ctx, "Не понял команду. Выбери действие:")
        return {"status": "ignored", "reason": "unknown_input"}

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
        state_row.state = "awaiting_kid"
        state_row.payload = {"action": action}
        state_row.save(update_fields=["state", "payload", "updated_at"])
        prompt = "Введи KID для удаления:" if action == "delete" else "Введи KID для выставления:"
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
                    text="KID не может быть пустым.",
                    reply_markup=build_action_keyboard(),
                )
                return {"status": "ignored", "reason": "empty_kid_number"}
            kid = _lookup_kid_by_number(kid_number)
            state_row.state = "awaiting_place"
            state_row.payload = {
                "action": action,
                "kid_number": kid_number,
            }
            state_row.save(update_fields=["state", "payload", "updated_at"])
            summary_lines = [
                "Локальный товар будет создан или обновлен через /api/v1/kids/.",
                f"KID: {kid_number}",
            ]
            if kid is not None:
                summary_lines.extend(
                    [
                        "Найдена локальная запись:",
                        _format_kid_summary(kid),
                    ]
                )
            summary_lines.append("Введи новый place для выставления:")
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="\n".join(summary_lines),
                reply_markup=build_action_keyboard(),
            )
            return {"status": "processed"}

        kid = _lookup_kid_by_number(ctx.text)
        if kid is None:
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text=f"KID не найден: {ctx.text}",
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
                    "Подтверди удаление товара:",
                    _format_kid_summary(kid),
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
                text="Place должен быть целым числом. Введи значение еще раз.",
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
            "Place сохранен.",
            f"KID: {kid_number}",
            f"Новый place: {place_value}",
            "Введи main_ean (13 цифр):",
        ]
        if kid is not None:
            confirm_lines.insert(1, _format_kid_summary(kid))
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text="\n".join(confirm_lines),
            reply_markup=build_action_keyboard(),
        )
        return {"status": "processed"}

    def _handle_main_ean_input(self, ctx: TelegramUpdateContext, state_row: TelegramConversationState) -> dict[str, Any]:
        if not _is_main_ean_text(ctx.text):
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="main_ean должен состоять ровно из 13 цифр. Введи значение еще раз.",
                reply_markup=build_action_keyboard(),
            )
            return {"status": "ignored", "reason": "invalid_main_ean"}
        payload = dict(state_row.payload)
        payload["main_ean"] = ctx.text.strip()
        state_row.state = "awaiting_quantity"
        state_row.payload = payload
        state_row.save(update_fields=["state", "payload", "updated_at"])
        self.bot.send_message(
            chat_id=ctx.chat_id or 0,
            message_thread_id=ctx.message_thread_id,
            text="Введи quantity (целое число, 0 или больше):",
            reply_markup=build_action_keyboard(),
        )
        return {"status": "processed"}

    def _handle_quantity_input(self, ctx: TelegramUpdateContext, state_row: TelegramConversationState) -> dict[str, Any]:
        if not _is_quantity_text(ctx.text):
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="Quantity должен быть целым числом 0 или больше. Введи значение еще раз.",
                reply_markup=build_action_keyboard(),
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
            text="Введи price (например 199.99):",
            reply_markup=build_action_keyboard(),
        )
        return {"status": "processed"}

    def _handle_price_input(self, ctx: TelegramUpdateContext, state_row: TelegramConversationState) -> dict[str, Any]:
        if not _is_price_text(ctx.text):
            self.bot.send_message(
                chat_id=ctx.chat_id or 0,
                message_thread_id=ctx.message_thread_id,
                text="Price должен быть числом. Введи значение еще раз.",
                reply_markup=build_action_keyboard(),
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
                    "Подтверди выставление товара:",
                    f"KID: {kid_number}",
                    f"Place: {payload.get('place') or '-'}",
                    f"main_ean: {payload.get('main_ean') or '-'}",
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
            self._send_action_menu(ctx, "Нет активного действия. Выбери действие:")
            return {"status": "ignored", "reason": "no_pending_confirmation"}

        action = str(state_row.payload.get("action") or "").strip()
        kid_number = str(state_row.payload.get("kid_number") or "").strip()
        place = str(state_row.payload.get("place") or "").strip()
        main_ean = str(state_row.payload.get("main_ean") or "").strip()
        quantity = state_row.payload.get("quantity")
        price = str(state_row.payload.get("price") or "").strip()
        state_row.state = "processing"
        state_row.save(update_fields=["state", "updated_at"])

        if action == "list":
            request_id = str(uuid4())
            try:
                payload = self.kids.create_kid(
                    kid_number=kid_number,
                    place=place,
                    main_ean=main_ean,
                    quantity=int(quantity),
                    price=price,
                )
                response_data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
                status_code = int(payload.get("status_code") or 0)
                audit_status = "ok"
                action_prefix = "Выставление создано" if status_code == 201 else "Выставление обновлено"
                response_text = "\n".join(
                    [
                        f"{action_prefix}: {kid_number}",
                        f"Place: {place}",
                        f"main_ean: {main_ean}",
                        f"Quantity: {quantity}",
                        f"Price: {price}",
                        f"Kid ID: {response_data.get('id') or '-'}",
                    ]
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("TELEGRAM_KID_LIST_UPDATE_FAILED")
                payload = {
                    "kid_number": kid_number,
                    "place": place,
                    "main_ean": main_ean,
                    "quantity": quantity,
                    "price": price,
                    "error": str(exc),
                }
                audit_status = "failed"
                response_text = "\n".join(
                    [
                        f"Выставление не выполнено: {kid_number}",
                        f"Place: {place}",
                        f"main_ean: {main_ean}",
                        f"Quantity: {quantity}",
                        f"Price: {price}",
                        f"Ошибка: {exc}",
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
        action_label = "Удаление завершено" if inactive else "Выставление завершено"
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
                    f"{action_label.replace('завершено', 'запущено')}: {kid_number}",
                    f"Job accepted: {job_id}",
                    "Я пришлю итог отдельным сообщением после завершения job.",
                ]
            ),
            reply_markup=build_action_keyboard(),
        )
        return {"status": "processed"}
