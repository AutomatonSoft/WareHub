from contextlib import nullcontext
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch
import uuid

from django.test import SimpleTestCase
from django.utils import timezone

from .external_requests import OttoExternalAPIError, OttoExternalProductsClient
from .publication_service import check_publication, extract_task_id, record_submissions, reconcile_next_publication
from .tests import FakeResponse, FakeSession

TASK = "60dbf10a-7a9a-4133-a3e2-73d6bf8199fb"
SKU = "4071489361629"


def publication(**overrides):
    return SimpleNamespace(**{ "pk": 1, "profile": "jv", "sku": SKU, "ean": SKU, "task_id": TASK,
                             "submitted_at": timezone.now(), "submission_id": uuid.uuid4(),
                             "save": Mock(), "online": None, **overrides})


def client(online=False):
    result = Mock()
    result.fetch_update_task.side_effect = [{"state": "done", "total": 1, "succeeded": 1, "failed": 0}, {"results": []}, {"results": [{"variation": f"/v5/products/{SKU}"}]}]
    result.fetch_publication_status.return_value = {"sku": SKU, "controller": "jv", "is_live": online, "marketplace_status": "ONLINE" if online else "OFFLINE"}
    return result


class OttoPublicationTests(SimpleTestCase):
    def test_task_id_uses_otto_process_not_internal_task_id(self):
        self.assertEqual(extract_task_id({"task_id": str(uuid.uuid4()), "processId": TASK}), TASK)
        self.assertEqual(extract_task_id({"task_id": str(uuid.uuid4())}), "")
        self.assertEqual(extract_task_id({"result": {"links": [{"href": f"/v5/products/update-tasks/{TASK}"}]}}), TASK)
        self.assertEqual(extract_task_id("updated"), "")

    def test_http_200_rejection_is_not_accepted(self):
        session = FakeSession(FakeResponse(payload={"success": False, "detail": "Invalid Grundfarbe"}))
        with self.assertRaises(OttoExternalAPIError):
            OttoExternalProductsClient(session=session).create_or_update_products(controller="jv", products=[])

    def test_accepted_contract_prefers_job_id_over_internal_task_id(self):
        self.assertEqual(extract_task_id({"job_id": TASK, "marketplace_job_id": TASK, "task_id": str(uuid.uuid4())}), TASK)
        self.assertEqual(extract_task_id({"marketplace_job_id": TASK}), TASK)
        self.assertEqual(extract_task_id({"job_id": "invalid", "marketplace_job_id": TASK}), TASK)

    def test_aggregated_job_results_match_sku_and_require_online(self):
        for online in (False, True):
            api = client(online)
            api.fetch_update_task.side_effect = [{"job_id": TASK, "controller": "jv", "state": "DONE", "failures": [], "succeeded_items": [{"variation": f"/v5/products/{SKU}"}]}]
            self.assertEqual(check_publication(publication(), api), ("online" if online else "processed", online, []))
            self.assertEqual(api.fetch_update_task.call_count, 1)

    def test_aggregated_failures_preserve_error_and_previous_live_listing(self):
        error = {"code": "100006", "title": "Invalid Grundfarbe", "jsonPath": "$.Grundfarbe"}
        api = client(True)
        api.fetch_update_task.side_effect = [{"state": "FAILED", "failures": [{"variation": f"/v5/products/{SKU}", "errors": [error]}], "succeeded_items": []}]
        self.assertEqual(check_publication(publication(online=True), api), ("rejected", True, [error]))
        self.assertEqual(api.fetch_update_task.call_count, 1)

    def test_aggregated_partial_batch_ignores_other_sku_failure(self):
        api = client(True)
        api.fetch_update_task.side_effect = [{"state": "done", "failures": [{"variation": "/v5/products/other", "errors": [{"title": "Invalid"}]}], "succeeded_items": [{"variation": f"/v5/products/{SKU}"}]}]
        self.assertEqual(check_publication(publication(), api), ("online", True, []))

    def test_job_identity_and_malformed_results_are_not_trusted(self):
        for payload in ({"controller": "xl", "state": "done"}, {"job_id": str(uuid.uuid4()), "state": "done"}, {"state": "done", "failures": None}):
            api = client(True)
            api.fetch_update_task.side_effect = [payload]
            with self.assertRaises(OttoExternalAPIError):
                check_publication(publication(), api)

    def test_pending_and_failed_without_sku_result_are_unconfirmed(self):
        for task_state in ("PENDING", "IN_PROGRESS", "FAILED", "unexpected"):
            api = client()
            api.fetch_update_task.side_effect = [{"state": task_state, "failures": [], "succeeded_items": []}]
            state, online, errors = check_publication(publication(), api)
            self.assertEqual(state, "pending" if task_state in ("PENDING", "IN_PROGRESS") else "unknown")
            self.assertFalse(online)

    def test_job_status_client_uses_new_endpoint(self):
        session = FakeSession(FakeResponse(payload={"state": "done"}))
        OttoExternalProductsClient(session=session, base_url="https://otto.example.test").fetch_update_task(task_id=TASK, controller="jv")
        args, kwargs = session.calls[0]
        self.assertEqual(args[0], f"https://otto.example.test/extermal/job_status/{TASK}")
        self.assertEqual(kwargs["params"], {"controller": "jv"})
        self.assertEqual(kwargs["timeout"], (8, 30))

    def test_done_and_succeeded_does_not_mean_online(self):
        self.assertEqual(check_publication(publication(), client()), ("processed", False, []))
        self.assertEqual(check_publication(publication(), client(True)), ("online", True, []))

    def test_rejection_retains_field_error_and_does_not_hide_existing_online_listing(self):
        error = {"code": "100006", "title": "Invalid Grundfarbe", "jsonPath": "$.attributes.Grundfarbe"}
        api = client(True)
        api.fetch_update_task.side_effect = [{"state": "done", "total": 1, "failed": 1}, {"results": [{"variation": f"/v5/products/{SKU}", "errors": [error]}]}]
        self.assertEqual(check_publication(publication(), api), ("rejected", True, [error]))

    def test_status_unavailable_is_not_offline_or_success(self):
        api = client()
        api.fetch_publication_status.side_effect = OttoExternalAPIError("unavailable")
        self.assertEqual(check_publication(publication(), api), ("processed", None, []))

    def test_partial_batch_uses_only_this_sku_errors(self):
        api = client(True)
        api.fetch_update_task.side_effect = [
            {"state": "done", "total": 2, "failed": 1, "succeeded": 1},
            {"results": [{"variation": "/v5/products/another-sku", "errors": [{"title": "Invalid"}]}]},
            {"results": [{"variation": f"/v5/products/{SKU}"}]},
        ]
        self.assertEqual(check_publication(publication(), api), ("online", True, []))

    def test_pending_task_and_mismatched_status_never_become_online(self):
        api = client(True)
        api.fetch_update_task.side_effect = [{"state": "processing"}]
        api.fetch_publication_status.return_value["sku"] = "another-sku"
        self.assertEqual(check_publication(publication(), api), ("pending", None, []))

    def test_missing_task_id_is_explicitly_unconfirmed(self):
        api = client()
        state, online, errors = check_publication(publication(task_id=""), api)
        self.assertEqual((state, online, errors[0]["code"]), ("unknown", False, "otto_task_id_missing"))
        api.fetch_update_task.assert_not_called()

    def test_retry_replaces_submission_but_preserves_last_known_visibility(self):
        with patch("otto_service.publication_service.transaction.atomic", return_value=nullcontext()), patch("otto_service.publication_service.OttoPublication.objects") as objects, patch("otto_service.publication_service._sync_mapping_visibility"):
            objects.update_or_create.return_value = (publication(), True)
            record_submissions("xl", [{"sku": SKU, "ean": SKU}], {"processId": TASK})
        kwargs = objects.update_or_create.call_args.kwargs
        self.assertEqual(kwargs["profile"], "xl")
        self.assertEqual(kwargs["defaults"]["task_id"], TASK)
        self.assertNotIn("online", kwargs["defaults"])

    def test_worker_does_not_overwrite_newer_submission(self):
        item = publication()
        newer = publication()
        with patch("otto_service.publication_service.transaction.atomic", side_effect=lambda: nullcontext()), patch("otto_service.publication_service.OttoPublication.objects") as objects, patch("otto_service.publication_service.EanStatus.objects") as statuses:
            objects.select_for_update.return_value.filter.return_value.order_by.return_value.first.return_value = item
            objects.select_for_update.return_value.get.return_value = newer
            self.assertIsNone(reconcile_next_publication(client(True)))
            statuses.filter.assert_not_called()

    def test_worker_timeout_keeps_ean_and_stops_polling(self):
        item = publication()
        item.submitted_at -= timedelta(days=3)
        api = client()
        with patch("otto_service.publication_service.transaction.atomic", side_effect=lambda: nullcontext()), patch("otto_service.publication_service.OttoPublication.objects") as objects, patch("otto_service.publication_service.EanStatus.objects") as statuses:
            objects.select_for_update.return_value.filter.return_value.order_by.return_value.first.return_value = item
            objects.select_for_update.return_value.get.return_value = item
            result = reconcile_next_publication(api)
            self.assertEqual(result["state"], "unknown")
            self.assertIsNone(item.next_check_at)
            api.fetch_update_task.assert_not_called()
            statuses.filter.assert_not_called()

    def test_mapping_writes_ean_without_published_flag_for_pending_otto(self):
        from database.marketplace_ean_mapping_service import confirm_marketplace_ean_mapping
        kid = SimpleNamespace(pk=4)
        eans = Mock(otto_jv=None)
        statuses = Mock(otto_jv=False)
        with patch("database.marketplace_ean_mapping_service.transaction.atomic", return_value=nullcontext()), patch("database.marketplace_ean_mapping_service.Kid.objects") as kids, patch("database.marketplace_ean_mapping_service.Ean.objects") as ean_objects, patch("database.marketplace_ean_mapping_service.EanStatus.objects") as status_objects, patch("otto_service.models.OttoPublication.objects") as publications:
            kids.select_for_update.return_value.filter.return_value.order_by.return_value.__getitem__.return_value = [kid]
            ean_objects.select_for_update.return_value.get_or_create.return_value = (eans, True)
            status_objects.select_for_update.return_value.get_or_create.return_value = (statuses, True)
            publications.filter.return_value.order_by.return_value.first.return_value = publication()
            result = confirm_marketplace_ean_mapping(kid_number="123", marketplace="otto", account="jv", ean=SKU)
            self.assertEqual(eans.otto_jv, SKU)
            self.assertFalse(statuses.otto_jv)
            self.assertFalse(result["status"])

    def test_status_client_uses_get_account_and_timeout(self):
        session = FakeSession(FakeResponse(payload={"state": "done"}))
        OttoExternalProductsClient(session=session, base_url="https://otto.example.test").fetch_update_task(task_id=TASK, controller="xl", result="failed")
        args, kwargs = session.calls[0]
        self.assertEqual(args[0], f"https://otto.example.test/v1/products/otto/update-tasks/{TASK}/failed")
        self.assertEqual(kwargs["params"], {"controller": "xl"})
        self.assertEqual(kwargs["timeout"], (8, 30))
