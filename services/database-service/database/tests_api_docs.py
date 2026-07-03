from rest_framework import status
from rest_framework.test import APITestCase


class ApiDocsTests(APITestCase):
    def test_openapi_schema_v1_available(self):
        response = self.client.get("/api/v1/openapi.json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response["Content-Type"].startswith("application/vnd.oai.openapi+json"))
        self.assertIn("openapi", response.data)
        self.assertIn("paths", response.data)
        self.assertIn("/api/v1/healthz", response.data["paths"])
        self.assertIn("/api/v1/kids/", response.data["paths"])
        self.assertIn("/api/v1/orders/", response.data["paths"])
        self.assertIn("/api/v1/kids/{kid_id}/order-ids/", response.data["paths"])
        self.assertIn("/api/v1/afterbuy/items/search/", response.data["paths"])
        self.assertIn("/api/v1/afterbuy/items/search-web/", response.data["paths"])
        self.assertIn("/api/v1/afterbuy/orders/create/", response.data["paths"])
        self.assertIn("/api/v1/telegram/webhook/", response.data["paths"])
        self.assertIn("tags", response.data)
        self.assertIn("x-tagGroups", response.data)

        kid_list = response.data["paths"]["/api/v1/kids/"]["get"]
        self.assertEqual(kid_list["summary"], "List kids")
        self.assertTrue(kid_list["description"])
        self.assertEqual(kid_list["tags"], ["Kids"])
        self.assertIn("401", kid_list["responses"])
        self.assertIn("403", kid_list["responses"])

        session_sync = response.data["paths"]["/api/v1/dev/session/sync/"]["get"]
        self.assertEqual(session_sync["summary"], "Sync database-service session from backend token")
        self.assertEqual(session_sync["tags"], ["Session"])
        self.assertIn("security", session_sync)
        self.assertIn("401", session_sync["responses"])
        self.assertIn("502", session_sync["responses"])

        telegram_webhook = response.data["paths"]["/api/v1/telegram/webhook/"]["post"]
        self.assertEqual(telegram_webhook["summary"], "Handle Telegram webhook update")
        self.assertEqual(telegram_webhook["tags"], ["Telegram"])
        self.assertEqual(telegram_webhook["security"], [{"telegramWebhookSecret": []}])
        self.assertEqual(
            telegram_webhook["requestBody"]["content"]["application/json"]["schema"]["$ref"],
            "#/components/schemas/TelegramUpdate",
        )
        self.assertIn("200", telegram_webhook["responses"])
        self.assertIn("503", telegram_webhook["responses"])
