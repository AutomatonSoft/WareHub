from rest_framework import status
from rest_framework.test import APITestCase


class ServiceHealthTests(APITestCase):
    def test_api_v1_healthz_returns_200_without_auth(self):
        response = self.client.get("/api/v1/healthz")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["service"], "database_service")

    def test_api_v1_readyz_returns_200_without_auth(self):
        response = self.client.get("/api/v1/readyz")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ready")
        self.assertEqual(response.data["service"], "database_service")

