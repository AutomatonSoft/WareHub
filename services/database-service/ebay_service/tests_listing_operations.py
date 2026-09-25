from unittest.mock import patch

from django.test import SimpleTestCase, TestCase

from database.models import EbayListing

from .client import EbayApiError
from .listing_operations import _default_merchant_location_key, _legacy_ean_matches, execute_listing_operation, index_all_legacy_listings, index_legacy_listing_page, reconcile_legacy_listing
from .management.commands.run_ebay_legacy_indexer import Command as LegacyIndexerCommand


class EbayLegacyIndexerCommandTests(SimpleTestCase):
    @patch("ebay_service.management.commands.run_ebay_legacy_indexer.time.sleep", side_effect=KeyboardInterrupt)
    @patch.object(LegacyIndexerCommand, "_run_cycle")
    def test_default_worker_does_not_scan(self, run_cycle, _sleep):
        with self.assertRaises(KeyboardInterrupt):
            LegacyIndexerCommand().handle(once=False, continuous=False, poll_interval=3600)

        run_cycle.assert_not_called()


class EbayLegacyIdentifierTests(SimpleTestCase):
    def test_matches_ean_or_identical_sku(self):
        self.assertEqual(
            _legacy_ean_matches(listings=[{"item_id": "1", "sku": "4067282464896", "identifiers": {}, "variations": []}], source_ean="4067282464896"),
            [({"item_id": "1", "sku": "4067282464896", "identifiers": {}, "variations": []}, "")],
        )

    def test_matches_variation_sku(self):
        listing = {"item_id": "1", "identifiers": {}, "variations": [{"sku": "4067282464896", "identifiers": {}}]}
        self.assertEqual(_legacy_ean_matches(listings=[listing], source_ean="4067282464896"), [(listing, "4067282464896")])


