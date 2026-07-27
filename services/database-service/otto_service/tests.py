from django.test import SimpleTestCase
from django.urls import Resolver404, resolve

from .external_requests import OttoExternalAPIError, OttoExternalProductsClient


class FakeResponse:
    def __init__(self, *, payload, ok=True, status_code=200):
        self._payload = payload
        self.ok = ok
        self.status_code = status_code

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def get(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.response


class OttoRouteTests(SimpleTestCase):
    def test_profile_routes_are_registered(self):
        self.assertEqual(
            resolve("/api/v1/otto/jv/products/").url_name,
            "otto-products-list-v1",
        )
        self.assertEqual(
            resolve("/api/v1/otto/xl/products/42/").url_name,
            "otto-products-detail-v1",
        )
        self.assertEqual(
            resolve("/api/v1/otto/jv/products/upsert/").url_name,
            "otto-products-upsert-v1",
        )
        self.assertEqual(
            resolve("/api/v1/otto/xl/products/by-sku/4062292015700/").url_name,
            "otto-products-fetch-by-sku-v1",
        )
        self.assertEqual(
            resolve("/api/v1/otto/categories/").url_name,
            "otto-categories-v1",
        )
        self.assertEqual(
            resolve("/api/v1/otto/attributes/").url_name,
            "otto-category-attributes-v1",
        )

    def test_legacy_default_jv_routes_are_not_registered(self):
        for path in (
            "/api/v1/otto/products/",
            "/api/v1/otto/products/42/",
            "/api/v1/otto/products/upsert/",
        ):
            with self.assertRaises(Resolver404):
                resolve(path)


class OttoExternalProductsClientTests(SimpleTestCase):
    def test_fetch_products_uses_external_contract(self):
        session = FakeSession(
            FakeResponse(
                payload={
                    "productVariations": [{"productReference": "4062292015700"}],
                    "links": [],
                }
            )
        )
        client = OttoExternalProductsClient(
            session=session,
            base_url="https://otto.example.test",
            connect_timeout=2,
            read_timeout=5,
        )

        payload = client.fetch_products(sku="4062292015700", controller="jv", page=0, limit=10)

        self.assertEqual(payload["productVariations"][0]["productReference"], "4062292015700")
        self.assertEqual(session.calls[0][0], ("https://otto.example.test/extermal/get_products",))
        self.assertEqual(
            session.calls[0][1]["params"],
            {"sku": "4062292015700", "page": 0, "limit": 10, "controller": "jv"},
        )
        self.assertEqual(session.calls[0][1]["timeout"], (2, 5))

    def test_fetch_products_rejects_missing_variations(self):
        client = OttoExternalProductsClient(
            session=FakeSession(FakeResponse(payload={"items": []})),
            base_url="https://otto.example.test",
        )

        with self.assertRaises(OttoExternalAPIError):
            client.fetch_products(sku="4062292015700", controller="jv", page=0, limit=10)

    def test_fetch_categories_uses_external_contract(self):
        session = FakeSession(
            FakeResponse(payload={"categories": [{"id": 25922, "name": "1,5-Sitzer"}]})
        )
        client = OttoExternalProductsClient(
            session=session,
            base_url="https://otto.example.test",
            connect_timeout=2,
            read_timeout=5,
        )

        payload = client.fetch_categories(page=0, limit=10, category="sofa")

        self.assertEqual(payload["categories"][0]["id"], 25922)
        self.assertEqual(session.calls[0][0], ("https://otto.example.test/extermal/categories",))
        self.assertEqual(session.calls[0][1]["params"], {"page": 0, "limit": 10, "category": "sofa"})
        self.assertEqual(session.calls[0][1]["timeout"], (2, 5))

    def test_fetch_attributes_uses_external_contract(self):
        session = FakeSession(
            FakeResponse(payload={"attributes": [{"attributeId": 1, "name": "Farbe"}]})
        )
        client = OttoExternalProductsClient(
            session=session,
            base_url="https://otto.example.test",
            connect_timeout=2,
            read_timeout=5,
        )

        payload = client.fetch_attributes(category_id="23593")

        self.assertEqual(payload["attributes"][0]["attributeId"], 1)
        self.assertEqual(session.calls[0][0], ("https://otto.example.test/extermal/attributes",))
        self.assertEqual(session.calls[0][1]["params"], {"categoryId": "23593"})
        self.assertEqual(session.calls[0][1]["timeout"], (2, 5))
