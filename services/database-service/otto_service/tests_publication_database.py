from unittest.mock import patch

from django.utils import timezone
from rest_framework.test import APITestCase

from database.inventory_service import build_inventory_rows
from database.marketplace_ean_mapping_service import confirm_marketplace_ean_mapping
from database.models import Ean, EanStatus, Kid
from .models import OttoPublication
from .publication_service import record_submissions, reconcile_next_publication
from .tests_publications import SKU, TASK, client


class OttoPublicationDatabaseTests(APITestCase):
    def setUp(self):
        self.kid = Kid.objects.create(kid_number=["123456789"], place="1")
        session = self.client.session
        session["role"] = "admin"
        session.save()

    def map_ean(self, profile="jv"):
        return confirm_marketplace_ean_mapping(kid_number="123456789", marketplace="otto", account=profile, ean=SKU)

    def test_accepted_then_rejected_keeps_ean_and_surfaces_error(self):
        with patch("otto_service.views.OttoExternalProductsClient") as api:
            api.return_value.create_or_update_products.return_value = {"processId": TASK}
            response = self.client.post("/api/v1/otto/jv/products/upsert/", {"productReference": SKU, "sku": SKU, "ean": SKU}, format="json")
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["publication_state"], "pending")
        self.assertFalse(self.map_ean()["status"])
        api = client()
        api.fetch_update_task.side_effect = [{"state": "done", "total": 1, "failed": 1}, {"results": [{"variation": f"/v5/products/{SKU}", "errors": [{"code": "100006", "title": "Invalid Grundfarbe", "jsonPath": "$.Grundfarbe"}]}]}]
        reconcile_next_publication(api)
        self.assertEqual(Ean.objects.get(kid=self.kid).otto_jv, SKU)
        self.assertFalse(EanStatus.objects.get(ean=self.kid).otto_jv)
        row = build_inventory_rows()[0]
        self.assertEqual(row["otto_publications"]["ottoJv"]["state"], "rejected")
        self.assertEqual(row["otto_publications"]["ottoJv"]["errors"][0]["jsonPath"], "$.Grundfarbe")

    def test_only_online_sets_flag_and_resubmission_preserves_known_visibility(self):
        record_submissions("xl", [{"sku": SKU, "ean": SKU}], {"processId": TASK})
        self.assertFalse(self.map_ean("xl")["status"])
        api = client(True)
        api.fetch_publication_status.return_value["controller"] = "xl"
        reconcile_next_publication(api)
        self.assertTrue(EanStatus.objects.get(ean=self.kid).otto_xl)
        old_id = OttoPublication.objects.get(profile="xl", sku=SKU).submission_id
        record_submissions("xl", [{"sku": SKU, "ean": SKU}], {"processId": TASK})
        record = OttoPublication.objects.get(profile="xl", sku=SKU)
        self.assertNotEqual(record.submission_id, old_id)
        self.assertTrue(record.online)
        self.assertEqual(record.state, "pending")
        self.assertTrue(self.map_ean("xl")["status"])

    def test_no_due_rows_and_non_otto_mapping_are_unchanged(self):
        self.assertIsNone(reconcile_next_publication(client()))
        result = confirm_marketplace_ean_mapping(kid_number="123456789", marketplace="kaufland", account="jv", ean=SKU)
        self.assertTrue(result["status"])
        self.assertTrue(EanStatus.objects.get(ean=self.kid).kaufland_jv)

    def test_first_tracked_editor_update_clears_unverified_otto_flag_only(self):
        Ean.objects.create(kid=self.kid, otto_jv=SKU, kaufland_jv="another-ean")
        EanStatus.objects.create(ean=self.kid, otto_jv=True, kaufland_jv=True)
        record_submissions("jv", [{"sku": SKU, "ean": SKU}], "updated")
        statuses = EanStatus.objects.get(ean=self.kid)
        self.assertFalse(statuses.otto_jv)
        self.assertTrue(statuses.kaufland_jv)
        self.assertEqual(Ean.objects.get(kid=self.kid).otto_jv, SKU)

    def test_deactivation_invalidates_pending_checks_and_reactivation_requires_visibility_confirmation(self):
        from database.marketplace_deactivate_service import _apply_otto_active_state
        record_submissions("jv", [{"sku": SKU, "ean": SKU}], {"processId": TASK})
        self.map_ean()
        reconcile_next_publication(client(True))
        before = OttoPublication.objects.get()
        with patch("database.marketplace_deactivate_service.OttoExternalProductsClient") as api:
            api.return_value.set_active_state.return_value = {"success": True}
            result = _apply_otto_active_state(ean=SKU, site_key="OTTO_JV", controller="jv", inactive=True)
        self.assertTrue(result["ok"])
        record = OttoPublication.objects.get()
        self.assertNotEqual(record.submission_id, before.submission_id)
        self.assertFalse(record.online)
        self.assertEqual(record.state, "offline")
        self.assertIsNone(record.next_check_at)
        with patch("database.marketplace_deactivate_service.OttoExternalProductsClient") as api:
            api.return_value.set_active_state.return_value = {"success": True}
            api.return_value.fetch_products.return_value = {"productVariations": [{"sku": SKU, "quantity": 1}]}
            _apply_otto_active_state(ean=SKU, site_key="OTTO_JV", controller="jv", inactive=False)
        record.refresh_from_db()
        self.assertIsNone(record.online)
        self.assertEqual(record.state, "pending")

    def test_worker_lease_prevents_double_check_and_transient_failure_does_not_mark_success(self):
        from .external_requests import OttoExternalAPIError
        record_submissions("jv", [{"sku": SKU, "ean": SKU}], {"processId": TASK})
        self.map_ean()
        record = OttoPublication.objects.get()
        record.next_check_at = timezone.now() + timezone.timedelta(minutes=5)
        record.save()
        self.assertIsNone(reconcile_next_publication(client()))
        record.next_check_at = timezone.now()
        record.save()
        api = client()
        api.fetch_update_task.side_effect = OttoExternalAPIError("unavailable")
        self.assertEqual(reconcile_next_publication(api)["state"], "unknown")
        self.assertFalse(EanStatus.objects.get(ean=self.kid).otto_jv)
