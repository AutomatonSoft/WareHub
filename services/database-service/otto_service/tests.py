import asyncio
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from django.urls import Resolver404, resolve
from django.test.client import RequestFactory

from .external_requests import OttoExternalAPIError, OttoExternalProductsClient
from .image_resolver import (
    OttoImageResolver,
    is_allowed_otto_image_url,
    is_allowed_otto_product_url,
    resolve_cached_or_otto_image,
)
from .models import OttoProductJV
from .product_mapper import build_otto_url
from .serializers import OttoProductJVSerializer, OttoProductPayloadSerializer
from .full_cache_sync import OttoFullCacheSyncService, OttoFullCacheSyncSettings
from .views import OttoCategoriesAPIView, OttoFullCacheSyncAPIView


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

    def post(self, *args, **kwargs):
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
            resolve("/api/v1/otto/categories/full-sync/").url_name,
            "otto-categories-full-sync-v1",
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


class OttoCategoriesQueryTests(SimpleTestCase):
    def test_searches_categories_with_a_bounded_limit(self):
        view = OttoCategoriesAPIView()
        request = view.initialize_request(RequestFactory().get("/api/v1/otto/categories/?q=Stuhl&limit=500"))

        with patch("otto_service.views.OttoCategoryCache") as cache_class:
            cache_class.return_value.search_categories.return_value = [{"id": "26812", "name": "Stuhl"}]

            response = view.get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["categories"], [{"id": "26812", "name": "Stuhl"}])
        cache_class.return_value.search_categories.assert_called_once_with(
            query="Stuhl",
            selected_category_id="",
            limit=50,
        )

    def test_loads_only_the_selected_category_by_id(self):
        view = OttoCategoriesAPIView()
        request = view.initialize_request(RequestFactory().get("/api/v1/otto/categories/?selectedId=26812"))

        with patch("otto_service.views.OttoCategoryCache") as cache_class:
            cache_class.return_value.search_categories.return_value = [{"id": "26812", "name": "Stuhl"}]

            response = view.get(request)

        self.assertEqual(response.status_code, 200)
        cache_class.return_value.search_categories.assert_called_once_with(
            query="",
            selected_category_id="26812",
            limit=50,
        )


class OttoFullCacheSyncTests(SimpleTestCase):
    def test_runs_category_and_attribute_sync_with_progress(self):
        cache = Mock()
        cache.category_ids.return_value = ["1", "2"]
        cache.replace_categories.return_value = 2
        client = Mock()
        client.fetch_all_categories.return_value = [
            {"id": "1", "name": "Chair"},
            {"id": "2", "name": "Table"},
        ]
        client.fetch_attributes.side_effect = [
            {"attributes": [{"attributeId": "color"}]},
            {"attributes": [{"attributeId": "material"}]},
        ]
        service = OttoFullCacheSyncService(
            cache=cache,
            settings=OttoFullCacheSyncSettings(category_page_size=2000, category_max_pages=1000, attribute_workers=1),
        )

        with patch("otto_service.full_cache_sync.OttoExternalProductsClient", return_value=client):
            service.run()

        cache.replace_categories.assert_called_once_with(client.fetch_all_categories.return_value)
        self.assertEqual(cache.store_attributes.call_count, 2)
        cache.update_full_sync.assert_any_call(
            phase="attributes",
            total=2,
            completed=0,
            cached=0,
            failed=0,
            category_count=2,
            message="Refreshing OTTO category attributes.",
        )
        cache.complete_full_sync.assert_called_once_with(
            completed=2,
            cached=2,
            failed=0,
            message="OTTO categories and attributes are up to date.",
        )

    def test_status_endpoint_serializes_running_progress(self):
        view = OttoFullCacheSyncAPIView()
        request = view.initialize_request(RequestFactory().get("/api/v1/otto/categories/full-sync/"))
        service = Mock()
        service.status.return_value = {
            "status": "running",
            "phase": "attributes",
            "total": 100,
            "completed": 42,
            "cached": 41,
            "failed": 1,
        }

        with patch("otto_service.views.get_otto_full_cache_sync_service", return_value=service):
            response = view.get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["progressPercent"], 42.0)
        self.assertEqual(response.data["failed"], 1)


