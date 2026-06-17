from rest_framework import status
from rest_framework.test import APITestCase

from .models import Kid


class KidDeleteTests(APITestCase):
    def set_session_role(self, role: str):
        session = self.client.session
        session["role"] = role
        session.save()

    def test_admin_can_delete_kid(self):
        self.set_session_role("admin")
        kid = Kid.objects.create(kid_number="KID-DEL-001")

        response = self.client.delete(f"/api/v1/kids/{kid.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Kid.objects.filter(id=kid.id).exists())

    def test_user_cannot_delete_kid(self):
        self.set_session_role("user")
        kid = Kid.objects.create(kid_number="KID-DEL-002")

        response = self.client.delete(f"/api/v1/kids/{kid.id}/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Kid.objects.filter(id=kid.id).exists())

