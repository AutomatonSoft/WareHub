from unittest.mock import patch

from django.test import SimpleTestCase

from database.inventory_service import load_kid_ean_map


class LoadKidEanMapTests(SimpleTestCase):
    def test_missing_optional_alias_returns_empty_map_without_warning(self):
        with patch("database.inventory_service.settings") as mocked_settings:
            mocked_settings.DATABASES = {"default": {}}

            with patch("database.inventory_service.connections") as mocked_connections:
                with patch("database.inventory_service.logger.warning") as mocked_warning:
                    result = load_kid_ean_map()

        self.assertEqual(result, {})
        mocked_connections.__getitem__.assert_not_called()
        mocked_warning.assert_not_called()

    def test_configured_but_broken_alias_still_logs_warning(self):
        with patch("database.inventory_service.settings") as mocked_settings:
            mocked_settings.DATABASES = {
                "default": {},
                "ean_map": {},
            }

            with patch("database.inventory_service.connections") as mocked_connections:
                mocked_connections.__getitem__.side_effect = RuntimeError(
                    "configured EAN map connection failed"
                )

                with patch("database.inventory_service.logger.warning") as mocked_warning:
                    result = load_kid_ean_map()

        self.assertEqual(result, {})
        mocked_warning.assert_called_once_with(
            "INVENTORY_EAN_MAP_LOAD_FAILED code=inventory_ean_map_load_failed",
            exc_info=True,
        )
