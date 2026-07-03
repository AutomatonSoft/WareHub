from __future__ import annotations

import logging
from typing import Any

import requests

from .config import TelegramRuntimeConfig


logger = logging.getLogger(__name__)


class TelegramBotClient:
    def __init__(self, config: TelegramRuntimeConfig) -> None:
        self.config = config

    def _method_url(self, method_name: str) -> str:
        return f"{self.config.api_base_url}/bot{self.config.bot_token}/{method_name}"

    def call(self, method_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = requests.post(
            self._method_url(method_name),
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict) or not body.get("ok"):
            raise RuntimeError(f"Telegram API {method_name} failed: {body}")
        result = body.get("result")
        return result if isinstance(result, dict) else {"result": result}

    def send_message(
        self,
        *,
        chat_id: int,
        text: str,
        message_thread_id: int | None = None,
        reply_markup: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
        }
        if message_thread_id is not None:
            payload["message_thread_id"] = message_thread_id
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        return self.call("sendMessage", payload)

    def edit_message_text(
        self,
        *,
        chat_id: int,
        message_id: int,
        text: str,
        reply_markup: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        return self.call("editMessageText", payload)

    def answer_callback_query(
        self,
        *,
        callback_query_id: str,
        text: str | None = None,
        show_alert: bool = False,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"callback_query_id": callback_query_id}
        if text:
            payload["text"] = text
        if show_alert:
            payload["show_alert"] = True
        return self.call("answerCallbackQuery", payload)
