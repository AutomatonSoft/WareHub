import json

from django.test import RequestFactory, SimpleTestCase, override_settings

from database.db_router import InventoryWorkspaceDatabaseRouter
from database.models import Kid
from database.workspace import (
    BENIM_DEPOM_DATABASE_ALIAS,
    BENIM_DEPOM_WORKSPACE,
    SOFORT_WORKSPACE,
    reset_active_workspace,
    set_active_workspace,
)
from database_service.inventory_workspace_middleware import InventoryWorkspaceMiddleware


class InventoryWorkspaceDatabaseRouterTests(SimpleTestCase):
    def test_routes_database_models_to_the_active_workspace_database(self):
        router = InventoryWorkspaceDatabaseRouter()

        sofort_token = set_active_workspace(SOFORT_WORKSPACE)
        try:
            self.assertEqual(router.db_for_read(Kid), "default")
        finally:
            reset_active_workspace(sofort_token)

        benim_token = set_active_workspace(BENIM_DEPOM_WORKSPACE)
        try:
            self.assertEqual(router.db_for_read(Kid), BENIM_DEPOM_DATABASE_ALIAS)
            self.assertEqual(router.db_for_write(Kid), BENIM_DEPOM_DATABASE_ALIAS)
        finally:
            reset_active_workspace(benim_token)


class InventoryWorkspaceMiddlewareTests(SimpleTestCase):
    @override_settings(DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}})
    def test_rejects_benim_depom_when_its_database_is_not_configured(self):
        middleware = InventoryWorkspaceMiddleware(lambda request: None)
        request = RequestFactory().get("/api/v1/inventory/rows/", HTTP_X_WAREHUB_INVENTORY_WORKSPACE="benim_depom")
        response = middleware(request)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(json.loads(response.content)["code"], "inventory_workspace_unavailable")