class OttoExternalProductsClientTests(SimpleTestCase):
    def test_payload_serializer_accepts_shipping_profile_id(self):
        serializer = OttoProductPayloadSerializer(data={
            "productReference": "4021234231234",
            "shippingProfileId": "786c6468-3baf-52e0-88b5-13757eb7f873",
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            str(serializer.validated_data["shippingProfileId"]),
            "786c6468-3baf-52e0-88b5-13757eb7f873",
        )

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

    def test_create_or_update_products_uses_external_contract(self):
        session = FakeSession(FakeResponse(payload="updated"))
        client = OttoExternalProductsClient(
            session=session,
            base_url="https://otto.example.test",
            connect_timeout=2,
            read_timeout=5,
        )
        products = [{
            "productReference": "4021234231234",
            "sku": "4021234231234",
            "shippingProfileId": "786c6468-3baf-52e0-88b5-13757eb7f873",
            "productDescription": {"category": "Sessel"},
            "delivery": {"type": "PARCEL", "deliveryTime": 14},
            "order": {"maxOrderQuantity": 1},
            "compliance": {"productSafety": {}},
        }]

        payload = client.create_or_update_products(controller="jv", products=products)

        self.assertEqual(payload, "updated")
        self.assertEqual(session.calls[0][0], ("https://otto.example.test/extermal/create_or_update_product",))
        self.assertEqual(session.calls[0][1]["params"], {"controller": "jv"})
        self.assertEqual(session.calls[0][1]["json"], [{
            "productReference": "4021234231234",
            "sku": "4021234231234",
            "shippingProfileId": "786c6468-3baf-52e0-88b5-13757eb7f873",
            "productDescriprion": {"category": "Sessel"},
            "delivery": {"type": "PARCEL", "deliveryTime": 14},
            "maxOrderQuantity": 1,
            "compliace": {"productSafety": {}},
        }])
        self.assertEqual(session.calls[0][1]["timeout"], (2, 5))

    def test_create_or_update_products_keeps_standard_keys_for_xl(self):
        session = FakeSession(FakeResponse(payload="updated"))
        client = OttoExternalProductsClient(
            session=session,
            base_url="https://otto.example.test",
            connect_timeout=2,
            read_timeout=5,
        )
        products = [{
            "productReference": "4021234231234",
            "productDescription": {"category": "Sessel"},
            "compliance": {"productSafety": {}},
            "order": {"maxOrderQuantity": 1},
        }]

        client.create_or_update_products(controller="xl", products=products)

        self.assertEqual(session.calls[0][1]["json"], [{
            "productReference": "4021234231234",
            "productDescription": {"category": "Sessel"},
            "compliance": {"productSafety": {}},
            "maxOrderQuantity": 1,
        }])

    def test_set_active_state_uses_activate_and_deactivate_contracts(self):
        session = FakeSession(FakeResponse(payload={"success": True, "active": True}))
        client = OttoExternalProductsClient(
            session=session,
            base_url="https://otto.example.test",
            connect_timeout=2,
            read_timeout=5,
        )

        activate_payload = client.set_active_state(ean="4250123456789", controller="jv", active=True)
        deactivate_payload = client.set_active_state(ean="4250123456789", controller="xl", active=False)

        self.assertEqual(activate_payload["active"], True)
        self.assertEqual(deactivate_payload["success"], True)
        self.assertEqual(session.calls[0][0], ("https://otto.example.test/extermal/activate",))
        self.assertEqual(session.calls[0][1]["json"], {"ean": "4250123456789", "controller": "jv"})
        self.assertEqual(session.calls[1][0], ("https://otto.example.test/extermal/deactivate",))
        self.assertEqual(session.calls[1][1]["json"], {"ean": "4250123456789", "controller": "xl"})
        self.assertEqual(session.calls[0][1]["timeout"], (2, 5))


class BuildOttoUrlTests(SimpleTestCase):
    def test_builds_url_for_moin(self):
        self.assertEqual(
            build_otto_url("M0081501JW"),
            "https://www.otto.de/p/?moin=M0081501JW",
        )

    def test_returns_none_for_missing_or_blank_moin(self):
        for moin in (None, "", "   "):
            with self.subTest(moin=moin):
                self.assertIsNone(build_otto_url(moin))

    def test_trims_and_encodes_moin(self):
        self.assertEqual(
            build_otto_url("  MOIN / 1  "),
            "https://www.otto.de/p/?moin=MOIN%20%2F%201",
        )


class OttoImageResolverTests(SimpleTestCase):
    def test_cached_image_is_returned_without_starting_resolver(self):
        resolver = Mock()
        image_url = "https://i.otto.de/i/otto/cached-image"

        result = resolve_cached_or_otto_image(image_url, "https://www.otto.de/p/?moin=M0081501JW", resolver)

        self.assertEqual(result, image_url)
        resolver.resolve.assert_not_called()

    def test_rejects_non_otto_product_and_image_urls(self):
        self.assertFalse(is_allowed_otto_product_url("https://example.com/p/?moin=M0081501JW"))
        self.assertFalse(is_allowed_otto_image_url("https://example.com/image.jpg"))
        self.assertFalse(is_allowed_otto_image_url("http://i.otto.de/image.jpg"))

    def test_reads_og_image_and_falls_back_to_main_image(self):
        class FakePage:
            def __init__(self, values):
                self.values = iter(values)
                self.closed = False

            async def goto(self, *_args, **_kwargs):
                return None

            async def evaluate(self, _script):
                return next(self.values)

            async def close(self):
                self.closed = True

        class FakeBrowser:
            def __init__(self, page):
                self.page = page

            async def new_page(self):
                return self.page

        def resolve_values(values):
            page = FakePage(values)
            resolver = object.__new__(OttoImageResolver)
            resolver._browser = FakeBrowser(page)
            resolver._page_semaphore = asyncio.Semaphore(1)
            return asyncio.run(resolver._resolve_in_browser("https://www.otto.de/p/?moin=M0081501JW")), page

        og_url = "https://i.otto.de/i/otto/og-image"
        self.assertEqual(resolve_values([og_url])[0], og_url)

        fallback_url = "https://i.otto.de/i/otto/main-image"
        result, fallback_page = resolve_values([None, fallback_url])
        self.assertEqual(result, fallback_url)
        self.assertTrue(fallback_page.closed)

    def test_navigation_failure_returns_none(self):
        class FailingPage:
            async def goto(self, *_args, **_kwargs):
                raise RuntimeError("navigation failed")

            async def close(self):
                return None

        class FakeBrowser:
            async def new_page(self):
                return FailingPage()

        resolver = object.__new__(OttoImageResolver)
        resolver._browser = FakeBrowser()
        resolver._page_semaphore = asyncio.Semaphore(1)

        self.assertIsNone(asyncio.run(resolver._resolve_in_browser("https://www.otto.de/p/?moin=M0081501JW")))


class OttoImageResponseSerializerTests(SimpleTestCase):
    def test_exposes_camel_case_image_url_without_internal_storage_field(self):
        product = OttoProductJV(
            product_reference="4069424727661",
            moin="M0081501JW",
            otto_image_url="https://i.otto.de/i/otto/main-image",
        )

        data = OttoProductJVSerializer(product).data

        self.assertEqual(data["imageUrl"], "https://i.otto.de/i/otto/main-image")
        self.assertNotIn("otto_image_url", data)
