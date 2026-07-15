from unittest.mock import Mock, patch

import requests
from django.test import TestCase
from rest_framework import status

from .external_requests import get_by_ean
from .serializers import KauflandChangeByEANSerializer, KauflandCreateByEANSerializer


class KauflandExternalRequestTests(TestCase):
    @patch("kaufland.external_requests.requests.get")
    def test_lookup_uses_kl_automatonsoft_domain(self, mocked_get):
        mocked_get.return_value.json.return_value = {"ean": "4260174428871"}
        mocked_get.return_value.raise_for_status.return_value = None

        get_by_ean("4260174428871", "jv")

        mocked_get.assert_called_once_with(
            "https://kl.automatonsoft.de/api/products/product/ean/",
            params={"ean": "4260174428871", "controller": "jv"},
            timeout=30,
        )

    def test_create_and_change_accept_full_discover_payload_fields(self):
        payload = {
            "ean": "4067282598409",
            "controller": "jv",
            "category": ["schubladenschraenke"],
            "title": "Kommode",
            "mpn": "JVM4067282598409",
            "short_description": ["Kommode", "Luxus"],
            "description": "<p>Beschreibung</p>",
            "picture": ["https://example.test/product.jpg"],
            "manufacturer": "AEA GmbH & Co. KG",
            "product_dimensions": "148 x 49 x 96 cm",
            "colour": "Mehrfarbig",
            "length": "148 cm",
            "width": "49 cm",
            "height": "96 cm",
            "material": "Holz, Glas",
            "storefront": "de",
            "product_safety_contact": [{"name": "AEA GmbH & Co. KG"}],
            "category_detail": [{"id": 6141, "name": "schubladenschraenke"}],
            "material_composition": "No information required",
            "abnehmbarer_bezug": "No",
            "parts_of_animal_origin": "No",
            "price": 19980900,
            "unit_id": 387979008279,
        }

        create_serializer = KauflandCreateByEANSerializer(data=payload)
        change_serializer = KauflandChangeByEANSerializer(data={**payload, "changed_fields": ["title", "category_detail"]})

        self.assertTrue(create_serializer.is_valid(), create_serializer.errors)
        self.assertTrue(change_serializer.is_valid(), change_serializer.errors)


class GetProductAPIViewTests(TestCase):
    @patch("kaufland.views.product_inside")
    def test_returns_upstream_http_error_without_masking_it_as_internal_error(self, mocked_product_inside):
        upstream_response = Mock(status_code=404)
        upstream_response.json.return_value = {"detail": "Product not found"}
        mocked_product_inside.side_effect = requests.HTTPError(response=upstream_response)

        response = self.client.get("/api/v1/kaufland/4260174428871/jv/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["error"], "kaufland_lookup_failed")
        self.assertEqual(response.data["detail"], {"detail": "Product not found"})

    @patch("kaufland.views.product_inside")
    def test_returns_gateway_error_for_transport_failure(self, mocked_product_inside):
        mocked_product_inside.side_effect = requests.ConnectionError("upstream unavailable")

        response = self.client.get("/api/v1/kaufland/4260174428871/jv/")

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data["error"], "kaufland_lookup_transport_error")
