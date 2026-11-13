from django.utils import timezone
from rest_framework.test import APITestCase

from database.inventory_service import build_inventory_rows
from database.models import Ean, EanStatus, InventoryChangeLog, Kid
from database.serializers import EanPatchSerializer
from otto_service.models import OttoPublication
from otto_service.publication_service import record_submissions


class OttoEanStatusTests(APITestCase):
    def setUp(self):
        self.kid = Kid.objects.create(kid_number=["123456789"], place="1")
        self.ean = Ean.objects.create(kid=self.kid, otto_jv="4071489368673", otto_xl="4071489369229")
        EanStatus.objects.create(ean=self.kid, otto_jv=True, otto_xl=True, hood_jv=True)
        self.publication = OttoPublication.objects.create(
            profile="jv", sku=self.ean.otto_jv, ean=self.ean.otto_jv,
            state="rejected", online=False, errors=[{"title": "Old rejection"}], submitted_at=timezone.now(),
        )
        session = self.client.session
        session["role"] = "admin"
        session.save()

    def test_changing_or_clearing_otto_ean_resets_only_its_status_and_preserves_history(self):
        for value in ("4071489369250", None):
            with self.subTest(value=value):
                EanStatus.objects.filter(ean=self.kid).update(otto_jv=True)
                serializer = EanPatchSerializer(self.ean, data={"otto_jv": value}, partial=True)
                self.assertTrue(serializer.is_valid(), serializer.errors)
                serializer.save()
                statuses = EanStatus.objects.get(ean=self.kid)
                self.assertFalse(statuses.otto_jv)
                self.assertTrue(statuses.otto_xl)
                self.assertTrue(statuses.hood_jv)
                self.assertEqual(build_inventory_rows()[0]["otto_publications"], {})
                self.assertTrue(OttoPublication.objects.filter(pk=self.publication.pk).exists())

    def test_unchanged_ean_preserves_manual_status(self):
        serializer = EanPatchSerializer(self.ean, data={"otto_jv": self.ean.otto_jv}, partial=True)
        self.assertTrue(serializer.is_valid())
        serializer.save()
        self.assertTrue(EanStatus.objects.get(ean=self.kid).otto_jv)

    def test_edit_does_not_overwrite_another_account_updated_since_loading(self):
        Ean.objects.filter(kid=self.kid).update(otto_xl="4071489369250")
        serializer = EanPatchSerializer(self.ean, data={"otto_jv": None}, partial=True)
        self.assertTrue(serializer.is_valid())
        serializer.save()
        self.assertEqual(Ean.objects.get(kid=self.kid).otto_xl, "4071489369250")

    def test_marketplace_ean_endpoint_replaces_only_requested_account(self):
        response = self.client.patch(
            f"/api/v1/kids/{self.kid.pk}/marketplace-eans/", {"otto_jv_ean": "4071489369250"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Ean.objects.get(kid=self.kid).otto_jv, "4071489369250")
        self.assertFalse(EanStatus.objects.get(ean=self.kid).otto_jv)
        self.assertTrue(EanStatus.objects.get(ean=self.kid).otto_xl)

    def test_old_publication_check_cannot_restore_status_after_ean_replacement(self):
        from otto_service.publication_service import _sync_mapping_visibility
        serializer = EanPatchSerializer(self.ean, data={"otto_jv": "4071489369250"}, partial=True)
        self.assertTrue(serializer.is_valid())
        serializer.save()
        self.publication.online = True
        _sync_mapping_visibility(self.publication)
        self.assertFalse(EanStatus.objects.get(ean=self.kid).otto_jv)

    def test_composite_update_clears_ean_and_rejection_without_touching_other_accounts(self):
        response = self.client.patch(
            f"/api/v1/kids/{self.kid.pk}/composite-update/", {"ean": {"otto_jv": None}}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(Ean.objects.get(kid=self.kid).otto_jv)
        self.assertFalse(EanStatus.objects.get(ean=self.kid).otto_jv)
        self.assertTrue(EanStatus.objects.get(ean=self.kid).otto_xl)
        self.assertEqual(build_inventory_rows()[0]["otto_publications"], {})

    def test_manual_checkbox_is_audited_without_rewriting_otto_result(self):
        EanStatus.objects.filter(ean=self.kid).update(otto_jv=False)
        response = self.client.patch(
            f"/api/v1/kids/{self.kid.pk}/marketplace-status/", {"marketplace": "otto_jv", "status": True}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(EanStatus.objects.get(ean=self.kid).otto_jv)
        self.publication.refresh_from_db()
        self.assertEqual(self.publication.state, "rejected")
        self.assertFalse(self.publication.online)
        self.assertTrue(InventoryChangeLog.objects.filter(kid=self.kid, action="marketplace_status_updated").exists())

    def test_resubmission_of_same_ean_resets_errors_and_submission_identity(self):
        before = self.publication.submission_id
        record_submissions("jv", [{"sku": self.ean.otto_jv, "ean": self.ean.otto_jv}], {})
        self.publication.refresh_from_db()
        self.assertNotEqual(self.publication.submission_id, before)
        self.assertEqual(self.publication.state, "pending")
        self.assertEqual(self.publication.errors, [])
        self.assertEqual(build_inventory_rows()[0]["otto_publications"]["ottoJv"]["ean"], self.ean.otto_jv)
