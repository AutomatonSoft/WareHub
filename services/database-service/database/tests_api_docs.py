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
