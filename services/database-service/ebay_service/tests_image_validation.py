from io import BytesIO
import socket
import time
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from PIL import Image

from .client import EbayApiError
from .image_validation import _image_dimensions, prepare_inventory_images
from .listing_operations import execute_listing_operation


class EbayImageValidationTests(SimpleTestCase):
    @patch("ebay_service.image_validation._image_dimensions")
    def test_filters_small_images_and_duplicates_without_changing_source(self, dimensions):
        dimensions.side_effect = [(492, 330), (500, 100), (100, 500)]
        urls = ["https://images.test/small", "https://images.test/wide", "https://images.test/tall", "https://images.test/wide"]
        original = {"condition": "NEW", "product": {"title": "Chair", "imageUrls": urls}}
        checked, report = prepare_inventory_images(original)
        self.assertEqual(checked["product"]["imageUrls"], urls[1:3])
        self.assertEqual(original["product"]["imageUrls"], urls)
        self.assertEqual(dimensions.call_count, 3)
        self.assertEqual(report["kept_count"], 2)
        self.assertEqual({entry["reason"] for entry in report["removed_images"]}, {"duplicate", "too_small"})

    @patch("ebay_service.image_validation._image_dimensions", return_value=(499, 499))
    def test_no_suitable_images_stops_publication(self, _dimensions):
        with self.assertRaises(EbayApiError) as error:
            prepare_inventory_images({"product": {"imageUrls": ["https://images.test/small"]}})
        self.assertEqual(error.exception.details["kept_count"], 0)
        self.assertEqual(error.exception.operation, "validate_inventory_images")

    @patch("ebay_service.image_validation._image_dimensions")
    def test_invalid_or_excessive_input_does_not_download(self, dimensions):
        for urls in ([], [None], [" "], "not-a-list", [f"https://images.test/{index}" for index in range(25)]):
            with self.subTest(urls=urls), self.assertRaises(EbayApiError):
                prepare_inventory_images({"product": {"imageUrls": urls}})
        dimensions.assert_not_called()

    @patch("ebay_service.image_validation.HTTPSConnectionPool")
    @patch("ebay_service.image_validation.socket.getaddrinfo")
    def test_private_addresses_and_unsafe_urls_never_connect(self, addresses, pool):
        for url in ("http://images.test/photo", "https://user:pass@images.test/photo", "https://images.test:8443/photo"):
            with self.subTest(url=url), self.assertRaises(EbayApiError):
                _image_dimensions(url, deadline=time.monotonic() + 20)
        addresses.assert_not_called()
        for address in ("127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1"):
            addresses.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))]
            with self.subTest(address=address), self.assertRaises(EbayApiError):
                _image_dimensions("https://images.test/photo", deadline=time.monotonic() + 20)
        pool.assert_not_called()

    @patch("ebay_service.image_validation.HTTPSConnectionPool")
    @patch("ebay_service.image_validation.socket.getaddrinfo")
    def test_streams_dimensions_with_pinned_address_verified_tls_and_no_redirects(self, addresses, pool):
        addresses.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))]
        image_bytes = BytesIO()
        Image.new("RGB", (800, 300)).save(image_bytes, format="PNG")
        response = pool.return_value.urlopen.return_value
        response.status = 200
        response.read.return_value = image_bytes.getvalue()
        self.assertEqual(_image_dimensions("https://images.test/photo?v=1", deadline=time.monotonic() + 20), (800, 300))
        self.assertEqual(pool.call_args.args, ("8.8.8.8",))
        self.assertEqual(pool.call_args.kwargs["assert_hostname"], "images.test")
        self.assertEqual(pool.call_args.kwargs["server_hostname"], "images.test")
        self.assertEqual(pool.call_args.kwargs["cert_reqs"], "CERT_REQUIRED")
        request = pool.return_value.urlopen.call_args
        self.assertEqual(request.args, ("GET", "/photo?v=1"))
        self.assertFalse(request.kwargs["redirect"])
        self.assertFalse(request.kwargs["retries"])
        response.close.assert_called_once()
        pool.return_value.close.assert_called_once()

    @patch("ebay_service.image_validation.HTTPSConnectionPool")
    @patch("ebay_service.image_validation.socket.getaddrinfo")
    def test_unavailable_redirect_corrupt_and_expired_images_fail_closed(self, addresses, pool):
        addresses.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))]
        response = pool.return_value.urlopen.return_value
        for status in (301, 404, 503, 200):
            response.status = status
            response.read.side_effect = [b"not an image", b""]
            with self.subTest(status=status), self.assertRaises(EbayApiError):
                _image_dimensions("https://images.test/photo", deadline=time.monotonic() + 20)
        with self.assertRaises(EbayApiError):
            _image_dimensions("https://images.test/photo", deadline=time.monotonic() - 1)