class EbayInventoryFetchTests(SimpleTestCase):
    @patch("ebay_service.listing_operations._save_listing")
    @patch("ebay_service.listing_operations.EbayListing.objects.filter")
    @patch("ebay_service.listing_operations.EbayTaxonomyClient")
    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_inventory_publish_supplies_hidden_default_warehouse(self, client_class, taxonomy_client_class, filter_mock, _save_listing):
        client = client_class.return_value
        filter_mock.return_value.first.return_value = None
        client.inventory_locations.return_value = {"locations": [], "total": 0}
        client.offers_by_sku.return_value = []
        client.create_offer.return_value = {"offerId": "offer-1"}
        client.publish_offer.return_value = {"listingId": "listing-1"}
        taxonomy_client_class.return_value.category_tree.return_value = {"categorySubtreeNode": {"leafCategoryTreeNode": True}}
        taxonomy_client_class.return_value.category_aspects.return_value = {"aspects": []}

        execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", operation="publish", listing_mode="inventory",
            sku="4062292372025", source_ean="4062292372025", quantity=1, price="749.00",
            inventory_item={"condition": "NEW", "product": {
                "title": "Chair", "description": "Chair description", "aspects": {"Brand": ["Depotum"]},
                "imageUrls": ["https://example.test/chair.jpg"],
            }},
            offer={"format": "FIXED_PRICE", "categoryId": "123", "listingDuration": "GTC", "listingPolicies": {
                "fulfillmentPolicyId": "fulfillment-1", "paymentPolicyId": "payment-1", "returnPolicyId": "return-1",
            }},
        )

        self.assertEqual(client.create_offer.call_args.kwargs["offer"]["merchantLocationKey"], "warehub-dep-de-88483")

    @patch("ebay_service.listing_operations.EbayListing.objects.filter")
    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_inventory_publish_requires_jv_warehouse(self, client_class, filter_mock):
        filter_mock.return_value.first.return_value = None

        with self.assertRaises(EbayApiError):
            execute_listing_operation(
                account="jv", marketplace_id="EBAY_DE", operation="publish", listing_mode="inventory",
                sku="4062292372025", source_ean="4062292372025", quantity=1, price="749.00",
                inventory_item={"condition": "NEW", "product": {
                    "title": "Chair", "description": "Chair description", "aspects": {"Brand": ["Depotum"]},
                    "imageUrls": ["https://example.test/chair.jpg"],
                }},
                offer={"format": "FIXED_PRICE", "categoryId": "123", "listingDuration": "GTC", "listingPolicies": {
                    "fulfillmentPolicyId": "fulfillment-1", "paymentPolicyId": "payment-1", "returnPolicyId": "return-1",
                }},
            )

        client_class.return_value.inventory_locations.assert_not_called()

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_default_warehouse_reuses_matching_account_location(self, client_class):
        client = client_class.return_value
        client.inventory_locations.return_value = {"locations": [{
            "merchantLocationKey": "xl-existing",
            "merchantLocationStatus": "ENABLED",
            "locationTypes": ["WAREHOUSE"],
            "location": {"address": {"postalCode": "88483", "country": "DE"}},
        }]}

        self.assertEqual(_default_merchant_location_key(client=client, account="xl"), "xl-existing")
        client.create_inventory_location.assert_not_called()

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_default_warehouse_creates_account_location_when_missing(self, client_class):
        client = client_class.return_value
        client.inventory_locations.return_value = {"locations": [], "total": 0}

        self.assertEqual(_default_merchant_location_key(client=client, account="dep"), "warehub-dep-de-88483")
        client.create_inventory_location.assert_called_once_with(
            account="dep",
            merchant_location_key="warehub-dep-de-88483",
            name="WareHub DEP 88483",
            address={"postalCode": "88483", "country": "DE"},
        )

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_default_warehouse_rejects_disabled_location(self, client_class):
        client = client_class.return_value
        client.inventory_locations.return_value = {"locations": [{
            "merchantLocationKey": "dep-disabled",
            "merchantLocationStatus": "DISABLED",
            "location": {"address": {"postalCode": "88483", "country": "DE"}},
        }]}

        with self.assertRaises(EbayApiError):
            _default_merchant_location_key(client=client, account="dep")
        client.create_inventory_location.assert_not_called()

    @patch("ebay_service.listing_operations.EbayListing.objects.filter")
    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_inventory_fetch_does_not_require_legacy_item(self, client_class, filter_mock):
        filter_mock.return_value.first.return_value = None
        client = client_class.return_value
        client.inventory_item.return_value = {"sku": "4062292372025"}
        client.offers_by_sku.return_value = []

        result = execute_listing_operation(
            account="dep",
            marketplace_id="EBAY_DE",
            operation="fetch",
            listing_mode="inventory",
            sku="4062292372025",
        )

        self.assertEqual(result["inventory_item"]["sku"], "4062292372025")
        self.assertEqual(result["offers"], [])


class EbayLegacyUpdatePayloadTests(SimpleTestCase):
    @patch("ebay_service.listing_operations._save_listing")
    @patch("ebay_service.listing_operations._resolve_legacy_listing", return_value=("205926392508", None))
    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_omits_unchanged_images(self, client_class, _resolve_listing, _save_listing):
        client = client_class.return_value
        client.listing.return_value = {
            "listing_type": "FixedPriceItem",
            "has_variations": False,
            "title": "Chair",
            "image_urls": ["https://i.ebayimg.com/images/g/chair/s-l1600.jpg"],
            "item_specifics": {"Marke": ["Depotum"]},
        }

        execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", operation="update", listing_mode="legacy",
            item_id="205926392508", legacy_item={
                "title": "Chair",
                "image_urls": ["https://i.ebayimg.com/images/g/chair/s-l1600.jpg"],
                "item_specifics": {"Marke": ["Depotum"], "Farbe": ["Gelb"]},
            },
        )

        self.assertEqual(client.revise_legacy_fixed_price_listing.call_args.kwargs["legacy_item"], {
            "item_specifics": {"Marke": ["Depotum"], "Farbe": ["Gelb"]},
        })

    @patch("ebay_service.listing_operations._save_listing")
    @patch("ebay_service.listing_operations._resolve_legacy_listing", return_value=("205926392508", None))
    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_keeps_changed_images(self, client_class, _resolve_listing, _save_listing):
        client = client_class.return_value
        client.upload_image_from_url.return_value = "https://i.ebayimg.com/images/g/new/s-l1600.jpg"
        client.listing.return_value = {
            "listing_type": "FixedPriceItem",
            "has_variations": False,
            "image_urls": ["https://i.ebayimg.com/images/g/old/s-l1600.jpg"],
        }

        execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", operation="update", listing_mode="legacy",
            item_id="205926392508", legacy_item={"image_urls": [
                "https://i.ebayimg.com/images/g/old/s-l1600.jpg",
                "https://warehub.example/chair.jpg",
            ]},
        )

        self.assertEqual(client.revise_legacy_fixed_price_listing.call_args.kwargs["legacy_item"], {
            "image_urls": [
                "https://i.ebayimg.com/images/g/old/s-l1600.jpg",
                "https://i.ebayimg.com/images/g/new/s-l1600.jpg",
            ],
        })
        client.upload_image_from_url.assert_called_once_with(
            account="dep", image_url="https://warehub.example/chair.jpg",
        )


