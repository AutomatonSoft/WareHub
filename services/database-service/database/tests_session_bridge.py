from django.test import RequestFactory, SimpleTestCase, override_settings

from database.permissions import SessionRolePermission
from database.inventory_audit_service import request_actor
from database.views import _is_backend_session_bridge_enabled


class BackendSessionBridgeAllowlistTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @override_settings(
        ALLOWED_HOSTS=["localhost", "127.0.0.1"],
        BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS=["localhost", "127.0.0.1"],
    )
    def test_localhost_is_allowed_by_default_contract(self):
        request = self.factory.get("/api/v1/dev/session/sync/", HTTP_HOST="localhost")
        self.assertTrue(_is_backend_session_bridge_enabled(request))

    @override_settings(
        ALLOWED_HOSTS=["stagewarehub.automatonsoft.de"],
        BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS=["stagewarehub.automatonsoft.de"],
    )
    def test_stage_host_can_be_allowed_explicitly(self):
        request = self.factory.get(
            "/api/v1/dev/session/sync/",
            HTTP_HOST="stagewarehub.automatonsoft.de",
        )
        self.assertTrue(_is_backend_session_bridge_enabled(request))

    @override_settings(
        ALLOWED_HOSTS=["evil.example"],
        BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS=["stagewarehub.automatonsoft.de"],
    )
    def test_unlisted_host_is_not_allowed(self):
        request = self.factory.get("/api/v1/dev/session/sync/", HTTP_HOST="evil.example")
        self.assertFalse(_is_backend_session_bridge_enabled(request))


class OrchestratorServicePermissionTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.permission = SessionRolePermission()

    @override_settings(
        ALLOWED_HOSTS=["localhost", "127.0.0.1"],
        ORCHESTRATOR_SERVICE_AUTH_TOKEN="warehub-local-orchestrator",
        ORCHESTRATOR_SERVICE_ALLOWED_HOSTS=["localhost", "127.0.0.1"],
    )
    def test_matching_service_token_on_localhost_is_allowed(self):
        request = self.factory.get(
            "/api/v1/jv/sites/by-ean/4062292558689/",
            HTTP_HOST="localhost",
            HTTP_X_WAREHUB_SERVICE_TOKEN="warehub-local-orchestrator",
        )
        self.assertTrue(self.permission.has_permission(request, view=None))

    @override_settings(
        ALLOWED_HOSTS=["localhost", "127.0.0.1"],
        ORCHESTRATOR_SERVICE_AUTH_TOKEN="warehub-local-orchestrator",
        ORCHESTRATOR_SERVICE_ALLOWED_HOSTS=["localhost", "127.0.0.1"],
    )
    def test_missing_service_token_is_rejected_without_session_role(self):
        request = self.factory.get("/api/v1/jv/sites/by-ean/4062292558689/", HTTP_HOST="localhost")
        self.assertFalse(self.permission.has_permission(request, view=None))

    def test_user_role_can_write_regular_service_resources(self):
        request = self.factory.patch("/api/v1/kids/1/", HTTP_HOST="localhost")
        request.session = {"role": "user"}

        self.assertTrue(self.permission.has_permission(request, view=None))


class InventoryAuditActorTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @override_settings(ORCHESTRATOR_SERVICE_AUTH_TOKEN="warehub-local-orchestrator")
    def test_trusted_orchestrator_actor_is_used_for_audit_entries(self):
        request = self.factory.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            HTTP_X_WAREHUB_SERVICE_TOKEN="warehub-local-orchestrator",
            HTTP_X_WAREHUB_ACTOR_LOGIN="katerina",
            HTTP_X_WAREHUB_ACTOR_NAME="Katerina Krisling",
        )
        request.session = {}

        self.assertEqual(request_actor(request), {"login": "katerina", "name": "Katerina Krisling"})

    @override_settings(ORCHESTRATOR_SERVICE_AUTH_TOKEN="warehub-local-orchestrator")
    def test_untrusted_actor_headers_cannot_override_the_session_actor(self):
        request = self.factory.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            HTTP_X_WAREHUB_SERVICE_TOKEN="wrong-token",
            HTTP_X_WAREHUB_ACTOR_LOGIN="spoofed",
            HTTP_X_WAREHUB_ACTOR_NAME="Spoofed User",
        )
        request.session = {"login": "ravil", "display_name": "Ravil Raykhanov"}

        self.assertEqual(request_actor(request), {"login": "ravil", "name": "Ravil Raykhanov"})
