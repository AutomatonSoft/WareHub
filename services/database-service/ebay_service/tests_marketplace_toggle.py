from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from database.marketplace_deactivate_service import deactivate_marketplaces_by_kid_number, toggle_local_marketplace_statuses_by_kid_number
from .client import EbayApiError
from .marketplace_toggle import apply_ebay_active_state, toggle_ebay_listing


class EbayMarketplaceToggleTests(SimpleTestCase):
    def setUp(self):
        self.listing = SimpleNamespace(
            account="dep", marketplace_id="EBAY_DE", listing_mode="inventory", sku="4071489361032",
            source_ean="4062292011702", offer_id="offer-1", item_id="item-1", status="active", save=MagicMock(),
            last_operation="publish", pk=1, updated_at=None,
        )
        self.filter_patch = patch("ebay_service.marketplace_toggle.EbayListing.objects.filter")
        self.filter_mock = self.filter_patch.start()
        self.addCleanup(self.filter_patch.stop)
        self.filter_mock.return_value.order_by.return_value.__getitem__.return_value = [self.listing]
        self.filter_mock.return_value.update.return_value = 1
        self.client_patch = patch("ebay_service.marketplace_toggle.EbayOAuthClient")
        self.client = self.client_patch.start().return_value
        self.addCleanup(self.client_patch.stop)

    @patch("ebay_service.marketplace_toggle.execute_listing_operation")
    def test_inventory_activation_and_deactivation_dispatch_existing_operations(self, execute):
        for account in ("jv", "xl", "dep"):
            for inactive, remote_status, operation in ((True, "PUBLISHED", "unpublish"), (False, "UNPUBLISHED", "relist")):
                with self.subTest(account=account, inactive=inactive):
                    self.client.offer.return_value = {"status": remote_status}
                    toggle_ebay_listing(account=account, ean=self.listing.sku, inactive=inactive)
                    self.assertEqual(execute.call_args.kwargs["operation"], operation)
                    self.assertEqual(execute.call_args.kwargs["account"], account)
                    self.assertEqual(execute.call_args.kwargs["sku"], self.listing.sku)

    @patch("ebay_service.marketplace_toggle.execute_listing_operation")
    def test_retry_checks_remote_state_not_local_status(self, execute):
        for inactive, remote_status in ((True, "UNPUBLISHED"), (False, "PUBLISHED")):
            with self.subTest(inactive=inactive):
                self.client.offer.return_value = {"status": remote_status}
                result = toggle_ebay_listing(account="dep", ean=self.listing.sku, inactive=inactive)
                self.assertTrue(result["noop"])
        execute.assert_not_called()

    @patch("ebay_service.marketplace_toggle.execute_listing_operation")
    def test_legacy_relist_uses_item_id_and_rejects_variations(self, execute):
        self.listing.listing_mode = "legacy"
        self.client.listing.return_value = {"listing_type": "FixedPriceItem", "listing_status": "Ended"}
        toggle_ebay_listing(account="dep", ean=self.listing.source_ean, inactive=False)
        self.assertEqual(execute.call_args.kwargs["item_id"], "item-1")
        self.assertEqual(execute.call_args.kwargs["operation"], "relist")
        execute.reset_mock()
        self.client.listing.return_value["has_variations"] = True
        with self.assertRaises(EbayApiError):
            toggle_ebay_listing(account="dep", ean=self.listing.source_ean, inactive=True)
        execute.assert_not_called()

    @patch("ebay_service.marketplace_toggle.execute_listing_operation")
    def test_retry_recovers_relisted_legacy_item_without_duplicate(self, execute):
        self.listing.listing_mode = "legacy"
        self.client.listing.side_effect = [
            {"listing_type": "FixedPriceItem", "listing_status": "Ended", "relisted_item_id": "item-2"},
            {"listing_type": "FixedPriceItem", "listing_status": "Active"},
        ]
        result = toggle_ebay_listing(account="dep", ean=self.listing.source_ean, inactive=False)
        self.assertEqual(result["item_id"], "item-2")
        execute.assert_not_called()

    @patch("ebay_service.marketplace_toggle.execute_listing_operation")
    def test_missing_ambiguous_and_unknown_state_fail_without_write(self, execute):
        for matches in ([], [self.listing, self.listing]):
            self.filter_mock.return_value.order_by.return_value.__getitem__.return_value = matches
            with self.assertRaises(EbayApiError):
                toggle_ebay_listing(account="dep", ean=self.listing.sku, inactive=True)
        self.filter_mock.return_value.order_by.return_value.__getitem__.return_value = [self.listing]
        self.client.offer.return_value = {"status": "UNKNOWN"}
        with self.assertRaises(EbayApiError):
            toggle_ebay_listing(account="dep", ean=self.listing.sku, inactive=True)
        execute.assert_not_called()
        self.listing.save.assert_not_called()

    def test_upstream_failure_is_not_reported_as_success(self):
        self.client.offer.side_effect = EbayApiError("eBay unavailable", status_code=503)
        result = apply_ebay_active_state(account="dep", ean=self.listing.sku, inactive=True)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status_code"], 503)

    @patch("ebay_service.marketplace_toggle.execute_listing_operation")
    def test_concurrent_or_unresolved_legacy_relist_cannot_create_duplicate(self, execute):
        self.listing.listing_mode = "legacy"
        self.client.listing.return_value = {"listing_type": "FixedPriceItem", "listing_status": "Ended"}
        self.filter_mock.return_value.update.return_value = 0
        with self.assertRaises(EbayApiError):
            toggle_ebay_listing(account="dep", ean=self.listing.source_ean, inactive=False)
        self.filter_mock.return_value.update.return_value = 1
        self.listing.last_operation = "sofort_relist_pending"
        with self.assertRaises(EbayApiError):
            toggle_ebay_listing(account="dep", ean=self.listing.source_ean, inactive=False)
        execute.assert_not_called()


