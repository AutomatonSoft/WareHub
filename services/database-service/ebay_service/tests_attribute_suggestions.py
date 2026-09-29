import json
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from .attribute_suggestions import AttributeSuggestionError, suggest_category_attributes


class EbayAttributeSuggestionTests(SimpleTestCase):
    def test_filters_unknown_names_and_unsupported_evidence(self):
        response = Mock()
        response.json.return_value = {"output_text": json.dumps({"suggestions": [
            {"name": "Farbe", "value": "Grün", "evidence": "grüner Sessel"},
            {"name": "Material", "value": "Leder", "evidence": "Leder"},
            {"name": "Erfunden", "value": "Wert", "evidence": "grüner Sessel"},
        ], "seo": {"title": "Grüner Sessel 90 cm", "subtitle": "Sessel", "description": "Ein grüner Sessel mit 90 cm Höhe."}})}
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key", "OPENAI_EBAY_ATTRIBUTES_MODEL": "test-model"}):
            with patch("ebay_service.attribute_suggestions.requests.post", return_value=response) as post:
                result = suggest_category_attributes(
                    category_id="123", title="grüner Sessel", description="", facts={"Höhe": "90 cm"},
                    aspects=[{"localizedAspectName": "Farbe", "aspectConstraint": {"aspectRequired": True}}, {"localizedAspectName": "Material"}],
                )

        self.assertEqual(result["suggestions"], [{"name": "Farbe", "value": "Grün", "evidence": "grüner Sessel"}])
        self.assertEqual(result["seo"]["title"], "Grüner Sessel 90 cm")
        self.assertFalse(post.call_args.kwargs["json"]["store"])
        self.assertIn("90 cm", post.call_args.kwargs["json"]["input"][1]["content"])

    def test_rejects_unsupported_seo_numbers(self):
        response = Mock()
        response.json.return_value = {"output_text": json.dumps({"suggestions": [
            {"name": "Höhe", "value": "99 cm", "evidence": "Sessel"},
        ], "seo": {
            "title": "Sessel 99 cm", "subtitle": "Sessel", "description": "99 cm hoch",
        }})}
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
            with patch("ebay_service.attribute_suggestions.requests.post", return_value=response):
                result = suggest_category_attributes(category_id="123", title="Sessel", description="", facts={}, aspects=[{"localizedAspectName": "Höhe"}])
        self.assertEqual(result["suggestions"], [])
        self.assertEqual(result["seo"], {"title": "", "subtitle": "Sessel", "description": ""})

    def test_package_size_is_not_product_size_evidence(self):
        response = Mock()
        response.json.return_value = {"output_text": json.dumps({"suggestions": [
            {"name": "Höhe", "value": "90 cm", "evidence": "90 cm"},
        ], "seo": {"title": "Sessel 90 cm", "subtitle": "", "description": ""}})}
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
            with patch("ebay_service.attribute_suggestions.requests.post", return_value=response):
                result = suggest_category_attributes(
                    category_id="123", title="Sessel", description="", facts={"Package dimensions": '{"height":90,"unit":"CENTIMETER"}'},
                    aspects=[{"localizedAspectName": "Höhe"}],
                )
        self.assertEqual(result["suggestions"], [])
        self.assertEqual(result["seo"]["title"], "")

    def test_selection_only_requires_ebay_value(self):
        response = Mock()
        response.json.return_value = {"output_text": json.dumps({"suggestions": [
            {"name": "Farbe", "value": "Hellgrün", "evidence": "grüner Sessel"},
        ], "seo": {"title": "", "subtitle": "", "description": ""}})}
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
            with patch("ebay_service.attribute_suggestions.requests.post", return_value=response):
                result = suggest_category_attributes(
                    category_id="123", title="grüner Sessel", description="", facts={},
                    aspects=[{"localizedAspectName": "Farbe", "aspectConstraint": {"aspectMode": "SELECTION_ONLY"}, "aspectValues": [{"localizedValue": "Grün"}]}],
                )
        self.assertEqual(result["suggestions"], [])

    def test_missing_key_fails_without_request(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": ""}):
            with patch("ebay_service.attribute_suggestions.requests.post") as post:
                with self.assertRaises(AttributeSuggestionError):
                    suggest_category_attributes(category_id="123", title="Chair", description="", facts={}, aspects=[])
        post.assert_not_called()
