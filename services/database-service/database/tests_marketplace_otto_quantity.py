from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from database.marketplace_deactivate_service import _apply_otto_active_state
from otto_service.external_requests import OttoExternalAPIError


class OttoActivationQuantityTests(SimpleTestCase):
    @patch("database.marketplace_deactivate_service.OttoExternalProductsClient")
    def test_zero_quantity_is_updated_before_activation(self, client_class):
        client = client_class.return_value
        client.fetch_products.return_value = {
            "productVariations": [{"sku": "4062292990991", "productReference": "ref", "quantity": 0}]
        }
        client.create_or_update_products.return_value = {"success": True}
        client.set_active_state.return_value = {"success": True}
        sequence = Mock()
        sequence.attach_mock(client.create_or_update_products, "update")
        sequence.attach_mock(client.set_active_state, "activate")

        result = _apply_otto_active_state(
            ean="4062292990991", site_key="OTTO_XL", controller="xl", inactive=False
        )

        self.assertTrue(result["ok"])
        client.create_or_update_products.assert_called_once_with(
            controller="xl",
            products=[{"sku": "4062292990991", "productReference": "ref", "quantity": 1}],
        )
        client.set_active_state.assert_called_once_with(
            ean="4062292990991", controller="xl", active=True
        )
        self.assertEqual([entry[0] for entry in sequence.mock_calls], ["update", "activate"])

    @patch("database.marketplace_deactivate_service.OttoExternalProductsClient")
    def test_positive_quantity_does_not_update(self, client_class):
        client = client_class.return_value
        client.fetch_products.return_value = {
            "productVariations": [{"sku": "4062292990991", "quantity": 2}]
        }

        result = _apply_otto_active_state(
            ean="4062292990991", site_key="OTTO_JV", controller="jv", inactive=False
        )

        self.assertTrue(result["ok"])
        client.create_or_update_products.assert_not_called()
        client.set_active_state.assert_called_once()

    @patch("database.marketplace_deactivate_service.OttoExternalProductsClient")
    def test_quantity_update_failure_does_not_activate(self, client_class):
        client = client_class.return_value
        client.fetch_products.return_value = {
            "productVariations": [{"sku": "4062292990991", "quantity": 0}]
        }
        client.create_or_update_products.side_effect = OttoExternalAPIError("upsert failed")

        result = _apply_otto_active_state(
            ean="4062292990991", site_key="OTTO_JV", controller="jv", inactive=False
        )

        self.assertFalse(result["ok"])
        client.set_active_state.assert_not_called()

    @patch("database.marketplace_deactivate_service.OttoExternalProductsClient")
    def test_missing_quantity_does_not_activate(self, client_class):
        client_class.return_value.fetch_products.return_value = {
            "productVariations": [{"sku": "4062292990991"}]
        }

        result = _apply_otto_active_state(
            ean="4062292990991", site_key="OTTO_JV", controller="jv", inactive=False
        )

        self.assertFalse(result["ok"])
        client_class.return_value.set_active_state.assert_not_called()

    @patch("database.marketplace_deactivate_service.OttoExternalProductsClient")
    def test_different_sku_is_not_updated(self, client_class):
        client = client_class.return_value
        client.fetch_products.return_value = {
            "productVariations": [{"sku": "other", "quantity": 0}]
        }

        result = _apply_otto_active_state(
            ean="4062292990991", site_key="OTTO_JV", controller="jv", inactive=False
        )

        self.assertFalse(result["ok"])
        client.create_or_update_products.assert_not_called()
        client.set_active_state.assert_not_called()

    @patch("database.marketplace_deactivate_service.OttoExternalProductsClient")
    def test_rejected_quantity_update_does_not_activate(self, client_class):
        client = client_class.return_value
        client.fetch_products.return_value = {
            "productVariations": [{"sku": "4062292990991", "quantity": 0}]
        }
        client.create_or_update_products.return_value = {"success": False}

        result = _apply_otto_active_state(
            ean="4062292990991", site_key="OTTO_JV", controller="jv", inactive=False
        )

        self.assertFalse(result["ok"])
        client.set_active_state.assert_not_called()

    @patch("database.marketplace_deactivate_service.OttoExternalProductsClient")
    def test_deactivation_does_not_read_or_change_quantity(self, client_class):
        result = _apply_otto_active_state(
            ean="4062292990991", site_key="OTTO_JV", controller="jv", inactive=True
        )

        self.assertTrue(result["ok"])
        client = client_class.return_value
        client.fetch_products.assert_not_called()
        client.create_or_update_products.assert_not_called()
        client.set_active_state.assert_called_once_with(
            ean="4062292990991", controller="jv", active=False
        )
