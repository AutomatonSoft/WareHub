from unittest.mock import patch

from django.test import TestCase

from .inventory_audit_service import list_inventory_change_history, list_inventory_change_history_actors, record_product_submission, request_actor
from .models import InventoryChangeLog, Kid


class ProductSubmissionAuditTests(TestCase):
    def setUp(self):
        self.kid = Kid.objects.create(kid_number=["565536401"], place="207")
        self.actor = {"login": "eugen", "name": "Eugen Tryrshkin"}

    def record(self, channel="OTTO XL", request_id="create-1"):
        record_product_submission(
            kid=self.kid, actor=self.actor, channel=channel, ean="4071489368567", request_id=request_id,
        )

    def test_author_identity_and_submitted_ean_are_stored_without_claiming_live_status(self):
        self.record()
        entry = InventoryChangeLog.objects.get()
        self.assertEqual((entry.actor_login, entry.actor_name), ("eugen", "Eugen Tryrshkin"))
        self.assertEqual((entry.kid_number, entry.place), ("565536401", "207"))
        self.assertEqual(entry.action, "marketplace_product_submitted")
        self.assertEqual(entry.metadata["ean"], "4071489368567")
        self.assertEqual(entry.metadata["channel"], "OTTO XL")

    def test_retry_is_deduplicated_but_other_channels_and_new_submissions_are_recorded(self):
        self.record()
        self.record()
        self.record(channel="HOOD JV")
        self.record(request_id="create-2")
        self.assertEqual(InventoryChangeLog.objects.count(), 3)

    def test_history_search_and_participant_filter_include_the_submission_author(self):
        self.record()
        result = list_inventory_change_history(limit=8, search="565536401", actor="eugen")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["results"][0]["metadata"]["ean"], "4071489368567")
        self.assertEqual(list_inventory_change_history_actors()[0]["label"], "Eugen Tryrshkin")

    def test_browser_actor_headers_cannot_override_the_authenticated_session(self):
        from types import SimpleNamespace
        request = SimpleNamespace(session={"login": "eugen", "display_name": "Eugen Tryrshkin"}, headers={"x-warehub-actor-login": "forged"})
        self.assertEqual(request_actor(request), self.actor)

    def test_no_invented_author_for_old_jobs(self):
        self.actor = {}
        self.record()
        self.assertFalse(InventoryChangeLog.objects.exists())

    def test_mapping_records_submission_with_the_actor_and_keeps_unconfirmed_otto_red(self):
        from .marketplace_ean_mapping_service import confirm_marketplace_ean_mapping
        with patch("database.marketplace_ean_mapping_service.Kid.objects.select_for_update") as locked:
            locked.return_value.filter.return_value.order_by.return_value.__getitem__.return_value = [self.kid]
            result = confirm_marketplace_ean_mapping(
                kid_number="565536401", marketplace="otto", account="xl", ean="4071489368567",
                actor=self.actor, request_id="create-1",
            )
        self.assertFalse(result["status"])
        self.assertEqual(InventoryChangeLog.objects.get().actor_login, "eugen")

    def test_audit_read_failure_does_not_raise_from_submission(self):
        with patch("database.inventory_audit_service.InventoryChangeLog.objects.filter", side_effect=RuntimeError("unavailable")), self.assertLogs("database.inventory_audit_service", level="ERROR"):
            self.record()