class EbayListingOperationTests(TestCase):
    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_fetch_discovers_missing_index_across_seller_search(self, client_class):
        client = client_class.return_value
        client.seller_user_id.return_value = "depotum-de"
        client.search_listing_item_ids.return_value = ["318190872406"]
        client.listing.return_value = {
            "item_id": "318190872406", "seller": "depotum-de", "listing_status": "Active",
            "listing_type": "FixedPriceItem", "identifiers": {"EAN": ["4067282464896"]}, "variations": [],
        }

        result = execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
            source_ean="4067282464896",
        )

        self.assertEqual(result["item_id"], "318190872406")
        listing = EbayListing.objects.get(account="dep", item_id="318190872406")
        self.assertEqual(listing.source_ean, "4067282464896")
        self.assertEqual(listing.legacy_ean_to_variation_sku, {"4067282464896": ""})
        client.search_listing_item_ids.assert_called_once_with(
            marketplace_id="EBAY_DE", seller_user_id="depotum-de", source_ean="4067282464896",
        )

        execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
            source_ean="4067282464896",
        )
        client.search_listing_item_ids.assert_called_once()

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_fetch_falls_back_to_exact_sku_and_remembers_item_id(self, client_class):
        client = client_class.return_value
        client.seller_listing_item_ids_by_sku.return_value = ["318190872406"]
        client.listing.return_value = {
            "item_id": "318190872406", "seller": "depotum-de", "listing_status": "Active",
            "listing_type": "FixedPriceItem", "sku": "4067282464896", "identifiers": {}, "variations": [],
        }

        result = execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
            source_ean="4067282464896",
        )

        self.assertEqual(result["item_id"], "318190872406")
        self.assertEqual(EbayListing.objects.get(account="dep", item_id="318190872406").source_ean, "4067282464896")
        client.seller_user_id.assert_not_called()
        client.search_listing_item_ids.assert_called_once_with(
            marketplace_id="EBAY_DE", seller_user_id="depotum-de", source_ean="4067282464896",
        )
        client.seller_listing_item_ids_by_sku.assert_called_once_with(
            account="dep", marketplace_id="EBAY_DE", sku="4067282464896",
        )
        execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
            source_ean="4067282464896",
        )
        client.seller_listing_item_ids_by_sku.assert_called_once()

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_search_detects_conflict_between_sku_and_ean(self, client_class):
        client = client_class.return_value
        client.seller_listing_item_ids_by_sku.return_value = ["318190872406"]
        client.search_listing_item_ids.return_value = ["318190872406", "318190872407"]
        client.listing.side_effect = [
            {"item_id": "318190872406", "seller": "depotum-de", "listing_status": "Active",
             "listing_type": "FixedPriceItem", "sku": "4067282464896", "identifiers": {}, "variations": []},
            {"item_id": "318190872407", "seller": "depotum-de", "listing_status": "Active",
             "listing_type": "FixedPriceItem", "sku": "other", "identifiers": {"EAN": ["4067282464896"]}, "variations": []},
        ]

        with self.assertRaises(EbayApiError) as error:
            execute_listing_operation(
                account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
                source_ean="4067282464896",
            )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(error.exception.details["item_ids"], ["318190872406", "318190872407"])
        self.assertEqual(client.listing.call_count, 2)

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_fetch_replaces_stale_cached_item_id(self, client_class):
        client = client_class.return_value
        EbayListing.objects.create(
            account="dep", marketplace_id="EBAY_DE", listing_mode=EbayListing.ListingMode.LEGACY,
            item_id="205926392508", source_ean="4067282464896",
            legacy_ean_to_variation_sku={"4067282464896": ""},
        )
        candidate = {
            "item_id": "318190872406", "seller": "depotum-de", "listing_status": "Active",
            "listing_type": "FixedPriceItem", "sku": "4067282464896", "identifiers": {}, "variations": [],
        }
        client.seller_listing_item_ids_by_sku.return_value = ["318190872406"]
        client.search_listing_item_ids.return_value = []
        client.listing.side_effect = [
            EbayApiError("Item unavailable", status_code=200, details={"errors": [{"code": "17"}]}, operation="get_listing"),
            candidate, candidate,
        ]

        result = execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
            source_ean="4067282464896",
        )

        self.assertEqual(result["item_id"], "318190872406")
        self.assertEqual(EbayListing.objects.get(item_id="205926392508").source_ean, "")
        self.assertEqual(EbayListing.objects.get(item_id="318190872406").source_ean, "4067282464896")

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_fetch_does_not_return_cached_item_with_different_ean(self, client_class):
        client = client_class.return_value
        EbayListing.objects.create(
            account="dep", marketplace_id="EBAY_DE", listing_mode=EbayListing.ListingMode.LEGACY,
            item_id="205926392508", source_ean="4067282464896",
        )
        client.listing.side_effect = [
            {"item_id": "205926392508", "sku": "other", "identifiers": {"EAN": ["other"]}, "variations": []},
            {"item_id": "318190872406", "seller": "depotum-de", "listing_status": "Active",
             "listing_type": "FixedPriceItem", "sku": "4067282464896", "identifiers": {}, "variations": []},
            {"item_id": "318190872406", "seller": "depotum-de", "listing_status": "Active",
             "listing_type": "FixedPriceItem", "sku": "4067282464896", "identifiers": {}, "variations": []},
        ]
        client.seller_listing_item_ids_by_sku.return_value = ["318190872406"]
        client.search_listing_item_ids.return_value = []

        result = execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
            source_ean="4067282464896",
        )

        self.assertEqual(result["item_id"], "318190872406")
        self.assertEqual(EbayListing.objects.get(item_id="205926392508").source_ean, "")

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_fetch_keeps_mapping_when_limit_is_exhausted(self, client_class):
        client = client_class.return_value
        EbayListing.objects.create(
            account="dep", marketplace_id="EBAY_DE", listing_mode=EbayListing.ListingMode.LEGACY,
            item_id="205926392508", source_ean="4067282464896",
        )
        client.listing.side_effect = EbayApiError(
            "Call limit reached", status_code=200, details={"errors": [{"code": "518"}]}, operation="get_listing",
        )

        with self.assertRaises(EbayApiError):
            execute_listing_operation(
                account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
                source_ean="4067282464896",
            )

        self.assertEqual(EbayListing.objects.get(item_id="205926392508").source_ean, "4067282464896")
        client.seller_listing_item_ids_by_sku.assert_not_called()

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_fetch_keeps_stale_mapping_without_confirmed_replacement(self, client_class):
        client = client_class.return_value
        EbayListing.objects.create(
            account="dep", marketplace_id="EBAY_DE", listing_mode=EbayListing.ListingMode.LEGACY,
            item_id="205926392508", source_ean="4067282464896",
        )
        client.listing.side_effect = EbayApiError(
            "Item unavailable", status_code=200, details={"errors": [{"code": "17"}]}, operation="get_listing",
        )
        client.seller_listing_item_ids_by_sku.return_value = ["205926392508"]
        client.search_listing_item_ids.return_value = ["205926392508"]
        client.seller_user_id.return_value = "depotum-de"

        with self.assertRaises(EbayApiError) as error:
            execute_listing_operation(
                account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
                source_ean="4067282464896",
            )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(EbayListing.objects.get(item_id="205926392508").source_ean, "4067282464896")

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_fetch_does_not_recover_explicit_item_id(self, client_class):
        client = client_class.return_value
        client.listing.side_effect = EbayApiError(
            "Item unavailable", status_code=200, details={"errors": [{"code": "17"}]}, operation="get_listing",
        )

        with self.assertRaises(EbayApiError):
            execute_listing_operation(
                account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
                item_id="205926392508", source_ean="4067282464896",
            )

        client.seller_listing_item_ids_by_sku.assert_not_called()

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_sku_search_does_not_select_duplicate(self, client_class):
        client = client_class.return_value
        client.seller_user_id.return_value = "depotum-de"
        client.search_listing_item_ids.return_value = []
        client.seller_listing_item_ids_by_sku.return_value = ["318190872406", "318190872407"]
        client.listing.side_effect = [
            {"item_id": item_id, "seller": "depotum-de", "listing_status": "Active",
             "listing_type": "FixedPriceItem", "sku": "4067282464896", "identifiers": {}, "variations": []}
            for item_id in client.seller_listing_item_ids_by_sku.return_value
        ]

        with self.assertRaises(EbayApiError) as error:
            execute_listing_operation(
                account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
                source_ean="4067282464896",
            )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(error.exception.details["item_ids"], ["318190872406", "318190872407"])

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_search_rejects_other_seller(self, client_class):
        client = client_class.return_value
        client.seller_user_id.return_value = "depotum-de"
        client.search_listing_item_ids.return_value = ["318190872406"]
        client.listing.return_value = {
            "item_id": "318190872406", "seller": "another-seller", "listing_status": "Active",
            "listing_type": "FixedPriceItem", "identifiers": {"EAN": ["4067282464896"]}, "variations": [],
        }

        with self.assertRaises(EbayApiError) as error:
            execute_listing_operation(
                account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
                source_ean="4067282464896",
            )

        self.assertEqual(error.exception.status_code, 404)
        self.assertFalse(EbayListing.objects.filter(item_id="318190872406").exists())

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_search_ignores_keyword_false_positive(self, client_class):
        client = client_class.return_value
        client.seller_user_id.return_value = "depotum-de"
        client.search_listing_item_ids.return_value = ["206094766893", "318190872406"]
        client.listing.side_effect = [
            {"item_id": "206094766893", "seller": "depotum-de", "listing_status": "Active",
             "listing_type": "FixedPriceItem", "identifiers": {"EAN": ["other-ean"]}, "variations": []},
            {"item_id": "318190872406", "seller": "depotum-de", "listing_status": "Active",
             "listing_type": "FixedPriceItem", "identifiers": {"EAN": ["4067282464896"]}, "variations": []},
            {"item_id": "318190872406", "seller": "depotum-de", "listing_status": "Active",
             "listing_type": "FixedPriceItem", "identifiers": {"EAN": ["4067282464896"]}, "variations": []},
        ]

        result = execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
            source_ean="4067282464896",
        )

        self.assertEqual(result["item_id"], "318190872406")
        self.assertFalse(EbayListing.objects.filter(item_id="206094766893").exists())

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_search_rejects_multiple_matching_listings(self, client_class):
        client = client_class.return_value
        client.seller_user_id.return_value = "depotum-de"
        client.search_listing_item_ids.return_value = ["318190872406", "318190872407"]
        client.listing.side_effect = [
            {"item_id": item_id, "seller": "depotum-de", "listing_status": "Active",
             "listing_type": "FixedPriceItem", "identifiers": {"EAN": ["4067282464896"]}, "variations": []}
            for item_id in client.search_listing_item_ids.return_value
        ]

        with self.assertRaises(EbayApiError) as error:
            execute_listing_operation(
                account="dep", marketplace_id="EBAY_DE", operation="fetch", listing_mode="legacy",
                source_ean="4067282464896",
            )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(error.exception.details["item_ids"], ["318190872406", "318190872407"])
        self.assertEqual([listing["item_id"] for listing in error.exception.details["listings"]], ["318190872406", "318190872407"])
        self.assertFalse(EbayListing.objects.filter(source_ean="4067282464896").exists())

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_index_page_persists_listing_and_variation_eans(self, client_class):
        client_class.return_value.active_listings.return_value = {
            "total_pages": "2",
            "listings": [{
                "item_id": "205926392508",
                "identifiers": {"EAN": ["4062292372025"]},
                "variations": [{"sku": "green", "identifiers": {"EAN": ["4062292372026"]}}],
            }],
        }

        result = index_legacy_listing_page(account="dep", marketplace_id="EBAY_DE", page=1, limit=100)

        listing = EbayListing.objects.get(account="dep", marketplace_id="EBAY_DE", item_id="205926392508")
        self.assertEqual(result["indexed_listings"], 1)
        self.assertEqual(result["indexed_eans"], 2)
        self.assertEqual(listing.source_ean, "4062292372025")
        self.assertEqual(listing.legacy_ean_to_variation_sku, {"4062292372025": "", "4062292372026": "green"})

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_index_scans_all_reported_pages(self, client_class):
        client_class.return_value.active_listings.side_effect = [
            {"total_pages": "2", "listings": [{"item_id": "item-1", "identifiers": {"EAN": ["111"]}}]},
            {"total_pages": "2", "listings": [{"item_id": "item-2", "identifiers": {"EAN": ["222"]}}]},
        ]

        result = index_all_legacy_listings(
            account="dep",
            marketplace_id="EBAY_DE",
            limit=100,
            max_pages=10_000,
        )

        self.assertEqual(result["pages_scanned"], 2)
        self.assertEqual(result["indexed_listings"], 2)
        self.assertEqual(result["indexed_eans"], 2)
        self.assertEqual(client_class.return_value.active_listings.call_count, 2)

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_index_preserves_known_inventory_listing(self, client_class):
        EbayListing.objects.create(
            account="dep",
            marketplace_id="EBAY_DE",
            listing_mode=EbayListing.ListingMode.INVENTORY,
            sku="4062292372025",
            item_id="205926392508",
        )
        client_class.return_value.active_listings.return_value = {
            "total_pages": "1",
            "listings": [{"item_id": "205926392508", "identifiers": {"EAN": ["4062292372025"]}}],
        }

        result = index_legacy_listing_page(account="dep", marketplace_id="EBAY_DE", page=1, limit=100)

        self.assertEqual(result["indexed_listings"], 0)
        self.assertEqual(result["skipped_inventory_listings"], 1)
        self.assertEqual(EbayListing.objects.get(item_id="205926392508").listing_mode, EbayListing.ListingMode.INVENTORY)
    @patch("ebay_service.listing_operations.EbayTaxonomyClient")
    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_inventory_publish_persists_offer_and_reuses_it_on_retry(self, client_class, taxonomy_client_class):
        client = client_class.return_value
        taxonomy_client = taxonomy_client_class.return_value
        taxonomy_client.category_tree.return_value = {"categorySubtreeNode": {"leafCategoryTreeNode": True}}
        taxonomy_client.category_aspects.return_value = {"aspects": []}
        client.create_offer.return_value = {"offerId": "offer-1"}
        client.publish_offer.return_value = {"listingId": "listing-1"}
        client.offers_by_sku.return_value = []
        payload = {
            "account": "dep",
            "marketplace_id": "EBAY_DE",
            "operation": "publish",
            "listing_mode": "inventory",
            "sku": "4062292372025",
            "source_ean": "4062292372025",
            "inventory_item": {
                "condition": "NEW",
                "product": {
                    "title": "Test chair",
                    "description": "Test chair description",
                    "aspects": {"Brand": ["Depotum"]},
                    "imageUrls": ["https://example.test/chair.jpg"],
                },
            },
            "offer": {
                "format": "FIXED_PRICE",
                "categoryId": "123",
                "merchantLocationKey": "dep-main",
                "listingDuration": "GTC",
                "listingPolicies": {
                    "fulfillmentPolicyId": "fulfillment-1",
                    "paymentPolicyId": "payment-1",
                    "returnPolicyId": "return-1",
                },
            },
            "quantity": 2,
            "price": "199.99",
        }

        first = execute_listing_operation(**payload)
        second = execute_listing_operation(**payload)

        self.assertEqual(first["offer_id"], "offer-1")
        self.assertEqual(second["listing_id"], "listing-1")
        self.assertEqual(client.create_offer.call_count, 1)
        client.update_offer.assert_called_once()
        listing = EbayListing.objects.get(account="dep", marketplace_id="EBAY_DE", sku="4062292372025")
        self.assertEqual(listing.offer_id, "offer-1")
        self.assertEqual(listing.item_id, "listing-1")
        self.assertEqual(listing.status, EbayListing.ListingStatus.ACTIVE)

    @patch("ebay_service.listing_operations.EbayTaxonomyClient")
    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_inventory_publish_rejects_non_leaf_category_and_missing_required_aspects(self, _client_class, taxonomy_client_class):
        payload = {
            "account": "dep", "marketplace_id": "EBAY_DE", "operation": "publish", "listing_mode": "inventory", "sku": "4062292372025",
            "inventory_item": {"condition": "NEW", "product": {"title": "Test chair", "description": "Test chair description", "aspects": {"Brand": ["Depotum"]}, "imageUrls": ["https://example.test/chair.jpg"]}},
            "offer": {"format": "FIXED_PRICE", "categoryId": "123", "merchantLocationKey": "dep-main", "listingDuration": "GTC", "listingPolicies": {"fulfillmentPolicyId": "fulfillment-1", "paymentPolicyId": "payment-1", "returnPolicyId": "return-1"}},
            "quantity": 2, "price": "199.99",
        }
        taxonomy_client = taxonomy_client_class.return_value
        taxonomy_client.category_tree.return_value = {"categorySubtreeNode": {"leafCategoryTreeNode": False}}
        with self.assertRaises(EbayApiError) as non_leaf_error:
            execute_listing_operation(**payload)
        self.assertEqual(non_leaf_error.exception.operation, "validate_category")

        taxonomy_client.category_tree.return_value = {"categorySubtreeNode": {"leafCategoryTreeNode": True}}
        taxonomy_client.category_aspects.return_value = {"aspects": [{"localizedAspectName": "Color", "aspectConstraint": {"aspectRequired": True}}]}
        with self.assertRaises(EbayApiError) as aspects_error:
            execute_listing_operation(**payload)
        self.assertEqual(aspects_error.exception.operation, "validate_category_aspects")
        self.assertEqual(aspects_error.exception.details["missing_aspects"], ["Color"])

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_relist_replaces_persisted_item_id(self, client_class):
        client = client_class.return_value
        client.relist_legacy_fixed_price_listing.return_value = {"item_id": "new-item-id"}
        EbayListing.objects.create(
            account="dep",
            marketplace_id="EBAY_DE",
            listing_mode=EbayListing.ListingMode.LEGACY,
            item_id="205926392508",
            status=EbayListing.ListingStatus.ENDED,
        )

        result = execute_listing_operation(
            account="dep",
            marketplace_id="EBAY_DE",
            operation="relist",
            listing_mode="legacy",
            item_id="205926392508",
        )

        self.assertEqual(result["item_id"], "new-item-id")
        listing = EbayListing.objects.get(account="dep", marketplace_id="EBAY_DE", item_id="new-item-id")
        self.assertEqual(listing.status, EbayListing.ListingStatus.ACTIVE)

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_inventory_offer_update_reads_current_offer_before_full_replace(self, client_class):
        client = client_class.return_value
        EbayListing.objects.create(
            account="dep",
            marketplace_id="EBAY_DE",
            listing_mode=EbayListing.ListingMode.INVENTORY,
            sku="4062292372025",
            offer_id="offer-1",
            merchant_location_key="dep-main",
        )
        client.offer.return_value = {
            "offerId": "offer-1",
            "listing": {"listingId": "listing-1"},
            "sku": "4062292372025",
            "marketplaceId": "EBAY_DE",
            "merchantLocationKey": "dep-main",
            "listingPolicies": {"paymentPolicyId": "payment-1", "returnPolicyId": "return-1"},
        }

        execute_listing_operation(
            account="dep",
            marketplace_id="EBAY_DE",
            operation="update",
            listing_mode="inventory",
            sku="4062292372025",
            offer={"merchantLocationKey": "dep-secondary", "listingPolicies": {"fulfillmentPolicyId": "fulfillment-1"}},
        )

        client.update_offer.assert_called_once_with(
            account="dep",
            offer_id="offer-1",
            offer={
                "sku": "4062292372025",
                "marketplaceId": "EBAY_DE",
                "merchantLocationKey": "dep-secondary",
                "listingPolicies": {
                    "paymentPolicyId": "payment-1",
                    "returnPolicyId": "return-1",
                    "fulfillmentPolicyId": "fulfillment-1",
                },
            },
        )
        self.assertEqual(EbayListing.objects.get(account="dep", marketplace_id="EBAY_DE", sku="4062292372025").merchant_location_key, "dep-secondary")

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_update_updates_single_variation_by_sku(self, client_class):
        client = client_class.return_value
        client.listing.return_value = {
            "listing_type": "FixedPriceItem",
            "has_variations": True,
            "variations": [{"sku": "yellow", "quantity": "5", "quantity_sold": "2", "price": "199.99", "currency": "EUR"}],
        }

        execute_listing_operation(
            account="dep",
            marketplace_id="EBAY_DE",
            operation="update",
            listing_mode="legacy",
            item_id="205926392508",
            variation_sku="yellow",
            quantity=2,
        )

        client.revise_legacy_fixed_price_variation.assert_called_once_with(
            account="dep",
            item_id="205926392508",
            marketplace_id="EBAY_DE",
            variation_sku="yellow",
            quantity=2,
            price="199.99",
            currency="EUR",
        )
        client.revise_legacy_fixed_price_listing.assert_not_called()

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_legacy_variation_update_requires_sku(self, client_class):
        client_class.return_value.listing.return_value = {"listing_type": "FixedPriceItem", "has_variations": True, "variations": []}

        with self.assertRaises(EbayApiError) as raised:
            execute_listing_operation(
                account="dep",
                marketplace_id="EBAY_DE",
                operation="update",
                listing_mode="legacy",
                item_id="205926392508",
                quantity=2,
            )

        self.assertEqual(raised.exception.status_code, 400)

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_reconciled_legacy_ean_resolves_item_id_for_update(self, client_class):
        client = client_class.return_value
        client.active_listings.return_value = {
            "total_pages": "1",
            "listings": [{"item_id": "205926392508", "identifiers": {"EAN": ["4062292372025"]}}],
        }
        client.listing.return_value = {"listing_type": "FixedPriceItem", "has_variations": False}

        reconciled = reconcile_legacy_listing(
            account="dep",
            marketplace_id="EBAY_DE",
            source_ean="4062292372025",
            page=1,
            limit=100,
        )
        updated = execute_listing_operation(
            account="dep",
            marketplace_id="EBAY_DE",
            operation="update",
            listing_mode="legacy",
            source_ean="4062292372025",
            quantity=2,
        )

        self.assertEqual(reconciled["item_id"], "205926392508")
        self.assertEqual(updated["item_id"], "205926392508")
        client.revise_legacy_fixed_price_listing.assert_called_once()

    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_fetches_inventory_item_and_offers(self, client_class):
        client = client_class.return_value
        client.inventory_item.return_value = {"sku": "4062292372025"}
        client.offers_by_sku.return_value = [{"offerId": "offer-1"}]

        result = execute_listing_operation(
            account="dep",
            marketplace_id="EBAY_DE",
            operation="fetch",
            listing_mode="inventory",
            sku="4062292372025",
        )

        self.assertEqual(result["inventory_item"]["sku"], "4062292372025")
        self.assertEqual(result["offers"], [{"offerId": "offer-1"}])
