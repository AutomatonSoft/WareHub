from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, call, patch

from django.test import SimpleTestCase

from .create_service import _record_jv_ean_marker


class JVEanMarkerTests(SimpleTestCase):
    def record(self, reserved, main=()):
        item = SimpleNamespace(id=1, site='JV', site_key='JV_DE', source_product_id=490071, effective_ean='JVM4071489360790')
        queryset = MagicMock()
        queryset.order_by.return_value.__getitem__.side_effect = [list(reserved), list(main)]
        with patch('jv_services.create_service.ImportedProduct.all_objects') as products, patch('database.models.Ean.objects') as eans, patch('database.models.EanStatus.objects') as statuses, patch('jv_services.create_service.transaction.atomic', return_value=nullcontext()):
            products.filter.return_value.filter.return_value.order_by.return_value.first.return_value = SimpleNamespace(source_model='JVM4071489360790')
            rows = eans.select_for_update.return_value
            rows.filter.return_value = queryset
            _record_jv_ean_marker(item)
        return rows, statuses

    def test_new_reserved_ean_maps_without_replacing_main_ean(self):
        row = SimpleNamespace(kid_id=1632, jv=None, main_ean_jv='4062292293528', reserved_jv='4071489360790', save=Mock())
        rows, statuses = self.record([row])
        rows.filter.assert_called_once_with(reserved_jv='4071489360790')
        self.assertEqual(row.jv, 'JVM4071489360790')
        self.assertEqual(row.main_ean_jv, '4062292293528')
        row.save.assert_called_once_with(update_fields=['jv'])
        statuses.update_or_create.assert_called_once_with(ean_id=1632, defaults={'jv': True})

    def test_legacy_main_ean_fallback_and_idempotent_repeat(self):
        row = SimpleNamespace(kid_id=1632, jv='JVM4071489360790', save=Mock())
        rows, statuses = self.record([], [row])
        self.assertEqual(rows.filter.call_args_list, [call(reserved_jv='4071489360790'), call(main_ean_jv='4071489360790')])
        row.save.assert_not_called()
        statuses.update_or_create.assert_called_once_with(ean_id=1632, defaults={'jv': True})

    def test_ambiguous_reserved_identity_never_falls_back_or_writes(self):
        records = [SimpleNamespace(kid_id=identifier, jv=None, save=Mock()) for identifier in [1, 2]]
        rows, statuses = self.record(records)
        rows.filter.assert_called_once_with(reserved_jv='4071489360790')
        statuses.update_or_create.assert_not_called()
        for row in records:
            row.save.assert_not_called()

    def test_missing_identity_or_conflicting_mapping_does_not_mark_active(self):
        _, statuses = self.record([])
        statuses.update_or_create.assert_not_called()
        row = SimpleNamespace(kid_id=1632, jv='JVM_OTHER', save=Mock())
        _, statuses = self.record([row])
        self.assertEqual(row.jv, 'JVM_OTHER')
        row.save.assert_not_called()
        statuses.update_or_create.assert_not_called()
