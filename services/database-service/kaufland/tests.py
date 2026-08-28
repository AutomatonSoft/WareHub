from unittest.mock import Mock, patch

import requests
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from kaufland.external_requests import create_product_by_ean, set_product_active_state
from kaufland.serializers import KauflandCreateByEANSerializer
from kaufland.views import (
    ActivateProductByEANAPIView,
    CreateProductByEANAPIView,
    DeactivateProductByEANAPIView,
    GetProductAPIView,
)


class KauflandProductActiveStateApiTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch("kaufland.views.set_product_active_state")
    def test_deactivate_forwards_ean_and_jv_controller(self, mock_set_product_active_state):
        mock_set_product_active_state.return_value = {"status": "deactivated"}
        request = self.factory.post("/", {"controller": "jv"}, format="json")

        response = DeactivateProductByEANAPIView.as_view()(request, ean="4062292028939")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "deactivated"})
        mock_set_product_active_state.assert_called_once_with(
            ean="4062292028939",
            controller="jv",
            active=False,
        )

    @patch("kaufland.views.set_product_active_state")
    def test_activate_forwards_ean_and_xl_controller(self, mock_set_product_active_state):
        mock_set_product_active_state.return_value = {"status": "activated"}
        request = self.factory.post("/", {"controller": "xl"}, format="json")

        response = ActivateProductByEANAPIView.as_view()(request, ean="4062292028939")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "activated"})
        mock_set_product_active_state.assert_called_once_with(
            ean="4062292028939",
            controller="xl",
            active=True,
        )

    def test_rejects_unknown_controller(self):
        request = self.factory.post("/", {"controller": "de"}, format="json")

        response = DeactivateProductByEANAPIView.as_view()(request, ean="4062292028939")

        self.assertEqual(response.status_code, 400)
        self.assertIn("controller", response.data)


class KauflandProductActiveStateClientTests(SimpleTestCase):
    @patch("kaufland.external_requests.requests.put")
    def test_client_uses_put_upload_endpoint_to_create_product(self, mock_put):
        response = Mock()
        response.json.return_value = {"status": "created"}
        mock_put.return_value = response
        payload = {"ean": "4062292276706", "controller": "jv", "title": "Test"}

        result = create_product_by_ean(payload)

        self.assertEqual(result, {"status": "created"})
        mock_put.assert_called_once_with(
            "https://kl.automatonsoft.de/api/products/upload/",
            json=payload,
            timeout=45,
        )

    @patch("kaufland.external_requests.requests.delete")
    def test_client_deletes_controller_to_deactivate_endpoint(self, mock_delete):
        response = Mock()
        response.json.return_value = {"status": "deactivated"}
        mock_delete.return_value = response

        result = set_product_active_state(
            ean="4062292028939",
            controller="jv",
            active=False,
        )

        self.assertEqual(result, {"status": "deactivated"})
        mock_delete.assert_called_once_with(
            "https://kl.automatonsoft.de/api/products/deactivate/4062292028939",
            json={"controller": "jv"},
            timeout=45,
        )

    @patch("kaufland.external_requests.requests.post")
    def test_client_posts_controller_to_activate_endpoint(self, mock_post):
        response = Mock()
        response.json.return_value = {"status": "activated"}
        mock_post.return_value = response

        result = set_product_active_state(
            ean="4062292028939",
            controller="xl",
            active=True,
        )

        self.assertEqual(result, {"status": "activated"})
        mock_post.assert_called_once_with(
            "https://kl.automatonsoft.de/api/products/activate/4062292028939",
            json={"controller": "xl"},
            timeout=45,
        )


class KauflandCreateSerializerTests(SimpleTestCase):
    def test_keeps_product_fields_for_external_upload(self):
        payload = {
            "ean": "4062292276706",
            "controller": "jv",
            "title": "Test cabinet",
            "description": "Test description",
            "picture": ["https://example.test/product.jpg"],
            "price": "900.50",
            "size": "120 x 40 cm",
            "color": "Black",
            "material": "Wood",
            "delivery": 14,
            "height": "100",
            "length": "120",
            "width": "40",
        }

        serializer = KauflandCreateByEANSerializer(data=payload)

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["ean"], payload["ean"])
        self.assertEqual(serializer.validated_data["controller"], payload["controller"])
        self.assertEqual(serializer.validated_data["picture"], payload["picture"])
        self.assertEqual(serializer.validated_data["price"], "900.5")
        self.assertEqual(serializer.validated_data["amount"], 20)
        self.assertEqual(serializer.validated_data["id_offer"], payload["ean"])
        self.assertEqual(
            serializer.validated_data["storefronts"],
            ["de", "cz", "sk", "pl", "at", "fr", "it"],
        )


class KauflandCreateApiTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch("kaufland.views.create_product_by_ean")
    def test_forwards_new_create_contract_with_defaults(self, mock_create_product_by_ean):
        mock_create_product_by_ean.return_value = {"status": "created"}
        request = self.factory.post(
            "/",
            {
                "ean": "4062292276706",
                "controller": "jv",
                "title": "Test cabinet",
                "description": "Test description",
                "picture_urls": ["https://example.test/product.jpg"],
                "price": "900.50",
                "size": "120 x 40 cm",
                "color": "Black",
                "material": "Wood",
                "delivery": 14,
                "height": 100,
                "length": 120,
                "width": 40,
            },
            format="json",
        )

        response = CreateProductByEANAPIView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "created"})
        mock_create_product_by_ean.assert_called_once_with(
            {
                "ean": "4062292276706",
                "controller": "jv",
                "title": "Test cabinet",
                "description": "Test description",
                "picture_urls": ["https://example.test/product.jpg"],
                "price": "900.5",
                "size": "120 x 40 cm",
                "color": "Black",
                "material": "Wood",
                "delivery": 14,
                "height": "100",
                "length": "120",
                "width": "40",
                "amount": 20,
                "id_offer": "4062292276706",
                "storefronts": ["de", "cz", "sk", "pl", "at", "fr", "it"],
            }
        )

    @patch("kaufland.views.create_product_by_ean")
    def test_omits_empty_image_array_when_picture_is_provided(self, mock_create_product_by_ean):
        mock_create_product_by_ean.return_value = {"status": "created"}
        request = self.factory.post(
            "/",
            {
                "ean": "4062292276706",
                "controller": "jv",
                "title": "Test cabinet",
                "description": "Test description",
                "picture": ["https://example.test/product.jpg"],
                "picture_urls": [],
                "price": "900.50",
                "size": "120 x 40 cm",
                "color": "Black",
                "material": "Wood",
                "delivery": 14,
                "height": 100,
                "length": 120,
                "width": 40,
            },
            format="json",
        )

        response = CreateProductByEANAPIView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        payload = mock_create_product_by_ean.call_args.args[0]
        self.assertEqual(payload["picture"], ["https://example.test/product.jpg"])
        self.assertNotIn("picture_urls", payload)


class KauflandProductLookupApiTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch("kaufland.views.product_inside")
    def test_normalizes_known_missing_product_500_to_not_found(self, mock_product_inside):
        upstream_response = Mock(status_code=500)
        upstream_response.json.return_value = {
            "detail": "AttributeError at /api/products/product/ean/: "
            "&#x27;NoneType&#x27; object has no attribute &#x27;get&#x27;"
        }
        mock_product_inside.side_effect = requests.HTTPError(response=upstream_response)
        request = self.factory.get("/")

        response = GetProductAPIView.as_view()(request, ean="4062292276706", site="jv")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error"], "kaufland_product_not_found")

    @patch("kaufland.views.product_inside")
    def test_normalizes_none_iterable_lookup_500_to_not_found(self, mock_product_inside):
        upstream_response = Mock(status_code=500)
        upstream_response.json.return_value = {
            "detail": "TypeError at /api/products/product/ean/: "
            "&#x27;NoneType&#x27; object is not iterable"
        }
        mock_product_inside.side_effect = requests.HTTPError(response=upstream_response)
        request = self.factory.get("/")

        response = GetProductAPIView.as_view()(request, ean="4062292276706", site="jv")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error"], "kaufland_product_not_found")

    @patch("kaufland.views.product_inside")
    def test_preserves_unrelated_upstream_500_error(self, mock_product_inside):
        upstream_response = Mock(status_code=500)
        upstream_response.json.return_value = {"detail": "Kaufland service unavailable"}
        mock_product_inside.side_effect = requests.HTTPError(response=upstream_response)
        request = self.factory.get("/")

        response = GetProductAPIView.as_view()(request, ean="4062292276706", site="jv")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["error"], "kaufland_lookup_failed")
