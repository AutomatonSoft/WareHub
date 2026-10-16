from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory
from unittest.mock import patch

from .client import EbayApiError
from .content_validation import validate_inventory_descriptions


class EbayContentValidationTests(SimpleTestCase):
    def test_rejects_blank_markup_styles_scripts_and_truncated_template(self):
        for description in (None, "", "  ", "<p>&nbsp;</p>", "<img src='photo.jpg'>", "<!-- Product -->", "<style>body { color: red; }</style>", "<script>product()</script>", "<!DOCTYPE html><link rel='stylesheet'><style>.text { margin-left: auto;", "<head><title>Template</title></head>"):
            with self.subTest(description=description), self.assertRaises(EbayApiError) as error:
                validate_inventory_descriptions({"product": {"description": description}})
            self.assertEqual(error.exception.status_code, 400)
            self.assertIn("description", error.exception.details["field_errors"])

    def test_accepts_plain_text_and_html_with_actual_text(self):
        for description in ("Wooden chair", "<p>Holz &amp; Glas</p>", "<style>p { color: red }</style><p>Kommode 220 cm</p>", "<div>Стул</div>", "a" * 4000):
            with self.subTest(description=description):
                validate_inventory_descriptions({"product": {"description": description}})

    def test_rejects_inventory_description_over_limit(self):
        with self.assertRaises(EbayApiError):
            validate_inventory_descriptions({"product": {"description": "a" * 4001}})

    def test_override_is_checked_without_applying_inventory_length_limit(self):
        validate_inventory_descriptions(offer={"listingDescription": "a" * 4001})
        validate_inventory_descriptions(offer={})
        with self.assertRaises(EbayApiError):
            validate_inventory_descriptions(offer={"listingDescription": "<style>body{}</style>"})

    @patch("ebay_service.views.EbayOAuthClient")
    def test_direct_write_endpoints_cannot_bypass_description_check(self, client):
        from .views import EbayInventoryItemAPIView, EbayOfferAPIView
        for view, payload in (
            (EbayInventoryItemAPIView, {"account": "dep", "sku": "example", "item": {"product": {"description": "<style>body{}"}}}),
            (EbayOfferAPIView, {"account": "dep", "offer": {"listingDescription": "<style>body{}"}}),
        ):
            with self.subTest(view=view.__name__):
                request = APIRequestFactory().post("/", payload, format="json")
                request.session = {"role": "admin"}
                response = view.as_view()(request)
                self.assertEqual(response.status_code, 400)
                self.assertIn("description", response.data["details"]["field_errors"])
        client.assert_not_called()
