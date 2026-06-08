from django.test import SimpleTestCase

from .core import sanitize_patch_payload
from .views import _coerce_json_list_field, _merge_uploaded_image_urls


class HoodImagePayloadTests(SimpleTestCase):
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