class EbayKidToggleTests(SimpleTestCase):
    @patch("database.marketplace_deactivate_service.apply_ebay_active_state")
    @patch("database.marketplace_deactivate_service.EanStatus.objects.get_or_create")
    @patch("database.marketplace_deactivate_service._find_kid_by_number")
    def test_only_successful_ebay_accounts_change_local_status(self, find_kid, get_status, apply):
        find_kid.return_value = SimpleNamespace(id=1, kid_number=["kid-1"], ean=SimpleNamespace(ebay_jv="111", ebay_xl="222", ebay_dep="333", temu="444"))
        status_row = SimpleNamespace(ebay_jv=True, ebay_xl=True, ebay_dep=True, temu=True, save=MagicMock())
        get_status.return_value = (status_row, False)
        apply.side_effect = lambda **kwargs: {"ok": kwargs["account"] != "xl", "site_key": f"EBAY_{kwargs['account'].upper()}", "channel": "EBAY", "status_code": 200 if kwargs["account"] != "xl" else 503, "details": {}}
        result = toggle_local_marketplace_statuses_by_kid_number(kid_number="kid-1", inactive=True, actor="test")
        self.assertFalse(status_row.ebay_jv)
        self.assertTrue(status_row.ebay_xl)
        self.assertFalse(status_row.ebay_dep)
        self.assertFalse(status_row.temu)
        self.assertEqual(result["payload"]["summary"], {"total": 4, "success": 3, "failed": 1})
        self.assertEqual(status_row.save.call_args.kwargs["update_fields"], ["ebay_jv", "ebay_dep", "temu"])

    @patch("database.marketplace_deactivate_service._update_kid_place_after_marketplace_toggle")
    @patch("database.marketplace_deactivate_service.apply_ebay_active_state")
    @patch("database.marketplace_deactivate_service._resolve_kid_marketplace_targets")
    @patch("database.marketplace_deactivate_service.EanStatus.objects.get_or_create")
    @patch("database.marketplace_deactivate_service._find_kid_by_number")
    def test_direct_kid_toggle_also_calls_ebay_and_preserves_status_on_failure(self, find_kid, get_status, resolve, apply, place):
        find_kid.return_value = SimpleNamespace(id=1, kid_number=["kid-1"])
        status_row = SimpleNamespace(ebay_dep=True, save=MagicMock())
        get_status.return_value = (status_row, False)
        resolve.return_value = ([{"source_field": "ebay_dep", "channel": "EBAY", "site_key": "EBAY_DEP", "ean": "333", "unsupported": True}], [])
        apply.return_value = {"ok": False, "status_code": 503, "site_key": "EBAY_DEP", "channel": "EBAY", "details": {}}
        result = deactivate_marketplaces_by_kid_number(kid_number="kid-1", inactive=True, actor="test")
        apply.assert_called_once_with(account="dep", ean="333", inactive=True)
        self.assertEqual(result["payload"]["status"], "failed")
        self.assertTrue(status_row.ebay_dep)
        status_row.save.assert_not_called()
        place.assert_not_called()
