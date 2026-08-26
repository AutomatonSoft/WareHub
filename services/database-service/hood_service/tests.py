from django.test import SimpleTestCase, TestCase

from database.models import Ean, EanStatus, Kid

from .core import build_create_urls, build_delete_by_item_number_urls, sanitize_patch_payload
from .models import HoodProductSnapshot
from .snapshot_store import get_hood_product_snapshot_payload, save_hood_product_snapshot
from .views import (
    HOOD_CREATE_CATEGORY_ID,
    _coerce_json_list_field,
    _enforce_create_category,
    _merge_uploaded_image_urls,
    _record_hood_marketplace_ean,
)


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
