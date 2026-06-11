from django.test import RequestFactory, SimpleTestCase, override_settings

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
