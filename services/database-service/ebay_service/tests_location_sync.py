from unittest.mock import Mock

from django.test import SimpleTestCase

from .client import EbayApiError
from .location_sync import plan_location_copy
from .management.commands.copy_ebay_jv_locations import EXCLUDED_LOCATION_KEYS, JV_LOCATION_KEYS


class EbayLocationCopyTests(SimpleTestCase):
    def test_command_limits_copy_to_twelve_locations(self):
        self.assertEqual(len(JV_LOCATION_KEYS), 17)
        self.assertEqual(len(JV_LOCATION_KEYS - EXCLUDED_LOCATION_KEYS), 12)
        self.assertIn("NL_1082", EXCLUDED_LOCATION_KEYS)

    def setUp(self):
        self.client = Mock()
        self.source = {
            "merchantLocationKey": "DE_88483",
            "name": "JV warehouse",
            "merchantLocationStatus": "ENABLED",
            "locationTypes": ["WAREHOUSE"],
            "location": {"address": {"postalCode": "88483", "country": "DE"}},
        }
        self.client.inventory_locations.side_effect = lambda *, account, offset: {
            "locations": [self.source] if account == "jv" else [],
            "total": 1 if account == "jv" else 0,
        }

    def test_plans_missing_locations_without_writing(self):
        plan = plan_location_copy(self.client, expected_keys={"DE_88483"})

        self.assertEqual([(entry["account"], entry["action"]) for entry in plan], [("xl", "create"), ("dep", "create")])
        self.assertEqual(plan[0]["name"], "JV warehouse")
        self.client.create_inventory_location.assert_not_called()

    def test_empty_target_response_can_omit_total(self):
        self.client.inventory_locations.side_effect = lambda *, account, offset: (
            {"locations": [self.source], "total": 1} if account == "jv" else {"locations": []}
        )

        plan = plan_location_copy(self.client, expected_keys={"DE_88483"})

        self.assertEqual(len(plan), 2)

    def test_rejects_changed_source_keys(self):
        with self.assertRaises(EbayApiError):
            plan_location_copy(self.client, expected_keys={"DE_88483", "DE_88487"})

    def test_excludes_approved_key_before_address_validation(self):
        self.source["location"] = {"address": {"city": "Burgrieden", "country": "BG"}}

        plan = plan_location_copy(
            self.client, expected_keys={"DE_88483"}, excluded_keys={"DE_88483"},
        )

        self.assertEqual(plan, [])

    def test_skips_existing_matching_location(self):
        self.client.inventory_locations.side_effect = lambda *, account, offset: {
            "locations": [] if account == "dep" else [self.source],
            "total": 0 if account == "dep" else 1,
        }

        plan = plan_location_copy(self.client, expected_keys={"DE_88483"})

        self.assertEqual([(entry["account"], entry["action"]) for entry in plan], [("xl", "skip"), ("dep", "create")])

    def test_rejects_target_key_with_different_address(self):
        conflicting = {**self.source, "location": {"address": {"postalCode": "88438", "country": "DE"}}}
        self.client.inventory_locations.side_effect = lambda *, account, offset: {
            "locations": [self.source] if account == "jv" else [conflicting] if account == "xl" else [],
            "total": 0 if account == "dep" else 1,
        }

        with self.assertRaises(EbayApiError):
            plan_location_copy(self.client, expected_keys={"DE_88483"})

    def test_fetches_full_source_when_name_is_absent(self):
        self.source.pop("name")
        self.client.inventory_location.return_value = {"name": "JV warehouse"}

        plan = plan_location_copy(self.client, expected_keys={"DE_88483"})

        self.assertEqual(plan[0]["name"], "JV warehouse")
        self.client.inventory_location.assert_called_with(account="jv", merchant_location_key="DE_88483")

    def test_uses_key_as_name_when_source_has_no_name(self):
        self.source.pop("name")
        self.client.inventory_location.return_value = {}

        plan = plan_location_copy(self.client, expected_keys={"DE_88483"})

        self.assertEqual(plan[0]["name"], "DE_88483")

    def test_rejects_city_without_state_and_postal_code(self):
        self.source["location"] = {"address": {"city": "Burgrieden", "country": "BG"}}

        with self.assertRaises(EbayApiError):
            plan_location_copy(self.client, expected_keys={"DE_88483"})

    def test_paginates_and_rejects_early_stop(self):
        self.client.inventory_locations.side_effect = lambda *, account, offset: {
            "locations": [self.source] if account == "jv" and offset == 0 else [],
            "total": 2 if account == "jv" else 0,
        }

        with self.assertRaises(EbayApiError):
            plan_location_copy(self.client, expected_keys={"DE_88483"})
