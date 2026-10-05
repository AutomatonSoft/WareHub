from contextlib import ExitStack, nullcontext
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

from django.test import SimpleTestCase

from .ean_marker import record_xl_ean_marker
from .views_write import XLProductCreateAndPushAPIView


class XLEanMarkerTests(SimpleTestCase):
    def record(self, reserved=(), main=(), site_key="XLMOEBEL_DE", active=True, failure=False):
        product = SimpleNamespace(pk=1, site="XL", site_key=site_key, ean="4071489360790", status=active)
        queryset = MagicMock()
        queryset.order_by.return_value.__getitem__.side_effect = [list(reserved), list(main)]
        with patch("xl_services.ean_marker.Ean.objects") as eans, patch("xl_services.ean_marker.EanStatus.objects") as statuses, patch("xl_services.ean_marker.transaction.atomic", return_value=nullcontext()):
            rows = eans.select_for_update.return_value
            rows.filter.return_value = queryset
            if failure:
                statuses.update_or_create.side_effect = RuntimeError("write failed")
            warnings = record_xl_ean_marker(product)
        return rows, statuses, warnings

    def test_reserved_ean_preserves_main_eans_and_other_marketplaces(self):
        row = SimpleNamespace(kid_id=1614, xl=None, main_ean_jv="4067282464896", main_ean_xl="OLD", jv="JVM_OTHER", save=Mock())
        rows, statuses, warnings = self.record([row])
        rows.filter.assert_called_once_with(reserved_xl="4071489360790")
        self.assertEqual(row.xl, "4071489360790")
        self.assertEqual((row.main_ean_jv, row.main_ean_xl, row.jv), ("4067282464896", "OLD", "JVM_OTHER"))
        row.save.assert_called_once_with(update_fields=["xl"])
        statuses.update_or_create.assert_called_once_with(ean_id=1614, defaults={"xl": True})
        self.assertEqual(warnings, [])

    def test_main_ean_fallback_and_idempotent_country_repeats(self):
        for site_key in ("XLMOEBEL_DE", "XLMOEBEL_CH", "XLMOEBEL_AT"):
            with self.subTest(site_key=site_key):
                row = SimpleNamespace(kid_id=1614, xl="4071489360790", save=Mock())
                rows, statuses, warnings = self.record(main=[row], site_key=site_key)
                self.assertEqual(rows.filter.call_count, 2)
                row.save.assert_not_called()
                statuses.update_or_create.assert_called_once()
                self.assertEqual(warnings, [])

    def test_missing_or_ambiguous_identity_is_not_written(self):
        for reserved, main in (([], []), ([Mock(), Mock()], []), ([], [Mock(), Mock()])):
            _, statuses, warnings = self.record(reserved, main)
            statuses.update_or_create.assert_not_called()
            self.assertEqual(warnings, ["xl_ean_marker_identity_unresolved"])
            for row in reserved + main:
                row.save.assert_not_called()

    def test_conflicting_mapping_is_preserved(self):
        row = SimpleNamespace(kid_id=1614, xl="OTHER", save=Mock())
        _, statuses, warnings = self.record([row])
        row.save.assert_not_called()
        statuses.update_or_create.assert_not_called()
        self.assertEqual(row.xl, "OTHER")
        self.assertEqual(warnings, ["xl_ean_marker_mapping_conflict"])

    def test_update_uses_actual_product_status(self):
        row = SimpleNamespace(kid_id=1614, xl="4071489360790", save=Mock())
        _, statuses, _ = self.record([row], active=False)
        statuses.update_or_create.assert_called_once_with(ean_id=1614, defaults={"xl": False})

    def test_mapping_failure_is_reported_without_retrying_publication(self):
        row = SimpleNamespace(kid_id=1614, xl="4071489360790", save=Mock())
        _, _, warnings = self.record([row], failure=True)
        self.assertEqual(warnings, ["xl_ean_marker_write_failed"])

    def test_create_records_mapping_only_after_successful_source_push(self):
        for push_failed in (False, True):
            with self.subTest(push_failed=push_failed), ExitStack() as stack:
                product = SimpleNamespace(pk=1, id=1, refresh_from_db=Mock())
                payload = {"ean": "4071489360790", "source_product_id": 99, "status": True}
                mocks = {}
                for name in ("_force_xl_site", "source_db_config_for_xl", "_localized_xl_create_payload", "ImportedProductCreateSerializer", "ImportedProductDetailSerializer", "ImportedProduct", "ImportedProductStore", "EANPool", "fetch_xl_product_snapshot_by_product_id", "push_xl_product_to_source", "record_xl_ean_marker"):
                    mocks[name] = stack.enter_context(patch(f"xl_services.views_write.{name}"))
                mocks["ImportedProductCreateSerializer"].return_value.validated_data = payload
                mocks["_localized_xl_create_payload"].return_value = payload
                mocks["ImportedProduct"].all_objects.filter.return_value.first.return_value = None
                mocks["ImportedProduct"].objects.create.return_value = product
                mocks["EANPool"].objects.filter.return_value.first.return_value = None
                mocks["ImportedProductDetailSerializer"].return_value.data = {}
                mocks["record_xl_ean_marker"].return_value = []
                if push_failed:
                    mocks["push_xl_product_to_source"].side_effect = RuntimeError("push failed")
                request = SimpleNamespace(query_params={"site_key": "XLMOEBEL_DE"}, data=payload, session={})
                response = XLProductCreateAndPushAPIView.post.__wrapped__(XLProductCreateAndPushAPIView(), request)
                if push_failed:
                    self.assertEqual(response.status_code, 502)
                    mocks["record_xl_ean_marker"].assert_not_called()
                else:
                    self.assertEqual(response.status_code, 201)
                    mocks["push_xl_product_to_source"].assert_called_once()
                    mocks["record_xl_ean_marker"].assert_called_once_with(product)
                    self.assertEqual(response.data["warnings"], [])
