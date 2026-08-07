import os
from unittest.mock import Mock, patch
import requests

from django.test import TestCase
from django.test import SimpleTestCase
from django.core.management import call_command
from django.core.management.base import CommandError
from django.urls import resolve
from rest_framework.test import APIRequestFactory

from database.models import Kid
from telegram_service.config import TelegramRuntimeConfig
from telegram_service.config import load_telegram_runtime_config
from telegram_service.models import TelegramActionAudit, TelegramConversationState, TelegramMarketplaceJob
from telegram_service.notifier import TelegramMarketplaceJobNotifier
from telegram_service.kids_client import TelegramKidsClient
from telegram_service.models import TelegramAccessBinding
from telegram_service.orchestrator_client import TelegramMarketplaceJobClient
from telegram_service.service import (
    ACTION_CANCEL_LABEL,
    ACTION_DELETE_LABEL,
    ACTION_LIST_LABEL,
    CONFIRM_YES_LABEL,
    REQUEST_ACCESS_LABEL,
    TelegramConversationService,
    TelegramUpdateContext,
    build_access_keyboard,
    build_action_keyboard,
    build_confirm_keyboard,
)
from telegram_service.views import (
    TelegramAccessApproveAPIView,
    TelegramAccessDeleteAPIView,
    TelegramAccessListAPIView,
    TelegramAccessRevokeAPIView,
    TelegramWebhookAPIView,
)


