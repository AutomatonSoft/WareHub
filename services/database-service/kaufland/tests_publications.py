from datetime import timedelta
from unittest.mock import Mock, patch

import requests
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from database.models import Ean, EanStatus, Kid
from .models import KauflandPublication
from .publication_service import CHECK_INTERVAL, apply_active_state, reconcile_next_publication, record_submission
from .views import CreateProductByEANAPIView


class KauflandPublicationTests(TestCase):
    def setUp(self):
        self.kid = Kid.objects.create(kid_number=["KAUF-TEST"])
        self.ean = "4071489363630"
        Ean.objects.create(kid=self.kid, kaufland_jv=self.ean)
        EanStatus.objects.create(ean=self.kid, kaufland_jv=True)
        self.publication = record_submission(controller="jv", ean=self.ean)

    def due(self):
        KauflandPublication.objects.filter(pk=self.publication.pk).update(next_check_at=timezone.now() - timedelta(seconds=1))

    def status(self, **overrides):
        return {"ean": self.ean, "controller": "jv", "is_live": False, "is_valid": True, **overrides}

    def test_submission_preserves_ean_and_resets_green_until_confirmed(self):
        self.assertEqual(Ean.objects.get(kid=self.kid).kaufland_jv, self.ean)
        self.assertFalse(EanStatus.objects.get(ean=self.kid).kaufland_jv)
        self.assertEqual(self.publication.next_check_at - self.publication.submitted_at, CHECK_INTERVAL)

    @patch("kaufland.publication_service.get_product_publication_status")
    @patch("kaufland.views.create_product_by_ean", return_value={"status": "created"})
    def test_accepted_upload_records_pending_without_waiting_for_marketplace(self, upload, fetch):
        request = APIRequestFactory().post("/", {
            "ean": self.ean, "controller": "xl", "title": "Desk", "description": "Oak desk",
            "picture_urls": ["https://example.test/desk.jpg"], "price": "199.99",
            "size": "120 x 60", "color": "brown", "material": "wood", "delivery": 14,
            "height": 80, "length": 120, "width": 60,
        }, format="json")
        response = CreateProductByEANAPIView.as_view()(request)
        self.assertEqual(response.status_code, 202)
        publication = KauflandPublication.objects.get(controller="xl", ean=self.ean)
        self.assertFalse(publication.online)
        self.assertIsNotNone(publication.next_check_at)
        fetch.assert_not_called()

    @patch("kaufland.publication_service.get_product_publication_status")
    def test_xl_publication_updates_xl_mapping_only(self, fetch):
        Ean.objects.filter(kid=self.kid).update(kaufland_xl=self.ean)
        record_submission(controller="xl", ean=self.ean)
        KauflandPublication.objects.filter(controller="xl").update(next_check_at=timezone.now() - timedelta(seconds=1))
        fetch.return_value = self.status(controller="xl", is_live=True)
        reconcile_next_publication()
        statuses = EanStatus.objects.get(ean=self.kid)
        self.assertTrue(statuses.kaufland_xl)
        self.assertFalse(statuses.kaufland_jv)

    @patch("kaufland.publication_service.get_product_publication_status")
    def test_not_due_does_not_call_marketplace(self, fetch):
        self.assertIsNone(reconcile_next_publication())
        fetch.assert_not_called()

    def test_mapping_is_written_immediately_without_green_status(self):
        from database.marketplace_ean_mapping_service import confirm_marketplace_ean_mapping
        query = Mock()
        query.filter.return_value = query
        query.order_by.return_value.__getitem__ = Mock(return_value=[self.kid])
        with patch("database.marketplace_ean_mapping_service.Kid.objects.select_for_update", return_value=query):
            result = confirm_marketplace_ean_mapping(
                kid_number="KAUF-TEST", kid_id=self.kid.pk, marketplace="kaufland", account="jv", ean=self.ean,
            )
        self.assertFalse(result["status"])
        self.assertEqual(Ean.objects.get(kid=self.kid).kaufland_jv, self.ean)

    @patch("kaufland.publication_service.get_product_publication_status")
    def test_deactivation_cancels_checks_and_invalidates_inflight_result(self, fetch):
        self.due()
        def deactivate(*args):
            apply_active_state(controller="jv", ean=self.ean, active=False)
            return self.status(is_live=True)
        fetch.side_effect = deactivate
        self.assertIsNone(reconcile_next_publication())
        self.publication.refresh_from_db()
        self.assertIsNone(self.publication.next_check_at)
        self.assertFalse(EanStatus.objects.get(ean=self.kid).kaufland_jv)

    @patch("kaufland.publication_service.get_product_publication_status")
    def test_pending_checks_continue_after_72_hours(self, fetch):
        self.due()
        KauflandPublication.objects.filter(pk=self.publication.pk).update(submitted_at=timezone.now() - timedelta(hours=80))
        fetch.return_value = self.status()
        reconcile_next_publication()
        self.publication.refresh_from_db()
        self.assertFalse(self.publication.online)
        self.assertEqual(self.publication.next_check_at - self.publication.checked_at, CHECK_INTERVAL)
        self.assertFalse(EanStatus.objects.get(ean=self.kid).kaufland_jv)

    @patch("kaufland.publication_service.get_product_publication_status")
    def test_confirmed_live_turns_only_matching_account_green(self, fetch):
        self.due()
        fetch.return_value = self.status(is_live=True)
        reconcile_next_publication()
        self.publication.refresh_from_db()
        self.assertTrue(self.publication.online)
        self.assertIsNone(self.publication.next_check_at)
        self.assertTrue(EanStatus.objects.get(ean=self.kid).kaufland_jv)
        self.assertFalse(EanStatus.objects.get(ean=self.kid).kaufland_xl)

    @patch("kaufland.publication_service.get_product_publication_status")
    def test_network_error_is_retried_hourly(self, fetch):
        self.due()
        fetch.side_effect = requests.Timeout()
        reconcile_next_publication()
        self.publication.refresh_from_db()
        self.assertFalse(self.publication.online)
        self.assertEqual(self.publication.next_check_at - self.publication.checked_at, CHECK_INTERVAL)

    @patch("kaufland.publication_service.get_product_publication_status")
    def test_other_account_cannot_confirm_visibility(self, fetch):
        self.due()
        fetch.return_value = self.status(controller="xl", is_live=True)
        reconcile_next_publication()
        self.assertFalse(EanStatus.objects.get(ean=self.kid).kaufland_jv)

    @patch("kaufland.publication_service.get_product_publication_status")
    def test_late_result_cannot_override_new_submission(self, fetch):
        self.due()
        def resubmit(*args):
            record_submission(controller="jv", ean=self.ean)
            return self.status(is_live=True)
        fetch.side_effect = resubmit
        self.assertIsNone(reconcile_next_publication())
        self.assertFalse(EanStatus.objects.get(ean=self.kid).kaufland_jv)
