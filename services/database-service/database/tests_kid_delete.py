from rest_framework import status
from rest_framework.test import APITestCase

from .models import Ean, EanStatus, Kid, Orders, ProductAttributes


class KidDeleteTests(APITestCase):
    def set_session_role(self, role: str):
        session = self.client.session
        session["role"] = role
        session.save()

    def test_admin_can_delete_kid(self):
        self.set_session_role("admin")
        kid = Kid.objects.create(kid_number="KID-DEL-001")
        Ean.objects.create(kid=kid, main_ean="1234567890123")
        EanStatus.objects.create(ean=kid, jv=True)
        Orders.objects.create(kid=kid, order_id="ORDER-DEL-001", title="Delete me")
        ProductAttributes.objects.create(kid=kid, quantity=2)

        response = self.client.delete(f"/api/v1/kids/{kid.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Kid.objects.filter(id=kid.id).exists())
        self.assertFalse(Ean.objects.filter(kid_id=kid.id).exists())
        self.assertFalse(EanStatus.objects.filter(ean_id=kid.id).exists())
        self.assertFalse(Orders.objects.filter(kid_id=kid.id).exists())
        self.assertFalse(ProductAttributes.objects.filter(kid_id=kid.id).exists())

    def test_user_cannot_delete_kid(self):
        self.set_session_role("user")
        kid = Kid.objects.create(kid_number="KID-DEL-002")

        response = self.client.delete(f"/api/v1/kids/{kid.id}/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Kid.objects.filter(id=kid.id).exists())
