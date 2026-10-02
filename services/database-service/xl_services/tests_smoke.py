import os
from decimal import Decimal

from django.test import SimpleTestCase, override_settings
from django.urls import resolve, Resolver404
from rest_framework.test import APIClient, APIRequestFactory
from unittest.mock import patch

from .batch_service import build_batch_plan
from .batch_translation import detect_language_from_texts
from .models import ImportedProduct
from .serializers import XLBatchPayloadSerializer
from .source_client import fetch_xl_product_brief_by_ean, fetch_xl_product_snapshot_by_ean
from .views_read import XLProductByEANAPIView, XLSitesByEANAPIView
from .views_write import _localized_xl_create_payload
from .source_config import source_db_config_for_xl, xl_site_catalog


class XLRoutesSmokeTest(SimpleTestCase):
    @patch.dict(os.environ, {"XL_SOURCE_XL_DB_HOST": "db", "XL_SOURCE_XL_DB_USER": "user", "XL_SOURCE_XL_DB_PASSWORD": "test", "XL_SOURCE_XL_DB_NAME": "de"}, clear=True)
    def test_ch_at_never_use_generic_de_database(self):
        self.assertIsNotNone(source_db_config_for_xl(site_key="XLMOEBEL_DE"))
        self.assertIsNone(source_db_config_for_xl(site_key="XLMOEBEL_CH"))
        self.assertIsNone(source_db_config_for_xl(site_key="XLMOEBEL_AT"))
        self.assertEqual(len(xl_site_catalog()), 3)

    @patch("xl_services.views_write.convert_xl_amount", return_value="95.0000")
    def test_ch_create_uses_server_currency_conversion(self, convert):
        payload = _localized_xl_create_payload(payload={"price": "100"}, controls={"convert_currency": True, "source_currency": "EUR"}, site_key="XLMOEBEL_CH", db_config=None)
        self.assertEqual(payload["price"], "95.0000")
        convert.assert_called_once_with(amount="100", from_currency="EUR", to_currency="CHF")

    @patch("xl_services.batch_service._convert_amount", side_effect=lambda **kwargs: kwargs["amount"] * (Decimal("0.95") if kwargs["to_currency"] == "CHF" else 1))
    @patch("xl_services.batch_service._language_map_for_site", return_value={"de": 1})
    @patch("xl_services.batch_service.fetch_source_product_brief_by_ean", return_value={"product_id": 1, "price": "80", "currency_code": "EUR", "ean": "4062292011702"})
    @patch("xl_services.batch_service.source_db_config_for_site", return_value={"configured": True})
    def test_batch_keeps_categories_delivery_and_currency_per_site(self, *_mocks):
        keys = ["XLMOEBEL_DE", "XLMOEBEL_CH", "XLMOEBEL_AT"]
        payload = {
            "site_keys": keys, "template_site_key": keys[0], "source_currency": "EUR", "price": "100", "convert_currency": True,
            "categories_by_site_key": {key: [{"category_id": index + 10, "main_category": True}] for index, key in enumerate(keys)},
            "manufacturer_id_by_site_key": {key: index + 20 for index, key in enumerate(keys)},
        }
        serializer = XLBatchPayloadSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        plan = build_batch_plan(ean="4062292011702", site_family="XL", payload=serializer.validated_data)
        self.assertEqual(len(plan), 3)
        for index, item in enumerate(plan):
            self.assertEqual(item["details"]["categories"][0]["category_id"], index + 10)
            self.assertEqual(item["details"]["scalar_updates"]["manufacturer_id"], index + 20)
            self.assertEqual(item["currency_code"], "CHF" if item["site_key"] == "XLMOEBEL_CH" else "EUR")
            self.assertEqual(item["details"]["scalar_updates"]["price"], Decimal("95") if item["site_key"] == "XLMOEBEL_CH" else Decimal("100"))

    def test_batch_rejects_other_family_category_ids(self):
        serializer = XLBatchPayloadSerializer(data={"categories_by_site_key": {"JV_DE": [{"category_id": 1}]}})
        self.assertFalse(serializer.is_valid())

    def test_xl_sync_route_resolves(self):
        match = resolve('/api/v1/xl/products/sync-by-ean/4071489201321/')
        self.assertIsNotNone(match.func)

    def test_xl_batch_plan_route_resolves(self):
        match = resolve('/api/v1/xl/batch/update-by-ean/4071489201321/plan/')
        self.assertIsNotNone(match.func)

    def test_legacy_xljv_v1_route_does_not_resolve(self):
        with self.assertRaises(Resolver404):
            resolve('/api/v1/xl-jv/products/by-ean/4071489201321/')

    def test_legacy_xljv_route_does_not_resolve(self):
        with self.assertRaises(Resolver404):
            resolve('/api/xl-jv/products/by-ean/4071489201321/')

    @override_settings(DEBUG=True)
    @patch.dict(os.environ, {"DEV_ALLOW_ALL": "true"}, clear=False)
    @patch("xl_services.views_rubrics.source_db_config_for_xl")
    @patch("xl_services.views_rubrics.fetch_xl_language_id_by_locale", return_value={"de": 1})
    @patch("xl_services.views_rubrics.mysql.connector.connect")
    def test_xl_rubrics_tree_reads_open_cart_categories(self, mock_connect, _mock_language_map, mock_db_config):
        mock_db_config.return_value = {
            "host": "db",
            "user": "user",
            "password": "pass",
            "database": "name",
            "port": 3306,
            "table_prefix": "oc_",
        }

        class FakeCursor:
            def __init__(self):
                self.last_query = ""

            def execute(self, query, params=None):
                self.last_query = str(query)

            def fetchone(self):
                if "SHOW TABLES LIKE" in self.last_query:
                    return {"table": "ok"}
                if "SHOW COLUMNS" in self.last_query:
                    return {"Field": "status"}
                return None

            def fetchall(self):
                return [
                    {"category_id": 10, "parent_id": 0, "sort_order": 1, "name": "Sofas &amp; Couchen"},
                    {"category_id": 11, "parent_id": 10, "sort_order": 2, "name": "Ecksofas"},
                ]

            def close(self):
                pass

        class FakeConnection:
            def cursor(self, dictionary=False):
                return FakeCursor()

            def close(self):
                pass

        mock_connect.return_value = FakeConnection()

        response = APIClient().get("/api/v1/xl/rubrics/tree/?site=XL&site_key=XLMOEBEL_DE&language=de")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["items"][0]["name"], "Sofas & Couchen")
        self.assertEqual(response.data["tree"][0]["children"][0]["category_id"], 11)

    @override_settings(DEBUG=True)
    @patch.dict(os.environ, {"DEV_ALLOW_ALL": "true"}, clear=False)
    @patch("xl_services.views_read.fetch_xl_product_brief_by_ean", return_value={"product_id": 55, "ean": "4260533187876", "price": "10.00", "currency_code": "EUR", "title": "XL DE product"})
    @patch("xl_services.views_read.source_db_config_for_xl", return_value={"configured": True})
    def test_xl_sites_by_ean_checks_de_ch_at(self, _mock_db_config, _mock_fetch):
        factory = APIRequestFactory()
        request = factory.get("/api/v1/xl/sites/by-ean/4260533187876/", {"site": "XL"})
        response = XLSitesByEANAPIView.as_view()(request, ean="4260533187876")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["found_count"], 3)
        self.assertEqual(response.data["missing_count"], 0)
        self.assertEqual({row["site_key"] for row in response.data["found"]}, {"XLMOEBEL_DE", "XLMOEBEL_CH", "XLMOEBEL_AT"})

    @override_settings(DEBUG=True)
    @patch.dict(os.environ, {"DEV_ALLOW_ALL": "true"}, clear=False)
    def test_xl_product_by_ean_rejects_non_de_site_key(self):
        factory = APIRequestFactory()
        request = factory.get("/api/v1/xl/products/by-ean/4260533187876/", {"site": "XL", "site_key": "JV_CO_UK"})
        response = XLProductByEANAPIView.as_view()(request, ean="4260533187876")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["site_key"], "JV_CO_UK")