class EbayImagePublicationTests(SimpleTestCase):
    def setUp(self):
        self.original = {"product": {"title": "Chair", "imageUrls": ["https://images.test/small", "https://images.test/good", "https://images.test/good"]}}
        self.listing = SimpleNamespace(offer_id="offer-1", item_id="item-1", merchant_location_key="warehouse", source_ean="4062292011702")
        for target in ("EbayOAuthClient", "EbayListing.objects.filter", "_save_listing", "_validate_inventory_publish_payload", "_validate_inventory_publish_taxonomy"):
            mocked = patch(f"ebay_service.listing_operations.{target}")
            setattr(self, target.split(".")[-1], mocked.start())
            self.addCleanup(mocked.stop)
        self.client = self.EbayOAuthClient.return_value
        self.filter.return_value.first.return_value = self.listing
        self.client.inventory_item.return_value = self.original
        self.client.publish_offer.return_value = {"listingId": "item-1"}
        self._save_listing.side_effect = lambda **kwargs: kwargs["result"]

    def execute(self, operation):
        return execute_listing_operation(
            account="dep", marketplace_id="EBAY_DE", listing_mode="inventory", operation=operation,
            sku="4071489361032", inventory_item=self.original,
            offer={"merchantLocationKey": "warehouse"},
        )

    @patch("ebay_service.image_validation._image_dimensions", side_effect=lambda url, **kwargs: (492, 330) if url.endswith("small") else (800, 600))
    def test_publish_and_relist_send_filtered_images_before_publication(self, _dimensions):
        for operation in ("publish", "relist"):
            with self.subTest(operation=operation):
                self.client.reset_mock()
                result = self.execute(operation)
                uploaded = self.client.create_or_replace_inventory_item.call_args.kwargs["item"]
                self.assertEqual(uploaded["product"]["imageUrls"], ["https://images.test/good"])
                self.assertEqual(result["image_validation"]["kept_count"], 1)
                calls = [entry[0] for entry in self.client.mock_calls]
                self.assertLess(calls.index("create_or_replace_inventory_item"), calls.index("publish_offer"))
        self.assertEqual(len(self.original["product"]["imageUrls"]), 3)

    @patch("ebay_service.image_validation._image_dimensions")
    def test_failed_checks_do_not_write_or_publish(self, dimensions):
        for failure in (EbayApiError("unavailable", status_code=400), None):
            dimensions.side_effect = failure
            dimensions.return_value = (100, 100)
            for operation in ("publish", "relist"):
                with self.subTest(operation=operation, failure=failure), self.assertRaises(EbayApiError):
                    self.execute(operation)
        self.client.create_or_replace_inventory_item.assert_not_called()
        self.client.create_offer.assert_not_called()
        self.client.update_offer.assert_not_called()
        self.client.publish_offer.assert_not_called()
        self._save_listing.assert_not_called()

    @patch("ebay_service.image_validation._image_dimensions", return_value=(800, 600))
    def test_relist_does_not_replace_unchanged_inventory_and_unpublish_does_not_check_images(self, dimensions):
        self.original["product"]["imageUrls"] = ["https://images.test/good"]
        self.execute("relist")
        self.client.create_or_replace_inventory_item.assert_not_called()
        dimensions.reset_mock()
        self.execute("unpublish")
        dimensions.assert_not_called()
        self.client.withdraw_offer.assert_called_once()
