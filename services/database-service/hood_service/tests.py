from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import Mock, patch

import requests
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIRequestFactory

from database.models import Ean, EanStatus, Kid

from .core import build_create_urls, build_delete_by_item_number_urls, sanitize_patch_payload
from .models import HoodProductSnapshot
from .snapshot_store import get_hood_product_snapshot_payload, save_hood_product_snapshot
from .views import (
    HOOD_CREATE_CATEGORY_ID,
    HoodFetchByEANAPIView,
    _coerce_json_list_field,
    _enforce_create_category,
    _merge_uploaded_image_urls,
    _record_hood_marketplace_ean,
)


class HoodCreateConfirmationTests(SimpleTestCase):
    def setUp(self):
        stack = self.enterContext(ExitStack())
        self.mocks = {}
        for name in (
            "claim_or_replay", "finalize_error", "finalize_success",
            "_extract_current_external_item", "_record_hood_marketplace_ean",
            "upsert_response_and_items", "set_external_push_status",
            "transaction.atomic", "requests.post", "time.sleep", "build_create_urls",
        ):
            self.mocks[name] = stack.enter_context(patch(f"hood_service.views.{name}"))
        self.mocks["claim_or_replay"].return_value = ("claimed", SimpleNamespace())
        self.mocks["build_create_urls"].return_value = ["https://hood.example/create", "https://hood.example/create/"]
        self.mocks["requests.post"].return_value = Mock(status_code=201, json=Mock(return_value={"items": []}))
        self.item = {"itemID": "hood-123", "itemNumber": "4071489363630", "title": "Desk"}
        self.mocks["_extract_current_external_item"].return_value = self.item

    def create_product(self):
        view = HoodFetchByEANAPIView()
        request = APIRequestFactory().post(
            "/api/v1/hood/items/by-ean/4071489363630/?account=jv",
            {"title": "Desk", "__source_ean": "4062292028939"},
            format="json",
        )
        return view.post(view.initialize_request(request), ean="4071489363630")

    def test_delayed_confirmation_records_ean_without_repeating_create(self):
        self.mocks["_extract_current_external_item"].side_effect = [None, self.item]

        response = self.create_product()

        self.assertEqual(response.status_code, 201)
        self.mocks["requests.post"].assert_called_once()
        self.assertEqual(self.mocks["_extract_current_external_item"].call_count, 2)
        self.mocks["_record_hood_marketplace_ean"].assert_called_once_with(
            source_ean="4062292028939", marketplace_ean="4071489363630", account="jv",
        )
        self.assertEqual(self.mocks["upsert_response_and_items"].call_args.args[0]["items"], [self.item])
        self.mocks["finalize_success"].assert_called_once()

    def test_unconfirmed_create_is_not_marked_published(self):
        self.mocks["_extract_current_external_item"].return_value = None

        response = self.create_product()

        self.assertEqual(response.data["code"], "hood_external_create_unconfirmed")
        self.mocks["requests.post"].assert_called_once()
        self.assertEqual(self.mocks["_extract_current_external_item"].call_count, 3)
        self.mocks["_record_hood_marketplace_ean"].assert_not_called()
        self.mocks["finalize_success"].assert_not_called()

    def test_matching_created_item_in_post_response_is_sufficient_confirmation(self):
        self.mocks["requests.post"].return_value.json.return_value = {"items": [self.item]}

        response = self.create_product()

        self.assertEqual(response.status_code, 201)
        self.mocks["_extract_current_external_item"].assert_not_called()
        self.mocks["_record_hood_marketplace_ean"].assert_called_once()

    def test_unrelated_post_item_cannot_confirm_creation(self):
        self.mocks["requests.post"].return_value.json.return_value = {
            "items": [{**self.item, "itemNumber": "OTHER-EAN"}],
        }
        self.mocks["_extract_current_external_item"].return_value = None

        response = self.create_product()

        self.assertEqual(response.data["code"], "hood_external_create_unconfirmed")
        self.mocks["_record_hood_marketplace_ean"].assert_not_called()

    def test_only_confirmed_item_is_saved_after_lookup(self):
        self.mocks["requests.post"].return_value.json.return_value = {
            "items": [{**self.item, "itemNumber": "OTHER-EAN"}],
        }

        response = self.create_product()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.mocks["upsert_response_and_items"].call_args.args[0]["items"], [self.item])

    def test_timeout_does_not_try_another_create_url(self):
        self.mocks["requests.post"].side_effect = requests.Timeout("response lost")

        response = self.create_product()

        self.assertEqual(response.data["code"], "hood_external_network_failed")
        self.mocks["requests.post"].assert_called_once()
        self.mocks["_record_hood_marketplace_ean"].assert_not_called()

    def test_missing_endpoint_can_fall_back_to_next_url(self):
        self.mocks["requests.post"].side_effect = [
            Mock(status_code=404), Mock(status_code=201, json=Mock(return_value={})),
        ]

        response = self.create_product()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.mocks["requests.post"].call_count, 2)

    def test_existing_item_error_does_not_claim_an_unverified_mapping(self):
        self.mocks["requests.post"].return_value = Mock(
            status_code=409, text="Item already exists in Hood by EAN: 4071489363630",
        )

        response = self.create_product()

        self.assertEqual(response.data["code"], "hood_external_create_failed")
        self.mocks["requests.post"].assert_called_once()
        self.mocks["_record_hood_marketplace_ean"].assert_not_called()