class XLBatchImageBySiteKeyTest(SimpleTestCase):
    def test_detect_language_returns_ru_for_cyrillic_translation_source(self):
        detected = detect_language_from_texts(source_fields={"name": "Былый шкаф из Италии"})

        self.assertEqual(detected, "ru")

    def test_serializer_accepts_image_by_site_key(self):
        serializer = XLBatchPayloadSerializer(data={
            "site_family": ImportedProduct.Site.XL,
            "site_keys": ["XLMOEBEL_DE"],
            "image_by_site_key": {"XLMOEBEL_DE": "https://img.example/de.jpg"},
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data["image_by_site_key"]["XLMOEBEL_DE"],
            "https://img.example/de.jpg",
        )

    @patch("xl_services.views_write.safe_translate_fields")
    def test_create_payload_translation_and_currency_controls_apply_per_site(self, mock_translate):
        mock_translate.return_value = (
            {
                "name": "White wardrobe",
                "description": "White wardrobe from Italy",
                "tag": "4071489201499",
                "meta_title": "White wardrobe",
                "meta_description": "White wardrobe",
                "meta_keyword": "wardrobe",
            },
            True,
            [],
        )

        payload = _localized_xl_create_payload(
            payload={
                "price": "100.0000",
                "descriptions": [
                    {
                        "language_id": 1,
                        "name": "Былый шкаф из Италии",
                        "description": "Былый шкаф из Италии",
                        "tag": "4071489201499",
                        "meta_title": "Былый шкаф",
                        "meta_description": "Былый шкаф",
                        "meta_keyword": "шкаф",
                    }
                ],
            },
            controls={
                "translate_texts": True,
                "translation_source_language": "auto",
                "convert_currency": True,
                "source_currency": "EUR",
                "currency_by_site_key": {"XLMOEBEL_DE": "EUR"},
            },
            site_key="XLMOEBEL_DE",
            db_config=None,
        )

        self.assertEqual([row["language_id"] for row in payload["descriptions"]], [1, 2])
        self.assertEqual(payload["descriptions"][0]["name"], "White wardrobe")
        self.assertEqual(payload["descriptions"][1]["name"], "White wardrobe")
        self.assertEqual(str(payload["price"]).split(".")[0], "100")
        mock_translate.assert_called_once()

    @patch("xl_services.batch_service._language_map_for_site", return_value={"de": 1})
    @patch("xl_services.batch_service.fetch_source_product_brief_by_ean")
    @patch("xl_services.batch_service.source_db_config_for_site", return_value={"configured": True})
    @patch("xl_services.batch_service._sites_for_family")
    def test_batch_plan_uses_site_specific_main_image(
        self,
        mock_sites_for_family,
        mock_source_db_config_for_site,
        mock_fetch_source_product_brief_by_ean,
        _mock_language_map_for_site,
    ):
        mock_sites_for_family.return_value = [
            {"site": ImportedProduct.Site.XL, "site_key": "XLMOEBEL_DE", "domain": "xlmoebel.de"},
        ]
        mock_fetch_source_product_brief_by_ean.return_value = {
            "product_id": 123,
            "price": "100.0000",
            "currency_code": "EUR",
            "title": "Source title",
        }

        plan = build_batch_plan(
            ean="4071489201321",
            site_family=ImportedProduct.Site.XL,
            payload={
                "site_keys": ["XLMOEBEL_DE"],
                "image_by_site_key": {
                    "XLMOEBEL_DE": "https://img.example/de.jpg",
                },
            },
        )

        image_by_site = {
            item["site_key"]: item["details"]["scalar_updates"]["image"]
            for item in plan
        }
        self.assertEqual(image_by_site["XLMOEBEL_DE"], "https://img.example/de.jpg")
        self.assertEqual(mock_source_db_config_for_site.call_count, 1)


class XLSourceLookupConsistencyTest(SimpleTestCase):
    @patch("xl_services.source_client._fetch_oc_snapshot_by_product_id")
    @patch("xl_services.source_client._table_exists", return_value=True)
    @patch("xl_services.source_client.mysql.connector.connect")
    def test_snapshot_lookup_reuses_same_product_match_as_brief(
        self,
        mock_connect,
        _mock_table_exists,
        mock_fetch_snapshot,
    ):
        class FakeCursor:
            def __init__(self):
                self.last_query = ""
                self.last_params = None

            def execute(self, query, params=None):
                self.last_query = str(query)
                self.last_params = params

            def fetchone(self):
                if "FROM `oc_product`" in self.last_query:
                    return {
                        "product_id": 321,
                        "ean": "4260484863980",
                        "model": "4260484863980",
                        "price": "199.9900",
                    }
                if "FROM `oc_product_description`" in self.last_query:
                    return {"name": "XL source title"}
                if "FROM `oc_setting`" in self.last_query:
                    return {"value": "EUR"}
                return None

            def close(self):
                pass

        class FakeConnection:
            def cursor(self, dictionary=False):
                return FakeCursor()

            def close(self):
                pass

        mock_connect.return_value = FakeConnection()
        mock_fetch_snapshot.return_value = {"product": {"product_id": 321}}
        db_config = {
            "host": "db",
            "user": "user",
            "password": "pass",
            "database": "name",
            "port": 3306,
            "table_prefix": "oc_",
        }

        brief = fetch_xl_product_brief_by_ean(db_config, "4260484863980")
        snapshot = fetch_xl_product_snapshot_by_ean(db_config, "4260484863980")

        self.assertEqual(brief["product_id"], 321)
        self.assertEqual(brief["title"], "XL source title")
        self.assertEqual(snapshot, {"product": {"product_id": 321}})
        mock_fetch_snapshot.assert_called_once()
        self.assertEqual(mock_fetch_snapshot.call_args.kwargs["product_id"], 321)
