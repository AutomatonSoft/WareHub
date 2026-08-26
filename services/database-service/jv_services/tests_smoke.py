from types import SimpleNamespace
from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase, TestCase
from django.urls import resolve, Resolver404


class JVRoutesSmokeTest(SimpleTestCase):
    def test_jv_sync_route_resolves(self):
        match = resolve('/api/v1/jv/products/sync-by-ean/4071489201321/')
        self.assertIsNotNone(match.func)

    def test_jv_sync_by_artikelnr_route_resolves(self):
        match = resolve('/api/v1/jv/products/sync-by-artikelnr/JVM4071489201321/')
        self.assertIsNotNone(match.func)

    def test_jv_batch_plan_route_resolves(self):
        match = resolve('/api/v1/jv/batch/update-by-ean/4071489201321/plan/')
        self.assertIsNotNone(match.func)

    def test_jv_batch_plan_by_artikelnr_route_resolves(self):
        match = resolve('/api/v1/jv/batch/update-by-artikelnr/JVM4071489201321/plan/')
        self.assertIsNotNone(match.func)

    def test_legacy_xljv_v1_route_does_not_resolve(self):
        with self.assertRaises(Resolver404):
            resolve('/api/v1/xl-jv/products/by-ean/4071489201321/')

    def test_legacy_xljv_route_does_not_resolve(self):
        with self.assertRaises(Resolver404):
            resolve('/api/xl-jv/products/by-ean/4071489201321/')

    def test_jv_batch_job_command_imports(self):
        from jv_services.management.commands.run_jv_batch_job import Command

        self.assertEqual(Command.help, "Run JV batch job by id in worker process.")

    def test_jv_source_db_inspect_command_imports(self):
        from jv_services.management.commands.inspect_jv_source_db import Command

        self.assertIn("Inspect configured JV source DB", Command.help)

    def test_jv_source_client_facade_imports(self):
        from jv_services.source_client import (
            JV_LANGUAGE_ID_BY_CODE,
            create_product_in_source,
            fetch_source_language_id_by_locale,
            fetch_source_product_brief_by_ean,
            fetch_source_product_snapshot_by_ean,
            fetch_source_product_snapshot_by_product_id,
            jv_site_catalog,
            push_product_to_source,
            source_db_config_for_site,
        )

        self.assertEqual(JV_LANGUAGE_ID_BY_CODE["de"], 1)
        self.assertTrue(callable(create_product_in_source))
        self.assertTrue(callable(fetch_source_language_id_by_locale))
        self.assertTrue(callable(fetch_source_product_brief_by_ean))
        self.assertTrue(callable(fetch_source_product_snapshot_by_ean))
        self.assertTrue(callable(fetch_source_product_snapshot_by_product_id))
        self.assertTrue(callable(jv_site_catalog))
        self.assertTrue(callable(push_product_to_source))
        self.assertTrue(callable(source_db_config_for_site))

    def test_jv_source_client_consumers_import(self):
        from jv_services import batch_service, views_batch, views_read, views_write

        self.assertIsNotNone(batch_service)
        self.assertIsNotNone(views_batch)
        self.assertIsNotNone(views_read)
        self.assertIsNotNone(views_write)

    @patch("jv_services.views_read.fetch_source_product_snapshot_by_artikelnr")
    @patch("jv_services.views_read.jv_site_catalog")
    @patch("jv_services.views_read.source_db_config_for_site")
    @patch("database.permissions.SessionRolePermission.has_permission", return_value=True)
    def test_jv_sites_by_ean_discover_uses_artikelnr_lookup_only(
        self,
        _mock_permission,
        mock_source_db_config_for_site,
        mock_jv_site_catalog,
        mock_fetch_source_product_snapshot_by_artikelnr,
    ):
        from jv_services.views_read import JVSitesByEANAPIView

        mock_jv_site_catalog.return_value = [{"site_key": "JV_DE", "domain": "jv.de"}]
        mock_source_db_config_for_site.return_value = {"site_key": "JV_DE"}
        mock_fetch_source_product_snapshot_by_artikelnr.return_value = {
            "product": {
                "product_id": 123,
                "ean": "4260533187876",
                "model": "4260533187876",
                "price": "99.99",
            },
            "descriptions": [{"name": "Test product"}],
            "jv_fields": {"currency_code": "EUR"},
        }

        request = RequestFactory().get("/api/v1/jv/sites/by-ean/4260533187876/")
        response = JVSitesByEANAPIView.as_view()(request, ean="4260533187876")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["found_count"], 1)
        self.assertEqual(response.data["found"][0]["title"], "Test product")
        mock_fetch_source_product_snapshot_by_artikelnr.assert_called_once_with(
            {"site_key": "JV_DE"},
            "4260533187876",
        )

    @patch("jv_services.views_read.fetch_source_product_snapshot_by_artikelnr")
    @patch("jv_services.views_read.build_source_payload", return_value={"ok": True})
    @patch("jv_services.views_read.source_db_config_for_site", return_value={"site_key": "JV_DE"})
    @patch("database.permissions.SessionRolePermission.has_permission", return_value=True)
    def test_jv_product_by_ean_view_uses_artikelnr_lookup(
        self,
        _mock_permission,
        _mock_source_db_config_for_site,
        _mock_build_source_payload,
        mock_fetch_source_product_snapshot_by_artikelnr,
    ):
        from jv_services.views_read import JVProductByEANAPIView

        mock_fetch_source_product_snapshot_by_artikelnr.return_value = {
            "product": {
                "product_id": 123,
                "ean": "4260533187876",
                "model": "4260533187876",
                "price": "99.99",
                "date_modified": None,
            },
            "descriptions": [{"language_id": 1, "name": "Test product", "description": ""}],
            "categories": [],
            "stores": [],
            "images": [],
            "specials": [],
            "jv_fields": {"currency_code": "EUR"},
        }

        request = RequestFactory().get("/api/v1/jv/products/by-ean/4260533187876/", {"site": "JV", "site_key": "JV_DE"})
        response = JVProductByEANAPIView.as_view()(request, ean="4260533187876")

        self.assertEqual(response.status_code, 200)
        mock_fetch_source_product_snapshot_by_artikelnr.assert_called_once_with(
            {"site_key": "JV_DE"},
            "4260533187876",
        )

    def test_jv_source_config_catalog_defaults(self):
        from jv_services.source_config import jv_site_catalog

        rows = jv_site_catalog(lambda value: value)
        self.assertIn({"site_key": "JV_DE", "domain": "jv.de"}, rows)
        self.assertIn({"site_key": "JV_CO_UK", "domain": "jv.co.uk"}, rows)

    def test_jv_source_config_reads_env_credentials(self):
        from jv_services.source_config import source_db_config_for_site

        env = {
            "JV_SOURCE_JV_TEST_DB_HOST": "example.test",
            "JV_SOURCE_JV_TEST_DB_USER": "user",
            "JV_SOURCE_JV_TEST_DB_PASSWORD": "password",
            "JV_SOURCE_JV_TEST_DB_NAME": "database",
            "JV_SOURCE_JV_TEST_DB_PORT": "3307",
            "JV_SOURCE_JV_TEST_DB_PREFIX": "shop_",
        }
        with patch.dict("os.environ", env, clear=False):
            config = source_db_config_for_site("JV", "JV_TEST")

        self.assertEqual(config["host"], "example.test")
        self.assertEqual(config["port"], 3307)
        self.assertEqual(config["table_prefix"], "shop_")
        self.assertEqual(config["site_key"], "JV_TEST")

    def test_jv_source_values_helpers(self):
        from decimal import Decimal
        from datetime import date

        from jv_services.source_values import (
            as_oc_date,
            as_plain_value,
            fetch_jv_lieferzeit_options,
            jv_suchfeld,
            jv_urlkey,
            process_uvp,
            to_float_or_default,
            to_int_or_default,
        )

        self.assertEqual(as_plain_value(Decimal("12.30")), "12.30")
        self.assertEqual(as_oc_date(date(2026, 5, 25)), "2026-05-25")
        self.assertEqual(as_oc_date(None), "0000-00-00")
        self.assertEqual(jv_urlkey(" Luxus Sofa 3+2+1! "), "luxus+sofa+3+2+1")
        self.assertEqual(jv_suchfeld("Name", "<b>HTML</b>", "407"), "Name HTML 407")
        self.assertEqual(to_int_or_default("8", 11), 8)
        self.assertEqual(to_int_or_default("bad", 11), 11)
        self.assertEqual(to_float_or_default("12.5", 0), 12.5)
        self.assertEqual(process_uvp(100), 139)
        self.assertEqual(process_uvp(1000), 1249)
        self.assertEqual(process_uvp(2500), 2949)
        self.assertEqual(process_uvp(6000), 6599)
        self.assertEqual(fetch_jv_lieferzeit_options(None)[11]["label"], "Lieferzeit: 3-6 Wochen")

    def test_jv_source_media_path_helpers(self):
        from jv_services.source_media import normalize_jv_db_image_path, split_jv_image_path

        self.assertEqual(
            normalize_jv_db_image_path("/jvmoebel.de/cosmoshop/default/pix/a/v/photo.png"),
            "cosmoshop/default/pix/a/v/photo.png",
        )
        self.assertEqual(normalize_jv_db_image_path("cosmoshop/default/pix/a/v/photo.png"), "cosmoshop/default/pix/a/v/photo.png")
        self.assertEqual(split_jv_image_path("cosmoshop/default/pix/a/v/photo.PNG"), ("photo", "png"))
        self.assertEqual(split_jv_image_path(""), ("image", "jpg"))

    def test_jv_source_writer_uses_source_ean_field_for_shopartikel_ean(self):
        from types import SimpleNamespace

        from jv_services.source_writer_jv import _source_ean_for_jv_shopartikel

        product = SimpleNamespace(ean="JVM4062292005305", source_ean_field="4062292005305")

        self.assertEqual(_source_ean_for_jv_shopartikel(product), "4062292005305")

    def test_jv_shopmedia_sync_supports_sortierung_schema(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock, call, patch

        from jv_services.source_media import sync_jv_shopmedia

        image_rows = [
            SimpleNamespace(image="cosmoshop/default/pix/a/z/4260533187876/g/extra-1.jpg", sort_order=0),
            SimpleNamespace(image="cosmoshop/default/pix/a/z/4260533187876/g/extra-2.jpg", sort_order=1),
        ]
        product = SimpleNamespace(
            source_model="4260533187876",
            ean="4260533187876",
            image="cosmoshop/default/pix/a/v/main-image.jpg",
            images=SimpleNamespace(all=lambda: SimpleNamespace(order_by=lambda *args: image_rows)),
        )

        cur = MagicMock()
        cur.fetchall.return_value = [
            ("key",),
            ("art",),
            ("typ",),
            ("dateiname",),
            ("endung",),
            ("sortierung",),
            ("timestamp",),
        ]
        cur.fetchone.return_value = {"artikelnr": "4260533187876", "ean": "4260533187876"}

        with patch("jv_services.source_media.table_exists", return_value=True):
            sync_jv_shopmedia(cur, product, artikelid=66969)

        executed_sql = [args[0] for args, _kwargs in cur.execute.call_args_list]
        self.assertTrue(any("DELETE FROM `shopmedia`" in sql for sql in executed_sql))
        self.assertTrue(any("`sortierung`" in sql for sql in executed_sql if "INSERT INTO `shopmedia`" in sql))
        self.assertFalse(any("`order`" in sql for sql in executed_sql if "INSERT INTO `shopmedia`" in sql))
        self.assertEqual(
            len([sql for sql in executed_sql if "INSERT INTO `shopmedia`" in sql]),
            8,
        )
        self.assertIn(
            call("SELECT artikelnr, ean FROM `shopartikel` WHERE artikelid = %s LIMIT 1", (66969,)),
            cur.execute.call_args_list,
        )
        self.assertIn(
            call("DELETE FROM `shopmedia` WHERE `key`=%s AND art='artikel' AND typ IN ('v','n','g','flashzoomer','z','zg')", ("4260533187876",)),
            cur.execute.call_args_list,
        )

    def test_jv_shopmedia_sync_uses_live_artikelnr_key(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock, call, patch

        from jv_services.source_media import sync_jv_shopmedia

        image_rows = [
            SimpleNamespace(image="cosmoshop/default/pix/a/z/4260533187876/g/extra-1.jpg", sort_order=0),
        ]
        product = SimpleNamespace(
            source_model="4260533187876",
            ean="4260533187876",
            image="cosmoshop/default/pix/a/v/main-image.jpg",
            images=SimpleNamespace(all=lambda: SimpleNamespace(order_by=lambda *args: image_rows)),
        )

        cur = MagicMock()
        cur.fetchall.return_value = [
            ("key",),
            ("art",),
            ("typ",),
            ("dateiname",),
            ("endung",),
            ("order",),
            ("timestamp",),
        ]
        cur.fetchone.return_value = {"artikelnr": "4260533187876A", "ean": "4260533187876"}

        with patch("jv_services.source_media.table_exists", return_value=True):
            sync_jv_shopmedia(cur, product, artikelid=66969)

        self.assertIn(
            call("SELECT artikelnr, ean FROM `shopartikel` WHERE artikelid = %s LIMIT 1", (66969,)),
            cur.execute.call_args_list,
        )
        self.assertIn(
            call("DELETE FROM `shopmedia` WHERE `key`=%s AND art='artikel' AND typ IN ('v','n','g','flashzoomer','z','zg')", ("4260533187876A",)),
            cur.execute.call_args_list,
        )

    def test_jv_shopmedia_sync_supports_tuple_shopartikel_row(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock, call, patch

        from jv_services.source_media import sync_jv_shopmedia

        image_rows = [
            SimpleNamespace(image="cosmoshop/default/pix/a/z/4260533187876/g/extra-1.jpg", sort_order=0),
        ]
        product = SimpleNamespace(
            source_model="4260533187876",
            ean="4260533187876",
            image="cosmoshop/default/pix/a/v/main-image.jpg",
            images=SimpleNamespace(all=lambda: SimpleNamespace(order_by=lambda *args: image_rows)),
        )

        cur = MagicMock()
        cur.fetchall.return_value = [
            ("key",),
            ("art",),
            ("typ",),
            ("dateiname",),
            ("endung",),
            ("order",),
            ("timestamp",),
        ]
        cur.fetchone.return_value = ("4260533187876A", "4260533187876")

        with patch("jv_services.source_media.table_exists", return_value=True):
            sync_jv_shopmedia(cur, product, artikelid=66969)

        self.assertIn(
            call("SELECT artikelnr, ean FROM `shopartikel` WHERE artikelid = %s LIMIT 1", (66969,)),
            cur.execute.call_args_list,
        )
        self.assertIn(
            call("DELETE FROM `shopmedia` WHERE `key`=%s AND art='artikel' AND typ IN ('v','n','g','flashzoomer','z','zg')", ("4260533187876A",)),
            cur.execute.call_args_list,
        )

    def test_jv_shopmedia_sync_skips_without_live_key(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock, patch

        from jv_services.source_media import sync_jv_shopmedia

        image_rows = [
            SimpleNamespace(image="cosmoshop/default/pix/a/z/4260533187876/g/extra-1.jpg", sort_order=0),
        ]
        product = SimpleNamespace(
            source_model="4260533187876",
            ean="4260533187876",
            image="cosmoshop/default/pix/a/v/main-image.jpg",
            images=SimpleNamespace(all=lambda: SimpleNamespace(order_by=lambda *args: image_rows)),
        )

        cur = MagicMock()
        cur.fetchall.return_value = [
            ("key",),
            ("art",),
            ("typ",),
            ("dateiname",),
            ("endung",),
            ("order",),
            ("timestamp",),
        ]
        cur.fetchone.return_value = {"artikelnr": "", "ean": ""}

        with patch("jv_services.source_media.table_exists", return_value=True):
            sync_jv_shopmedia(cur, product, artikelid=66969)

        executed_sql = [args[0] for args, _kwargs in cur.execute.call_args_list]
        self.assertFalse(any("DELETE FROM `shopmedia`" in sql for sql in executed_sql))
        self.assertFalse(any("INSERT INTO `shopmedia`" in sql for sql in executed_sql))

    def test_jv_source_category_helpers(self):
        from jv_services.source_categories import extract_main_category_id, normalize_jv_categories

        rows = [
            {"rubid": "10", "priority": 0},
            {"rubid": "11", "priority": 1},
            {"rubid": "11", "priority": 1},
            {"rubid": "bad", "priority": 1},
        ]

        normalized = normalize_jv_categories(rows)
        # Hauptrubrik = smallest priority: rubid 10 (priority 0) is the main category.
        self.assertEqual(
            normalized,
            [
                {"category_id": 10, "main_category": True},
                {"category_id": 11, "main_category": False},
            ],
        )
        self.assertEqual(extract_main_category_id(rows), 10)
        self.assertEqual(extract_main_category_id([{"category_id": "22"}]), 22)
        self.assertEqual(
            normalize_jv_categories(
                [
                    {"category_id": "30", "main_category": "false"},
                    {"category_id": "31", "main_category": "true"},
                ]
            ),
            [
                {"category_id": 30, "main_category": False},
                {"category_id": 31, "main_category": True},
            ],
        )

    def test_jv_ensure_main_category_parses_string_booleans(self):
        from jv_services.batch_payload import ensure_main_category

        self.assertEqual(
            ensure_main_category(
                [
                    {"category_id": "10", "main_category": "false"},
                    {"category_id": "11", "main_category": "true"},
                    {"category_id": "12", "main_category": "false"},
                ],
                template_main_category_id=None,
            ),
            [
                {"category_id": "10", "main_category": False},
                {"category_id": "11", "main_category": True},
                {"category_id": "12", "main_category": False},
            ],
        )

    def test_jv_category_override_helper_reads_reviewed_json(self):
        import json
        import tempfile
        from pathlib import Path
        from unittest.mock import patch

        from jv_services.source_categories import _category_override_target_id, _load_category_mapping_overrides

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "overrides.json"
            path.write_text(
                json.dumps({"JV_DE": {"JV_CO_UK": {"396": 393}}}),
                encoding="utf-8",
            )
            _load_category_mapping_overrides.cache_clear()
            with patch.dict("os.environ", {"JV_CATEGORY_MAPPING_OVERRIDES_PATH": str(path)}):
                self.assertEqual(
                    _category_override_target_id(
                        source_site_key="jv_de",
                        target_site_key="jv_co_uk",
                        source_category_id=396,
                    ),
                    393,
                )
                self.assertIsNone(
                    _category_override_target_id(
                        source_site_key="jv_de",
                        target_site_key="jv_co_uk",
                        source_category_id=999,
                    )
                )
            _load_category_mapping_overrides.cache_clear()

    def test_jv_category_main_override_helper_reads_reviewed_json(self):
        import json
        import tempfile
        from pathlib import Path
        from unittest.mock import patch

        from jv_services.source_reader import _apply_jv_category_main_override, _load_jv_category_main_overrides

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "main_overrides.json"
            path.write_text(json.dumps({"JV_DE": {"4260533187876": 930}}), encoding="utf-8")
            _load_jv_category_main_overrides.cache_clear()
            with patch.dict("os.environ", {"JV_CATEGORY_MAIN_OVERRIDES_PATH": str(path)}):
                self.assertEqual(
                    _apply_jv_category_main_override(
                        [
                            {"category_id": 931, "main_category": True},
                            {"category_id": 930, "main_category": False},
                        ],
                        site_key="JV_DE",
                        ean="4260533187876",
                    ),
                    [
                        {"category_id": 931, "main_category": False},
                        {"category_id": 930, "main_category": True},
                    ],
                )
            _load_jv_category_main_overrides.cache_clear()

    def test_jv_delivery_override_helper_reads_reviewed_json(self):
        import json
        import tempfile
        from pathlib import Path
        from unittest.mock import patch

        from jv_services.source_values import _delivery_override_target_id, _load_delivery_mapping_overrides

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "delivery_overrides.json"
            path.write_text(
                json.dumps({"JV_DE": {"JV_CO_UK": {"11": 7}}}),
                encoding="utf-8",
            )
            _load_delivery_mapping_overrides.cache_clear()
            with patch.dict("os.environ", {"JV_DELIVERY_MAPPING_OVERRIDES_PATH": str(path)}):
                self.assertEqual(
                    _delivery_override_target_id(
                        source_site_key="jv_de",
                        target_site_key="jv_co_uk",
                        source_delivery_id=11,
                    ),
                    7,
                )
                self.assertIsNone(
                    _delivery_override_target_id(
                        source_site_key="jv_de",
                        target_site_key="jv_co_uk",
                        source_delivery_id=999,
                    )
                )
            _load_delivery_mapping_overrides.cache_clear()

    def test_jv_source_reader_first_present_value_preserves_zero(self):
        from jv_services.source_reader import _first_present_value

        self.assertEqual(_first_present_value(0, 11, 12), 0)
        self.assertEqual(_first_present_value("", 11, 12), 11)
        self.assertIsNone(_first_present_value(None, ""))

    def test_jv_batch_serializer_accepts_categories_by_site_key(self):
        from jv_services.serializers import JVBatchPayloadSerializer

        serializer = JVBatchPayloadSerializer(
            data={
                "site_family": "JV",
                "site_keys": ["JV_DE", "JV_AT"],
                "categories_by_site_key": {
                    "jv_de": [{"category_id": "10", "main_category": True}],
                    "JV_AT": [{"category_id": 20, "main_category": False}],
                },
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data["categories_by_site_key"],
            {
                "JV_DE": [{"category_id": 10, "main_category": True}],
                "JV_AT": [{"category_id": 20, "main_category": False}],
            },
        )

    def test_jv_batch_serializer_accepts_jv_fields_by_site_key(self):
        from jv_services.serializers import JVBatchPayloadSerializer

        serializer = JVBatchPayloadSerializer(
            data={
                "site_family": "JV",
                "site_keys": ["JV_DE", "JV_AT"],
                "jv_fields_by_site_key": {
                    "jv_de": {"lieferzeitid": "11"},
                    "JV_AT": {"lieferzeitid": "7", "lieferzeit": "7"},
                },
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data["jv_fields_by_site_key"],
            {
                "JV_DE": {"lieferzeitid": "11"},
                "JV_AT": {"lieferzeitid": "7", "lieferzeit": "7"},
            },
        )

    def test_jv_sync_rubrikartikel_skips_categories_without_rubnum(self):
        from unittest.mock import MagicMock, patch

        from jv_services.source_categories import sync_jv_rubrikartikel

        cur = MagicMock()
        cur.fetchall.return_value = [
            {"rubid": 930, "rubnum": "valid-930"},
            {"rubid": 934, "rubnum": "valid-934"},
        ]

        def fake_table_exists(_cur, table_name):
            return table_name in {"shoprubriken", "shoprubrikartikel"}

        def fake_has_column(_cur, table_name, column_name):
            if table_name == "shoprubrikartikel":
                return column_name in {"artikelid", "rubid", "rubnum", "priority", "ordnum"}
            return False

        with patch("jv_services.source_categories.table_exists", side_effect=fake_table_exists), patch(
            "jv_services.source_categories.table_has_column",
            side_effect=fake_has_column,
        ):
            sync_jv_rubrikartikel(
                cur,
                66969,
                [
                    {"category_id": 930, "main_category": False},
                    {"category_id": 931, "main_category": False},
                    {"category_id": 932, "main_category": False},
                    {"category_id": 933, "main_category": False},
                    {"category_id": 934, "main_category": True},
                ],
            )

        insert_calls = [
            call_args
            for call_args in cur.execute.call_args_list
            if "INSERT INTO `shoprubrikartikel`" in call_args.args[0]
        ]
        self.assertEqual(len(insert_calls), 2)
        # Main category (934) is written first with priority 0 (Hauptrubrik = smallest priority).
        self.assertEqual(insert_calls[0].args[1], (66969, 934, "valid-934", 1, 0))
        self.assertEqual(insert_calls[1].args[1], (66969, 930, "valid-930", 2, 1))

    def test_jv_batch_payload_helpers(self):
        from jv_services.batch_payload import ensure_main_category, extract_scalar_updates

        payload = {
            "price": "100",
            "images": [{"image": "not-scalar.jpg"}],
            "status": 1,
        }
        self.assertEqual(extract_scalar_updates(payload), {"price": "100", "status": 1})
        self.assertEqual(
            ensure_main_category(
                [
                    {"category_id": 10, "main_category": False},
                    {"category_id": 11, "main_category": False},
                ],
                11,
            ),
            [
                {"category_id": 10, "main_category": False},
                {"category_id": 11, "main_category": True},
            ],
        )

    def test_jv_batch_defaults(self):
        from jv_services.batch_defaults import (
            DEFAULT_CURRENCY_BY_SITE_KEY,
            DEFAULT_LANGUAGE_ID_BY_LOCALE,
            DEFAULT_LOCALE_BY_SITE_KEY,
            TRANSLATABLE_FIELDS,
        )

        self.assertEqual(DEFAULT_LOCALE_BY_SITE_KEY["JV_CO_UK"], "en")
        self.assertEqual(DEFAULT_CURRENCY_BY_SITE_KEY["JV_CO_UK"], "GBP")
        self.assertEqual(DEFAULT_LANGUAGE_ID_BY_LOCALE["de"], 1)
        self.assertIn("meta_title", TRANSLATABLE_FIELDS)

    def test_jv_batch_precompute_helpers_import(self):
        from jv_services.batch_service import build_batch_plan, build_job_precompute_context, save_job_precompute_context

        self.assertTrue(callable(build_job_precompute_context))
        self.assertTrue(callable(save_job_precompute_context))
        self.assertTrue(callable(build_batch_plan))

    @patch("jv_services.batch_service._extract_translation_source_from_snapshot", return_value={"description": "desc"})
    @patch("jv_services.batch_service._language_map_for_site", return_value={"de": 1})
    @patch("jv_services.batch_service.fetch_source_product_snapshot_by_artikelnr")
    @patch("jv_services.batch_service.source_db_config_for_site", return_value={"site_key": "JV_DE"})
    @patch("jv_services.batch_service._sites_for_family", return_value=[{"site": "JV", "site_key": "JV_DE", "domain": "jv.de"}])
    def test_jv_batch_precompute_uses_artikelnr_lookup(
        self,
        _mock_sites_for_family,
        _mock_source_db_config_for_site,
        mock_fetch_source_product_snapshot_by_artikelnr,
        _mock_language_map_for_site,
        _mock_extract_translation_source_from_snapshot,
    ):
        from jv_services.batch_service import build_job_precompute_context

        mock_fetch_source_product_snapshot_by_artikelnr.return_value = {
            "product": {"product_id": 123, "ean": "4071489201321", "model": "4071489201321"},
            "descriptions": [{"name": "Test"}],
            "jv_fields": {"currency_code": "EUR"},
        }

        build_job_precompute_context(
            ean="4071489201321",
            payload={"translate_texts": True, "site_keys": ["JV_DE"]},
        )

        mock_fetch_source_product_snapshot_by_artikelnr.assert_called_once_with(
            {"site_key": "JV_DE"},
            "4071489201321",
        )

    @patch("jv_services.views_write.finalize_error")
    @patch("jv_services.views_write.claim_idempotency_or_response")
    @patch("jv_services.views_write._request_body_for_hash", return_value={})
    @patch("jv_services.views_write.fetch_source_product_snapshot_by_artikelnr")
    @patch("jv_services.views_write.source_db_config_for_site", return_value={"site_key": "JV_DE"})
    def test_jv_sync_by_ean_view_uses_artikelnr_lookup(
        self,
        _mock_source_db_config_for_site,
        mock_fetch_source_product_snapshot_by_artikelnr,
        _mock_request_body_for_hash,
        mock_claim_idempotency_or_response,
        _mock_finalize_error,
    ):
        from jv_services.views_write import JVProductCreateByEANAPIView
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory

        mock_claim_idempotency_or_response.return_value = (object(), None)
        mock_fetch_source_product_snapshot_by_artikelnr.return_value = None

        raw_request = APIRequestFactory().post(
            "/api/v1/jv/products/sync-by-ean/4071489201321/",
            data={},
            format="json",
        )
        raw_request.GET = raw_request.GET.copy()
        raw_request.GET["site"] = "JV"
        raw_request.GET["site_key"] = "JV_DE"
        request = Request(raw_request)
        response = JVProductCreateByEANAPIView().post.__wrapped__(JVProductCreateByEANAPIView(), request, ean="4071489201321")

        self.assertEqual(response.status_code, 404)
        mock_fetch_source_product_snapshot_by_artikelnr.assert_called_once_with(
            {"site_key": "JV_DE"},
            "4071489201321",
        )

    @patch("jv_services.batch_service._language_map_for_site", return_value={"de": 1})
    @patch("jv_services.batch_service.fetch_source_product_snapshot_by_artikelnr")
    @patch("jv_services.batch_service.source_db_config_for_site", return_value={"site_key": "JV_DE"})
    def test_jv_batch_plan_uses_artikelnr_lookup(
        self,
        _mock_source_db_config_for_site,
        mock_fetch_source_product_snapshot_by_artikelnr,
        _mock_language_map_for_site,
    ):
        from jv_services.batch_service import build_batch_plan

        mock_fetch_source_product_snapshot_by_artikelnr.return_value = {
            "product": {
                "product_id": 123,
                "ean": "4071489201321",
                "model": "4071489201321",
                "price": "99.99",
            },
            "descriptions": [{"name": "Test product"}],
            "jv_fields": {"currency_code": "EUR"},
        }

        plan = build_batch_plan(
            ean="4071489201321",
            payload={"site_keys": ["JV_DE"]},
            precomputed={
                "selected_site_keys": ["JV_DE"],
                "candidate_rows": [{"site": "JV", "site_key": "JV_DE", "domain": "jv.de"}],
            },
        )

        self.assertEqual(len(plan), 1)
        self.assertEqual(plan[0]["status"], "pending")
        self.assertEqual(plan[0]["details"]["source_model"], "4071489201321")
        mock_fetch_source_product_snapshot_by_artikelnr.assert_called_once_with(
            {"site_key": "JV_DE"},
            "4071489201321",
        )

    def test_jv_batch_translation_helpers_import(self):
        from jv_services.batch_translation import (
            _build_multilang_descriptions_for_site,
            _build_translated_descriptions,
            _detect_language_from_texts,
            _extract_translation_source_from_snapshot,
            _language_map_for_site,
            _translate_jv_content_row,
        )

        self.assertTrue(callable(_build_multilang_descriptions_for_site))
        self.assertTrue(callable(_build_translated_descriptions))
        self.assertTrue(callable(_detect_language_from_texts))
        self.assertTrue(callable(_extract_translation_source_from_snapshot))
        self.assertTrue(callable(_language_map_for_site))
        self.assertTrue(callable(_translate_jv_content_row))

    def test_jv_batch_item_status_helpers_import(self):
        from jv_services.batch_item_status import (
            finalize_batch_job,
            mark_item_applied,
            mark_item_failed,
            mark_item_skipped,
            new_batch_summary,
        )

        self.assertTrue(callable(finalize_batch_job))
        self.assertTrue(callable(mark_item_applied))
        self.assertTrue(callable(mark_item_failed))
        self.assertTrue(callable(mark_item_skipped))
        self.assertEqual(
            new_batch_summary(),
            {
                "total": 0,
                "applied": 0,
                "failed": 0,
                "skipped": 0,
                "translation_used_sites": 0,
                "translation_error_sites": 0,
            },
        )

    def test_jv_views_write_children_helpers_import(self):
        from jv_services.views_write_children import (
            bulk_create_categories,
            bulk_create_descriptions,
            bulk_create_images,
            bulk_create_specials,
            bulk_create_stores,
            create_payload_children,
            normalize_images_model,
            normalize_images_payload,
            record_ean_usage,
        )

        self.assertTrue(callable(bulk_create_categories))
        self.assertTrue(callable(bulk_create_descriptions))
        self.assertTrue(callable(bulk_create_images))
        self.assertTrue(callable(bulk_create_specials))
        self.assertTrue(callable(bulk_create_stores))
        self.assertTrue(callable(create_payload_children))
        self.assertTrue(callable(normalize_images_model))
        self.assertTrue(callable(normalize_images_payload))
        self.assertTrue(callable(record_ean_usage))
        self.assertEqual(
            normalize_images_payload(
                [
                    {"image": " a.jpg ", "sort_order": "2"},
                    {"image": ""},
                    "bad",
                ]
            ),
            [("a.jpg", 2)],
        )

    def test_jv_views_idempotency_helper_import(self):
        from jv_services.views_idempotency import claim_idempotency_or_response

        self.assertTrue(callable(claim_idempotency_or_response))

    def test_jv_views_write_products_helpers_import(self):
        from jv_services.views_write_products import (
            create_local_product_from_payload,
            create_local_product_from_source,
            update_local_product_from_source,
        )

        self.assertTrue(callable(create_local_product_from_payload))
        self.assertTrue(callable(create_local_product_from_source))
        self.assertTrue(callable(update_local_product_from_source))

    def test_jv_views_push_state_helpers_import(self):
        from jv_services.views_push_state import (
            FULL_PUSH_RELATIONS,
            FULL_PUSH_SCALAR_FIELDS,
            mark_push_failed,
            mark_push_pending,
            mark_push_pushed,
        )

        self.assertIn("price", FULL_PUSH_SCALAR_FIELDS)
        self.assertIn("descriptions", FULL_PUSH_RELATIONS)
        self.assertTrue(callable(mark_push_failed))
        self.assertTrue(callable(mark_push_pending))
        self.assertTrue(callable(mark_push_pushed))

    def test_jv_views_create_prepare_helper_import(self):
        from jv_services.views_create_prepare import prepare_create_identity

        self.assertTrue(callable(prepare_create_identity))


class JVBatchQueueingTest(TestCase):
    @patch("jv_services.create_service.close_old_connections")
    @patch("jv_services.create_service.create_and_push_jv_product")
    def test_create_conflict_marks_item_failed_without_updating_existing_product(
        self,
        mock_create_and_push,
        _mock_close_old_connections,
    ):
        from rest_framework.response import Response

        from jv_services.create_service import _create_one_item, enqueue_create_job
        from jv_services.models import JVBatchJobItem

        job = enqueue_create_job(
            request=SimpleNamespace(session={}),
            ean="JVM4067282644571",
            name="Test product",
            sites=[
                {
                    "site": "JV",
                    "site_key": "JV_DE",
                    "domain": "https://www.jvmoebel.de",
                    "payload": {"ean": "JVM4067282644571", "source_model": "JVM4067282644571"},
                }
            ],
        )
        item = job.items.get()
        mock_create_and_push.return_value = Response(
            {
                "code": "jv_create_artikelnr_conflict",
                "detail": "Article number already exists.",
            },
            status=409,
        )

        summary = _create_one_item(
            job_id=job.id,
            item_id=item.id,
            ean=job.ean,
            actor="test-user",
        )

        item.refresh_from_db()
        self.assertEqual(item.status, JVBatchJobItem.Status.FAILED)
        self.assertEqual(item.error_code, "jv_create_artikelnr_conflict")
        self.assertEqual(summary["failed"], 1)

    @patch("jv_services.batch_service.normalize_job_items_for_payload")
    @patch("jv_services.batch_service.build_batch_plan")
    @patch("jv_services.batch_service.save_job_precompute_context")
    @patch("jv_services.batch_service.build_job_precompute_context")
    def test_deferred_job_creation_does_not_build_plan_in_request(
        self,
        mock_build_precompute,
        mock_save_precompute,
        mock_build_plan,
        mock_normalize,
    ):
        from jv_services.batch_service import create_job_with_plan
        from jv_services.models import JVBatchJob

        job = create_job_with_plan(
            request=SimpleNamespace(session={}),
            ean="JVM4067282644571",
            site_family="JV",
            payload={"site_keys": ["JV_DE", "JV_AT", "JV_CH", "JV_CO_UK"]},
            idempotency_key="request-id",
            build_plan_now=False,
        )

        self.assertEqual(job.status, JVBatchJob.Status.PENDING)
        self.assertEqual(job.items.count(), 0)
        mock_build_precompute.assert_not_called()
        mock_save_precompute.assert_not_called()
        mock_build_plan.assert_not_called()
        mock_normalize.assert_not_called()

    @patch("jv_services.management.commands.run_jv_batch_job.close_old_connections")
    @patch("jv_services.management.commands.run_jv_batch_job.apply_batch")
    @patch("jv_services.management.commands.run_jv_batch_job.update_job_progress")
    @patch("jv_services.management.commands.run_jv_batch_job.normalize_job_items_for_payload")
    @patch("jv_services.management.commands.run_jv_batch_job.save_job_precompute_context")
    @patch("jv_services.management.commands.run_jv_batch_job.build_batch_plan")
    @patch("jv_services.management.commands.run_jv_batch_job.build_job_precompute_context")
    def test_worker_builds_plan_for_deferred_job(
        self,
        mock_build_precompute,
        mock_build_plan,
        _mock_save_precompute,
        _mock_normalize,
        _mock_update_progress,
        mock_apply_batch,
        _mock_close_old_connections,
    ):
        from jv_services.management.commands.run_jv_batch_job import Command
        from jv_services.models import JVBatchJob, JVBatchJobItem

        job = JVBatchJob.objects.create(
            ean="JVM4067282644571",
            site_family="JV",
            status=JVBatchJob.Status.PENDING,
            request_payload={"site_keys": ["JV_DE"]},
        )
        mock_build_precompute.return_value = {"selected_site_keys": ["JV_DE"]}
        mock_build_plan.return_value = [
            {
                "site": "JV",
                "site_key": "JV_DE",
                "domain": "https://www.jvmoebel.de",
                "status": JVBatchJobItem.Status.PENDING,
                "effective_ean": job.ean,
                "details": {},
            }
        ]
        mock_apply_batch.return_value = {"total": 1, "applied": 1, "failed": 0, "skipped": 0}

        Command().handle(job_id=job.id, already_claimed=False)

        mock_build_precompute.assert_called_once_with(ean=job.ean, payload=job.request_payload)
        mock_build_plan.assert_called_once_with(
            ean=job.ean,
            payload=job.request_payload,
            precomputed=mock_build_precompute.return_value,
        )
        self.assertTrue(job.items.filter(site_key="JV_DE").exists())
        mock_apply_batch.assert_called_once()


class JVSyncUtilsTest(TestCase):
    def test_resolve_local_product_for_source_matches_by_artikelnr_before_ean(self):
        from jv_services.models import ImportedProduct
        from jv_services.sync_utils import resolve_local_product_for_source

        product = ImportedProduct.all_objects.create(
            site="JV",
            site_key="JV_DE",
            ean="legacy-ean-value",
            source_model="4260174428871A",
            source_product_id=86313,
        )

        resolved, conflict = resolve_local_product_for_source(
            site="JV",
            site_key="JV_DE",
            source_product_id=86313,
            effective_ean="different-ean-value",
            source_model="4260174428871A",
        )

        self.assertEqual(resolved.id, product.id)
        self.assertIsNone(conflict)