class HoodImagePayloadTests(SimpleTestCase):
    def test_create_category_is_always_enforced(self):
        payload = _enforce_create_category({"categoryID": "9999"})

        self.assertEqual(payload["categoryID"], HOOD_CREATE_CATEGORY_ID)
        self.assertEqual(payload["categoryID"], "2412")

    def test_create_endpoint_defaults_to_by_ean_path(self):
        urls = build_create_urls("4012345678901")

        self.assertTrue(urls)
        self.assertTrue(urls[0].endswith("/api/items/by-ean/4012345678901"))

    def test_delete_by_item_number_endpoint_defaults_to_api_path(self):
        urls = build_delete_by_item_number_urls("4260174428871")

        self.assertTrue(urls)
        self.assertTrue(urls[0].endswith("/api/items/delete/by-item-number/4260174428871"))

    def test_sanitize_patch_payload_keeps_single_image_list_as_list(self):
        sanitized = sanitize_patch_payload({"images": ["https://img.example/only.jpg"]})

        self.assertEqual(sanitized, {"images": ["https://img.example/only.jpg"]})

    def test_sanitize_patch_payload_keeps_single_property_list_as_list(self):
        sanitized = sanitize_patch_payload({"productProperties": [{"name": "Color", "value": "Gold"}]})

        self.assertEqual(sanitized, {"productProperties": [{"name": "Color", "value": "Gold"}]})

    def test_coerce_json_list_field_parses_json_array_string(self):
        coerced = _coerce_json_list_field('["https://img.example/1.jpg","https://img.example/2.jpg"]')

        self.assertEqual(
            coerced,
            [
                "https://img.example/1.jpg",
                "https://img.example/2.jpg",
            ],
        )

    def test_coerce_json_list_field_keeps_plain_string_untouched(self):
        self.assertEqual(_coerce_json_list_field("https://img.example/1.jpg"), "https://img.example/1.jpg")

    def test_upload_only_keeps_existing_images_in_patch_payload(self):
        merged = _merge_uploaded_image_urls(
            patch_body={},
            uploaded_image_urls=["https://img.example/new.jpg"],
            current_external_item={
                "images": [
                    "https://img.example/old-1.jpg",
                    "https://img.example/old-2.jpg",
                ],
            },
        )

        self.assertEqual(
            merged,
            [
                "https://img.example/old-1.jpg",
                "https://img.example/old-2.jpg",
                "https://img.example/new.jpg",
            ],
        )

    def test_explicit_images_payload_is_used_as_base(self):
        merged = _merge_uploaded_image_urls(
            patch_body={"images": ["https://img.example/kept.jpg"]},
            uploaded_image_urls=["https://img.example/new.jpg"],
            current_external_item={"images": ["https://img.example/old.jpg"]},
        )

        self.assertEqual(
            merged,
            [
                "https://img.example/kept.jpg",
                "https://img.example/new.jpg",
            ],
        )


class HoodProductSnapshotStoreTests(TestCase):
    def test_save_replaces_existing_snapshot_for_account_and_ean(self):
        first_payload = {
            "account": "jv",
            "ean": "4062292028939",
            "items": [{"itemID": "item-1", "title": "Before"}],
        }
        latest_payload = {
            "account": "jv",
            "ean": "4062292028939",
            "items": [{"itemID": "item-1", "title": "After", "images": ["https://img.example/latest.jpg"]}],
        }

        save_hood_product_snapshot(account="jv", ean="4062292028939", payload=first_payload)
        save_hood_product_snapshot(account="jv", ean="4062292028939", payload=latest_payload)

        self.assertEqual(HoodProductSnapshot.objects.count(), 1)
        snapshot = HoodProductSnapshot.objects.get(account="jv", ean="4062292028939")
        self.assertEqual(snapshot.source_item_id, "item-1")
        self.assertEqual(get_hood_product_snapshot_payload(account="jv", ean="4062292028939"), latest_payload)


class HoodMarketplaceEanMappingTests(TestCase):
    def test_confirmed_hood_pool_ean_is_saved_on_the_source_kid(self):
        kid = Kid.objects.create(kid_number=["KID-HOOD-POOL"])
        source_ean = "4012345678901"
        Ean.objects.create(kid=kid, main_ean_jv=source_ean)

        result = _record_hood_marketplace_ean(
            source_ean=source_ean,
            marketplace_ean="4098765432109",
            account="jv",
        )

        ean_row = Ean.objects.get(kid=kid)
        status_row = EanStatus.objects.get(ean=kid)
        self.assertEqual(result["field"], "hood_jv")
        self.assertEqual(ean_row.hood_jv, "4098765432109")
        self.assertTrue(status_row.hood_jv)
