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

    def test_considers_optional_attributes_and_values_beyond_old_limits(self):
        response = Mock()
        response.json.return_value = {"output_text": json.dumps({"suggestions": [
            {"name": "Leuchtmittel", "value": "LED", "evidence": "LED"},
        ], "seo": {"title": "LED Lampe", "subtitle": "", "description": ""}})}
        aspects = [{"localizedAspectName": f"Optional {index}"} for index in range(80)]
        aspects.append({"localizedAspectName": "Leuchtmittel", "aspectConstraint": {"aspectMode": "SELECTION_ONLY"},
                        "aspectValues": [{"localizedValue": f"Option {index}"} for index in range(30)] + [{"localizedValue": "LED"}]})
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
            with patch("ebay_service.attribute_suggestions.requests.post", return_value=response) as post:
                result = suggest_category_attributes(category_id="123", title="LED Lampe", description="", facts={}, aspects=aspects)
        self.assertEqual(result["suggestions"], [{"name": "Leuchtmittel", "value": "LED", "evidence": "LED"}])
        self.assertEqual(result["category_aspect_count"], 81)
        self.assertEqual(result["considered_aspect_count"], 81)
        prompt = json.loads(post.call_args.kwargs["json"]["input"][1]["content"])
        self.assertEqual(len(prompt["attributes"]), 81)
        self.assertIn("LED", prompt["attributes"][-1]["example_values"])

    def test_keeps_evidence_after_first_six_thousand_characters(self):
        response = Mock()
        response.json.return_value = {"output_text": json.dumps({"suggestions": [
            {"name": "Material", "value": "Glas", "evidence": "Glas"},
        ], "seo": {"title": "Lampe aus Glas", "subtitle": "", "description": ""}})}
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
            with patch("ebay_service.attribute_suggestions.requests.post", return_value=response) as post:
                result = suggest_category_attributes(
                    category_id="123", title="Lampe", description=f"{'Beschreibung ' * 550} Glas",
                    facts={}, aspects=[{"localizedAspectName": "Material"}],
                )
        self.assertEqual(result["suggestions"][0]["value"], "Glas")
        self.assertIn("Glas", json.loads(post.call_args.kwargs["json"]["input"][1]["content"])["product_text"])

    def test_bounds_prompt_without_dropping_required_attributes(self):
        response = Mock()
        response.json.return_value = {"output_text": json.dumps({"suggestions": [], "seo": {"title": "", "subtitle": "", "description": ""}})}
        aspects = [{"localizedAspectName": f"Optional {index}"} for index in range(250)]
        aspects.append({"localizedAspectName": "Required", "aspectConstraint": {"aspectRequired": True}})
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
            with patch("ebay_service.attribute_suggestions.requests.post", return_value=response) as post:
                result = suggest_category_attributes(category_id="123", title="Lampe", description="", facts={}, aspects=aspects)
        self.assertEqual(result["category_aspect_count"], 251)
        self.assertEqual(result["considered_aspect_count"], 200)
        prompt = json.loads(post.call_args.kwargs["json"]["input"][1]["content"])
        self.assertEqual(prompt["attributes"][0]["name"], "Required")

    def test_missing_key_fails_without_request(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": ""}):
            with patch("ebay_service.attribute_suggestions.requests.post") as post:
                with self.assertRaises(AttributeSuggestionError):
                    suggest_category_attributes(category_id="123", title="Chair", description="", facts={}, aspects=[])
        post.assert_not_called()