class TelegramServiceTests(SimpleTestCase):
    @patch.dict(
        os.environ,
        {
            "TELEGRAM_BOT_TOKEN": "token",
            "TELEGRAM_WEBHOOK_SECRET": "secret",
            "TELEGRAM_WEBHOOK_PATH": "api/v1/telegram/hook",
            "TELEGRAM_CHAT_ID": "12345",
            "MESSAGE_THREAD_ID": "77",
            "TELEGRAM_ALLOWED_USER_IDS": "1,2, 3",
            "SERVICES_ORIGIN": "http://127.0.0.1:8934",
            "ORCHESTRATOR_ORIGIN": "http://127.0.0.1:8935",
            "ORCHESTRATOR_SERVICE_AUTH_TOKEN": "warehub-local-orchestrator",
        },
        clear=False,
    )
    def test_load_runtime_config_normalizes_values(self):
        config = load_telegram_runtime_config()
        self.assertEqual(config.webhook_path, "/api/v1/telegram/hook/")
        self.assertEqual(config.public_webhook_path, "/api/v1/services/telegram/hook/")
        self.assertEqual(config.chat_id, 12345)
        self.assertEqual(config.message_thread_id, 77)
        self.assertEqual(config.allowed_user_ids, (1, 2, 3))
        self.assertEqual(config.services_base_url, "http://127.0.0.1:8934")
        self.assertEqual(config.service_auth_token, "warehub-local-orchestrator")
        self.assertEqual(config.orchestrator_base_url, "http://127.0.0.1:8935")
        self.assertEqual(config.orchestrator_poll_attempts, 45)
        self.assertEqual(config.orchestrator_poll_interval_seconds, 0.4)

    def test_build_keyboards_include_expected_labels(self):
        action_keyboard = build_action_keyboard()
        confirm_keyboard = build_confirm_keyboard()
        access_keyboard = build_access_keyboard()
        self.assertEqual(action_keyboard["keyboard"][0][0]["text"], ACTION_DELETE_LABEL)
        self.assertEqual(action_keyboard["keyboard"][0][1]["text"], ACTION_LIST_LABEL)
        self.assertEqual(action_keyboard["keyboard"][1][0]["text"], ACTION_CANCEL_LABEL)
        self.assertEqual(confirm_keyboard["keyboard"][0][0]["text"], CONFIRM_YES_LABEL)
        self.assertEqual(confirm_keyboard["keyboard"][0][1]["text"], ACTION_CANCEL_LABEL)
        self.assertEqual(access_keyboard["keyboard"][0][0]["text"], REQUEST_ACCESS_LABEL)
        self.assertTrue(action_keyboard["resize_keyboard"])
        self.assertTrue(confirm_keyboard["resize_keyboard"])

    def test_webhook_url_resolves_for_canonical_paths(self):
        resolved_with_slash = resolve("/api/v1/telegram/webhook/")
        resolved_without_slash = resolve("/api/v1/telegram/webhook")

        self.assertIs(resolved_with_slash.func.view_class, TelegramWebhookAPIView)
        self.assertIs(resolved_without_slash.func.view_class, TelegramWebhookAPIView)

    @patch("telegram_service.views.TelegramConversationService.handle_update")
    @patch.dict(
        os.environ,
        {
            "TELEGRAM_BOT_TOKEN": "token",
            "TELEGRAM_WEBHOOK_SECRET": "secret",
            "TELEGRAM_WEBHOOK_PATH": "/api/v1/telegram/webhook/",
        },
        clear=False,
    )
    def test_webhook_view_rejects_invalid_secret(self, mocked_handle_update):
        request = APIRequestFactory().post(
            "/api/v1/telegram/webhook/",
            {"update_id": 1, "message": {"text": "/start"}},
            format="json",
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="wrong",
        )
        response = TelegramWebhookAPIView.as_view()(request)
        self.assertEqual(response.status_code, 403)
        mocked_handle_update.assert_not_called()

    @patch("telegram_service.views.TelegramConversationService.handle_update", return_value={"status": "processed"})
    @patch.dict(
        os.environ,
        {
            "TELEGRAM_BOT_TOKEN": "token",
            "TELEGRAM_WEBHOOK_SECRET": "secret",
            "TELEGRAM_WEBHOOK_PATH": "/api/v1/telegram/webhook/",
        },
        clear=False,
    )
    def test_webhook_view_accepts_valid_secret(self, mocked_handle_update):
        request = APIRequestFactory().post(
            "/api/v1/telegram/webhook/",
            {"update_id": 1, "message": {"text": "/start"}},
            format="json",
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="secret",
        )
        response = TelegramWebhookAPIView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        mocked_handle_update.assert_called_once()

    @patch("telegram_service.management.commands.telegram_set_webhook.requests.post")
    @patch.dict(
        os.environ,
        {
            "TELEGRAM_BOT_TOKEN": "token",
            "TELEGRAM_WEBHOOK_SECRET": "secret",
            "TELEGRAM_WEBHOOK_PATH": "/api/v1/telegram/webhook/",
        },
        clear=False,
    )
    def test_telegram_set_webhook_command_includes_callback_query_updates(self, mocked_post):
        mocked_post.return_value.raise_for_status.return_value = None
        mocked_post.return_value.json.return_value = {"ok": True, "result": True}

        call_command(
            "telegram_set_webhook",
            "--base-url",
            "https://example.trycloudflare.com",
        )

        _args, kwargs = mocked_post.call_args
        assert kwargs["json"]["url"] == "https://example.trycloudflare.com/api/v1/services/telegram/webhook/"
        assert kwargs["json"]["allowed_updates"] == [
            "message",
            "edited_message",
            "channel_post",
            "edited_channel_post",
            "callback_query",
        ]

    @patch("telegram_service.management.commands.run_telegram_update_poller.time.sleep", return_value=None)
    @patch("telegram_service.management.commands.run_telegram_update_poller.TelegramConversationService")
    @patch("telegram_service.management.commands.run_telegram_update_poller.TelegramBotClient")
    @patch.dict(
        os.environ,
        {
            "TELEGRAM_BOT_TOKEN": "token",
            "TELEGRAM_WEBHOOK_SECRET": "secret",
            "TELEGRAM_DELIVERY_MODE": "polling",
        },
        clear=False,
    )
    def test_update_poller_recovers_once_from_webhook_conflict(self, mocked_bot_class, mocked_service_class, _mocked_sleep):
        conflict_response = Mock(status_code=409)
        bot = mocked_bot_class.return_value
        bot.get_updates.side_effect = [
            requests.HTTPError("409 Client Error: Conflict", response=conflict_response),
            [],
        ]
        bot.delete_webhook.return_value = {"ok": True}
        mocked_service_class.return_value = Mock()

        call_command("run_telegram_update_poller", "--once", "--idle-sleep", "0.01")

        self.assertEqual(bot.delete_webhook.call_count, 2)
        self.assertEqual(bot.get_updates.call_count, 2)

    @patch("telegram_service.management.commands.run_telegram_update_poller.time.sleep", return_value=None)
    @patch("telegram_service.management.commands.run_telegram_update_poller.TelegramConversationService")
    @patch("telegram_service.management.commands.run_telegram_update_poller.TelegramBotClient")
    @patch.dict(
        os.environ,
        {
            "TELEGRAM_BOT_TOKEN": "token",
            "TELEGRAM_WEBHOOK_SECRET": "secret",
            "TELEGRAM_DELIVERY_MODE": "polling",
        },
        clear=False,
    )
    def test_update_poller_keep_webhook_leaves_conflict_unrecovered(self, mocked_bot_class, mocked_service_class, _mocked_sleep):
        conflict_response = Mock(status_code=409)
        bot = mocked_bot_class.return_value
        bot.get_updates.side_effect = requests.HTTPError("409 Client Error: Conflict", response=conflict_response)
        mocked_service_class.return_value = Mock()

        with self.assertRaises(requests.HTTPError):
            call_command("run_telegram_update_poller", "--once", "--keep-webhook", "--idle-sleep", "0.01")

        bot.delete_webhook.assert_not_called()
        self.assertEqual(bot.get_updates.call_count, 1)

    @patch("telegram_service.management.commands.run_telegram_update_poller._poller_single_instance_lock")
    @patch.dict(
        os.environ,
        {
            "TELEGRAM_BOT_TOKEN": "token",
            "TELEGRAM_WEBHOOK_SECRET": "secret",
            "TELEGRAM_DELIVERY_MODE": "polling",
        },
        clear=False,
    )
    def test_update_poller_exits_when_singleton_lock_is_held(self, mocked_lock):
        mocked_lock.return_value.__enter__.side_effect = CommandError("Telegram poller is already running.")

        with self.assertRaises(CommandError):
            call_command("run_telegram_update_poller", "--once")

    @patch("telegram_service.orchestrator_client.requests.post")
    @patch("telegram_service.orchestrator_client.requests.get")
    @patch.dict(
        os.environ,
        {
            "TELEGRAM_BOT_TOKEN": "token",
            "TELEGRAM_WEBHOOK_SECRET": "secret",
            "ORCHESTRATOR_ORIGIN": "http://127.0.0.1:8935",
        },
        clear=False,
    )
    def test_marketplace_job_client_uses_orchestrator_toggle_routes(self, mocked_get, mocked_post):
        mocked_post.return_value.raise_for_status.return_value = None
        mocked_post.return_value.json.return_value = {"job_id": "job-1", "request_id": "req-1", "status": "queued"}
        mocked_get.return_value.raise_for_status.return_value = None
        mocked_get.return_value.json.return_value = {
            "job_id": "job-1",
            "request_id": "req-1",
            "kid_number": "KID-1",
            "inactive": True,
            "job_status": "completed",
            "status": "ok",
            "summary": {"total": 1, "success": 1, "failed": 0},
            "results": [],
            "error": None,
        }

        client = TelegramMarketplaceJobClient(load_telegram_runtime_config())
        created = client.create_job(kid_number="KID-1", inactive=True)
        result = client.wait_for_job(job_id="job-1")

        self.assertEqual(created["job_id"], "job-1")
        self.assertEqual(result["job_status"], "completed")
        self.assertEqual(
            mocked_post.call_args.args[0],
            "http://127.0.0.1:8935/api/v1/orchestrator/marketplace/toggle-by-kid",
        )
        self.assertEqual(
            mocked_get.call_args.args[0],
            "http://127.0.0.1:8935/api/v1/orchestrator/marketplace/jobs/job-1",
        )

    @patch("telegram_service.kids_client.requests.post")
    @patch.dict(
        os.environ,
        {
            "TELEGRAM_BOT_TOKEN": "token",
            "TELEGRAM_WEBHOOK_SECRET": "secret",
            "SERVICES_ORIGIN": "http://127.0.0.1:8934",
            "ORCHESTRATOR_SERVICE_AUTH_TOKEN": "warehub-local-orchestrator",
        },
        clear=False,
    )
    def test_kids_client_uses_post_kids_route(self, mocked_post):
        mocked_post.return_value.status_code = 201
        mocked_post.return_value.raise_for_status.return_value = None
        mocked_post.return_value.json.return_value = {"id": 77, "kid_number": "566725168", "place": "55", "main_ean": "4062292028939"}

        client = TelegramKidsClient(load_telegram_runtime_config())
        created = client.create_kid(kid_number="566725168", place="55", main_ean="4062292028939", quantity=3, price="199.99")

        self.assertEqual(
            mocked_post.call_args.args[0],
            "http://127.0.0.1:8934/api/v1/kids/",
        )
        self.assertEqual(
            mocked_post.call_args.kwargs["json"],
            {"kid_number": "566725168", "place": "55", "main_ean": "4062292028939", "quantity": 3, "price": "199.99"},
        )
        self.assertEqual(
            mocked_post.call_args.kwargs["headers"],
            {"x-warehub-service-token": "warehub-local-orchestrator"},
        )
        self.assertEqual(created["status_code"], 201)
        self.assertEqual(created["data"]["id"], 77)

    @patch("telegram_service.kids_client.requests.post")
    @patch.dict(
        os.environ,
        {
            "TELEGRAM_BOT_TOKEN": "token",
            "TELEGRAM_WEBHOOK_SECRET": "secret",
            "SERVICES_ORIGIN": "http://127.0.0.1:8934",
            "ORCHESTRATOR_SERVICE_AUTH_TOKEN": "warehub-local-orchestrator",
        },
        clear=False,
    )
    def test_kids_client_includes_response_body_on_http_errors(self, mocked_post):
        mocked_response = mocked_post.return_value
        mocked_response.status_code = 500
        mocked_response.text = '{"detail":"boom"}'
        mocked_response.raise_for_status.side_effect = requests.HTTPError(
            "500 Server Error: Internal Server Error for url: http://127.0.0.1:8934/api/v1/kids/",
            response=mocked_response,
        )

        client = TelegramKidsClient(load_telegram_runtime_config())

        with self.assertRaises(requests.HTTPError) as ctx:
            client.create_kid(kid_number="566725168", place="55", main_ean="4062292028939", quantity=3, price="199.99")

        self.assertIn("Response body", str(ctx.exception))
        self.assertIn('{"detail":"boom"}', str(ctx.exception))


