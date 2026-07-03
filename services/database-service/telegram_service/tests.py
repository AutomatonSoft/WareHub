import os
from unittest.mock import patch

from django.test import TestCase
from django.test import SimpleTestCase
from django.core.management import call_command
from django.urls import resolve
from rest_framework.test import APIRequestFactory

from database.models import Kid
from telegram_service.config import TelegramRuntimeConfig
from telegram_service.config import load_telegram_runtime_config
from telegram_service.models import TelegramActionAudit, TelegramConversationState, TelegramMarketplaceJob
from telegram_service.notifier import TelegramMarketplaceJobNotifier
from telegram_service.kids_client import TelegramKidsClient
from telegram_service.orchestrator_client import TelegramMarketplaceJobClient
from telegram_service.service import TelegramConversationService, TelegramUpdateContext, build_action_keyboard, build_confirm_keyboard
from telegram_service.views import TelegramWebhookAPIView


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
        self.assertEqual(config.chat_id, 12345)
        self.assertEqual(config.message_thread_id, 77)
        self.assertEqual(config.allowed_user_ids, (1, 2, 3))
        self.assertEqual(config.services_base_url, "http://127.0.0.1:8934")
        self.assertEqual(config.service_auth_token, "warehub-local-orchestrator")
        self.assertEqual(config.orchestrator_base_url, "http://127.0.0.1:8935")
        self.assertEqual(config.orchestrator_poll_attempts, 45)
        self.assertEqual(config.orchestrator_poll_interval_seconds, 0.4)

    def test_build_keyboards_include_expected_callbacks(self):
        action_keyboard = build_action_keyboard()
        confirm_keyboard = build_confirm_keyboard()
        self.assertEqual(action_keyboard["inline_keyboard"][0][0]["callback_data"], "action:delete")
        self.assertEqual(action_keyboard["inline_keyboard"][0][1]["callback_data"], "action:list")
        self.assertEqual(confirm_keyboard["inline_keyboard"][0][0]["callback_data"], "confirm:yes")
        self.assertEqual(confirm_keyboard["inline_keyboard"][0][1]["callback_data"], "confirm:no")

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
        assert kwargs["json"]["allowed_updates"] == [
            "message",
            "edited_message",
            "channel_post",
            "edited_channel_post",
            "callback_query",
        ]

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


class TelegramServiceAsyncFlowTests(TestCase):
    def _config(self) -> TelegramRuntimeConfig:
        return TelegramRuntimeConfig(
            bot_token="token",
            chat_id=None,
            message_thread_id=None,
            webhook_secret="secret",
            webhook_path="/api/v1/telegram/webhook/",
            api_base_url="https://api.telegram.org",
            allowed_user_ids=(),
            services_base_url="http://127.0.0.1:8934",
            service_auth_token="warehub-local-orchestrator",
            orchestrator_base_url="http://127.0.0.1:8935",
            orchestrator_poll_attempts=3,
            orchestrator_poll_interval_seconds=0.1,
        )

    @patch.object(TelegramKidsClient, "create_kid")
    @patch("telegram_service.service.TelegramMarketplaceJobClient.create_job")
    def test_confirmation_creates_kid_via_services_endpoint_for_list_action(self, mocked_create_job, mocked_create_kid):
        mocked_create_kid.return_value = {"status_code": 201, "data": {"id": 1, "place": "55"}}
        bot = type("Bot", (), {"send_message": lambda *args, **kwargs: {"ok": True}, "answer_callback_query": lambda *args, **kwargs: {"ok": True}})()
        service = TelegramConversationService(config=self._config(), bot=bot)
        ctx = TelegramUpdateContext(
            update_id=2,
            update_type="callback_query",
            chat_id=100,
            user_id=200,
            username="said",
            display_name="Said",
            text="",
            callback_data="confirm:yes",
            callback_query_id="cb-2",
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
            update_type="callback_query",
            chat_id=100,
            user_id=200,
            username="said",
            display_name="Said",
            text="",
            callback_data="confirm:yes",
            callback_query_id="cb-1",
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