class TelegramServiceAsyncFlowTests(TestCase):
    def _config(self) -> TelegramRuntimeConfig:
        return TelegramRuntimeConfig(
            bot_token="token",
            chat_id=None,
            message_thread_id=None,
            webhook_secret="secret",
            webhook_path="/api/v1/telegram/webhook/",
            public_webhook_path="/api/v1/services/telegram/webhook/",
            api_base_url="https://api.telegram.org",
            delivery_mode="polling",
            allowed_user_ids=(),
            services_base_url="http://127.0.0.1:8934",
            service_auth_token="warehub-local-orchestrator",
            orchestrator_base_url="http://127.0.0.1:8935",
            orchestrator_poll_attempts=3,
            orchestrator_poll_interval_seconds=0.1,
        )

    def test_wrong_chat_is_rejected_even_with_binding(self):
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}, "answer_callback_query": lambda *args, **kwargs: {"ok": True}})()
        service = TelegramConversationService(
            config=TelegramRuntimeConfig(
                bot_token="token",
                chat_id=999,
                message_thread_id=None,
                webhook_secret="secret",
                webhook_path="/api/v1/telegram/webhook/",
                public_webhook_path="/api/v1/services/telegram/webhook/",
                api_base_url="https://api.telegram.org",
                delivery_mode="polling",
                allowed_user_ids=(),
                services_base_url="http://127.0.0.1:8934",
                service_auth_token="warehub-local-orchestrator",
                orchestrator_base_url="http://127.0.0.1:8935",
                orchestrator_poll_attempts=3,
                orchestrator_poll_interval_seconds=0.1,
            ),
            bot=bot,
        )
        TelegramAccessBinding.objects.create(
            telegram_user_id=200,
            chat_id=100,
            thread_key="",
            login="user",
            display_name="User",
            is_active=True,
            status="approved",
        )
        ctx = TelegramUpdateContext(
            update_id=1,
            update_type="message",
            chat_id=100,
            user_id=200,
            username="user",
            display_name="User",
            text="/start",
            callback_data="",
            callback_query_id="",
            message_id=1,
            message_thread_id=None,
        )

        self.assertFalse(service._is_allowed_context(ctx))

    def test_unapproved_user_gets_access_prompt_on_start(self):
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}, "answer_callback_query": lambda *args, **kwargs: {"ok": True}})()
        service = TelegramConversationService(config=self._config(), bot=bot)

        with patch.object(service.bot, "send_message", return_value={"ok": True}) as mocked_send:
            result = service.handle_update(
                {
                    "update_id": 100,
                    "message": {
                        "message_id": 1,
                        "chat": {"id": 100},
                        "from": {"id": 200, "username": "user", "first_name": "Test"},
                        "text": "/start",
                    },
                }
            )

        self.assertEqual(result["status"], "processed")
        mocked_send.assert_called_once()
        self.assertIn("reply_markup", mocked_send.call_args.kwargs)
        self.assertEqual(mocked_send.call_args.kwargs["reply_markup"]["keyboard"][0][0]["text"], REQUEST_ACCESS_LABEL)

    def test_request_access_creates_pending_binding_with_email(self):
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}, "answer_callback_query": lambda *args, **kwargs: {"ok": True}})()
        service = TelegramConversationService(config=self._config(), bot=bot)

        first_update = {
            "update_id": 101,
            "message": {
                "message_id": 1,
                "chat": {"id": 100},
                "from": {"id": 200, "username": "user", "first_name": "Test"},
                "text": REQUEST_ACCESS_LABEL,
            },
        }
        second_update = {
            "update_id": 102,
            "message": {
                "message_id": 2,
                "chat": {"id": 100},
                "from": {"id": 200, "username": "user", "first_name": "Test"},
                "text": "user@example.com",
            },
        }

        service.handle_update(first_update)
        result = service.handle_update(second_update)

        self.assertEqual(result["status"], "processed")
        binding = TelegramAccessBinding.objects.get(telegram_user_id=200, chat_id=100)
        self.assertEqual(binding.status, "pending")
        self.assertEqual(binding.email, "user@example.com")
        self.assertFalse(binding.is_active)

    def test_approved_binding_can_open_menu(self):
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}, "answer_callback_query": lambda *args, **kwargs: {"ok": True}})()
        service = TelegramConversationService(config=self._config(), bot=bot)
        TelegramAccessBinding.objects.create(
            telegram_user_id=200,
            chat_id=100,
            thread_key="",
            login="user",
            display_name="User",
            email="user@example.com",
            is_active=True,
            status="approved",
        )

        with patch.object(service.bot, "send_message", return_value={"ok": True}) as mocked_send:
            result = service.handle_update(
                {
                    "update_id": 103,
                    "message": {
                        "message_id": 1,
                        "chat": {"id": 100},
                        "from": {"id": 200, "username": "user", "first_name": "Test"},
                        "text": "/menu",
                    },
                }
            )

        self.assertEqual(result["status"], "processed")
        mocked_send.assert_called_once()
        self.assertEqual(mocked_send.call_args.kwargs["reply_markup"]["keyboard"][0][0]["text"], ACTION_DELETE_LABEL)

    def test_list_action_requests_single_form_message(self):
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}, "answer_callback_query": lambda *args, **kwargs: {"ok": True}})()
        service = TelegramConversationService(config=self._config(), bot=bot)
        TelegramAccessBinding.objects.create(
            telegram_user_id=200,
            chat_id=100,
            thread_key="",
            login="user",
            display_name="User",
            email="user@example.com",
            is_active=True,
            status="approved",
        )

        with patch.object(service.bot, "send_message", return_value={"ok": True}) as mocked_send:
            result = service.handle_update(
                {
                    "update_id": 104,
                    "message": {
                        "message_id": 1,
                        "chat": {"id": 100},
                        "from": {"id": 200, "username": "user", "first_name": "Test"},
                        "text": ACTION_LIST_LABEL,
                    },
                }
            )

        self.assertEqual(result["status"], "processed")
        state = TelegramConversationState.objects.get(chat_id=100, telegram_user_id=200, thread_key="")
        self.assertEqual(state.state, "awaiting_list_form")
        self.assertIn("одним сообщением", mocked_send.call_args.kwargs["text"].lower())

    @patch.object(TelegramKidsClient, "create_kid")
    def test_list_form_accepts_required_fields_only(self, mocked_create_kid):
        mocked_create_kid.return_value = {"status_code": 201, "data": {"id": 1, "place": "9999"}}
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}, "answer_callback_query": lambda *args, **kwargs: {"ok": True}})()
        service = TelegramConversationService(config=self._config(), bot=bot)
        TelegramAccessBinding.objects.create(
            telegram_user_id=200,
            chat_id=100,
            thread_key="",
            login="user",
            display_name="User",
            email="user@example.com",
            is_active=True,
            status="approved",
        )

        service.handle_update(
            {
                "update_id": 105,
                "message": {
                    "message_id": 1,
                    "chat": {"id": 100},
                    "from": {"id": 200, "username": "user", "first_name": "Test"},
                    "text": ACTION_LIST_LABEL,
                },
            }
        )
        service.handle_update(
            {
                "update_id": 106,
                "message": {
                    "message_id": 2,
                    "chat": {"id": 100},
                    "from": {"id": 200, "username": "user", "first_name": "Test"},
                    "text": "KID: 566725168\nPlace: 9999",
                },
            }
        )

        state = TelegramConversationState.objects.get(chat_id=100, telegram_user_id=200, thread_key="")
        self.assertEqual(state.state, "awaiting_confirmation")
        self.assertEqual(state.payload["kid_number"], "566725168")
        self.assertEqual(state.payload["place"], "9999")
        self.assertNotIn("main_ean", state.payload)
        self.assertNotIn("quantity", state.payload)
        self.assertNotIn("price", state.payload)

        with patch.object(service.bot, "send_message", return_value={"ok": True}):
            result = service._handle_confirmation(
                TelegramUpdateContext(
                    update_id=107,
                    update_type="message",
                    chat_id=100,
                    user_id=200,
                    username="user",
                    display_name="Test",
                    text=CONFIRM_YES_LABEL,
                    callback_data="",
                    callback_query_id="",
                    message_id=3,
                    message_thread_id=None,
                )
            )

        self.assertEqual(result["status"], "processed")
        mocked_create_kid.assert_called_once_with(
            kid_number="566725168",
            place="9999",
            main_ean=None,
            quantity=None,
            price=None,
        )

    def test_list_form_requires_kid_and_place(self):
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}, "answer_callback_query": lambda *args, **kwargs: {"ok": True}})()
        service = TelegramConversationService(config=self._config(), bot=bot)
        TelegramAccessBinding.objects.create(
            telegram_user_id=200,
            chat_id=100,
            thread_key="",
            login="user",
            display_name="User",
            email="user@example.com",
            is_active=True,
            status="approved",
        )

        service.handle_update(
            {
                "update_id": 108,
                "message": {
                    "message_id": 1,
                    "chat": {"id": 100},
                    "from": {"id": 200, "username": "user", "first_name": "Test"},
                    "text": ACTION_LIST_LABEL,
                },
            }
        )

        with patch.object(service.bot, "send_message", return_value={"ok": True}) as mocked_send:
            result = service.handle_update(
                {
                    "update_id": 109,
                    "message": {
                        "message_id": 2,
                        "chat": {"id": 100},
                        "from": {"id": 200, "username": "user", "first_name": "Test"},
                        "text": "KID: 566725168",
                    },
                }
            )

        self.assertEqual(result["status"], "ignored")
        self.assertEqual(result["reason"], "missing_required_list_form_fields")
        self.assertIn("KID и Place", mocked_send.call_args.kwargs["text"])

    @patch.object(TelegramKidsClient, "create_kid")
    @patch("telegram_service.service.TelegramMarketplaceJobClient.create_job")
    def test_confirmation_creates_kid_via_services_endpoint_for_list_action(self, mocked_create_job, mocked_create_kid):
        mocked_create_kid.return_value = {"status_code": 201, "data": {"id": 1, "place": "55"}}
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}, "answer_callback_query": lambda *args, **kwargs: {"ok": True}})()
        service = TelegramConversationService(config=self._config(), bot=bot)
        ctx = TelegramUpdateContext(
            update_id=2,
            update_type="message",
            chat_id=100,
            user_id=200,
            username="said",
            display_name="Said",
            text=CONFIRM_YES_LABEL,
            callback_data="",
            callback_query_id="",
            message_id=10,
            message_thread_id=None,
        )
        TelegramConversationState.objects.create(
            chat_id=100,
            telegram_user_id=200,
            thread_key="",
            state="awaiting_confirmation",
            payload={"action": "list", "kid_number": "566725168", "place": "55", "main_ean": "4062292028939", "quantity": 3, "price": "199.99"},
        )

        with patch.object(service.bot, "send_message", return_value={"ok": True}) as mocked_send:
            result = service._handle_confirmation(ctx)

        self.assertEqual(result["status"], "processed")
        mocked_create_kid.assert_called_once_with(kid_number="566725168", place="55", main_ean="4062292028939", quantity=3, price="199.99")
        mocked_create_job.assert_not_called()
        mocked_send.assert_called_once()
        audit = TelegramActionAudit.objects.get(action="list", kid_number="566725168")
        self.assertEqual(audit.status, "ok")
        state = TelegramConversationState.objects.get(chat_id=100, telegram_user_id=200, thread_key="")
        self.assertEqual(state.state, "completed")
        self.assertEqual(state.payload, {})

    @patch("telegram_service.service.TelegramMarketplaceJobClient.create_job")
    def test_confirmation_enqueues_job_and_acks_immediately(self, mocked_create_job):
        mocked_create_job.return_value = {"job_id": "job-42", "request_id": "req-42", "status": "queued"}
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}, "answer_callback_query": lambda *args, **kwargs: {"ok": True}})()
        service = TelegramConversationService(config=self._config(), bot=bot)
        ctx = TelegramUpdateContext(
            update_id=1,
            update_type="message",
            chat_id=100,
            user_id=200,
            username="said",
            display_name="Said",
            text=CONFIRM_YES_LABEL,
            callback_data="",
            callback_query_id="",
            message_id=10,
            message_thread_id=None,
        )
        TelegramConversationState.objects.create(
            chat_id=100,
            telegram_user_id=200,
            thread_key="",
            state="awaiting_confirmation",
            payload={"action": "delete", "kid_number": "566725168", "place": ""},
        )

        with patch.object(service.bot, "send_message", return_value={"ok": True}) as mocked_send:
            result = service._handle_confirmation(ctx)

        self.assertEqual(result["status"], "processed")
        queued = TelegramMarketplaceJob.objects.get(job_id="job-42")
        self.assertEqual(queued.kid_number, "566725168")
        self.assertEqual(queued.delivery_status, "pending")
        self.assertEqual(queued.job_status, "queued")
        mocked_send.assert_called_once()
        self.assertEqual(TelegramActionAudit.objects.filter(request_id="req-42").count(), 0)

    def test_notifier_sends_terminal_job_result(self):
        queued = TelegramMarketplaceJob.objects.create(
            chat_id=100,
            telegram_user_id=200,
            thread_key="",
            action="delete",
            kid_number="566725168",
            place="",
            request_id="req-42",
            job_id="job-42",
            job_status="queued",
            response_status="queued",
            delivery_status="pending",
            result_payload={"job_id": "job-42"},
        )
        payload = {
            "job_id": "job-42",
            "request_id": "req-42",
            "kid_number": "566725168",
            "inactive": True,
            "job_status": "completed",
            "status": "ok",
            "summary": {"total": 4, "success": 4, "failed": 0},
            "results": [{"ok": True, "site_key": "JV_DE"}],
            "error": None,
        }
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}})()
        notifier = TelegramMarketplaceJobNotifier(config=self._config(), bot=bot)

        with patch.object(notifier.jobs, "get_job", return_value=payload) as mocked_get_job, patch.object(
            notifier.bot,
            "send_message",
            return_value={"ok": True},
        ) as mocked_send:
            handled = notifier.process_next_job()

        self.assertTrue(handled)
        queued.refresh_from_db()
        self.assertEqual(queued.delivery_status, "sent")
        self.assertEqual(queued.job_status, "completed")
        self.assertIsNotNone(queued.notification_sent_at)
        mocked_get_job.assert_called_once_with(job_id="job-42")
        mocked_send.assert_called_once()
        self.assertEqual(TelegramActionAudit.objects.filter(request_id="req-42", status="ok").count(), 1)

    def test_admin_access_api_lists_and_transitions_binding(self):
        binding = TelegramAccessBinding.objects.create(
            telegram_user_id=200,
            chat_id=100,
            thread_key="",
            login="user",
            display_name="User",
            email="user@example.com",
            is_active=False,
            status="pending",
        )

        list_request = APIRequestFactory().get("/api/v1/telegram/access/")
        list_request.session = {"role": "admin", "login": "ravil"}
        list_response = TelegramAccessListAPIView.as_view()(list_request)
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data[0]["email"], "user@example.com")
        self.assertEqual(list_response.data[0]["app_user"]["id"], None)

        approve_request = APIRequestFactory().post(
            f"/api/v1/telegram/access/{binding.id}/approve/",
            {
                "app_user": {
                    "id": "user-1",
                    "username": "Said Aka",
                    "login": "saidaka",
                    "email": "user@example.com",
                }
            },
            format="json",
        )
        approve_request.session = {"role": "admin", "login": "ravil"}
        approve_response = TelegramAccessApproveAPIView.as_view()(approve_request, binding_id=binding.id)
        self.assertEqual(approve_response.status_code, 200)

        binding.refresh_from_db()
        self.assertEqual(binding.status, "approved")
        self.assertTrue(binding.is_active)
        self.assertEqual(binding.approved_by, "ravil")
        self.assertEqual(binding.app_user_id, "user-1")
        self.assertEqual(binding.app_user_username, "Said Aka")
        self.assertEqual(binding.app_user_login, "saidaka")
        self.assertEqual(binding.app_user_email, "user@example.com")

        revoke_request = APIRequestFactory().post(f"/api/v1/telegram/access/{binding.id}/revoke/", {}, format="json")
        revoke_request.session = {"role": "admin", "login": "ravil"}
        revoke_response = TelegramAccessRevokeAPIView.as_view()(revoke_request, binding_id=binding.id)
        self.assertEqual(revoke_response.status_code, 200)

        binding.refresh_from_db()
        self.assertEqual(binding.status, "revoked")
        self.assertFalse(binding.is_active)
        self.assertEqual(binding.revoked_by, "ravil")

        delete_request = APIRequestFactory().delete(f"/api/v1/telegram/access/{binding.id}/")
        delete_request.session = {"role": "admin", "login": "ravil"}
        delete_response = TelegramAccessDeleteAPIView.as_view()(delete_request, binding_id=binding.id)
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(TelegramAccessBinding.objects.filter(id=binding.id).exists())
