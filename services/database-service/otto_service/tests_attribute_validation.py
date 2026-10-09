from copy import deepcopy
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from .attribute_validation import OttoTaxonomyUnavailable, attribute_errors, validate_product_attributes
from .category_cache import OttoCategoryCache
from .views import OttoProductUpsertAPIView


TAXONOMY = [
    {"name": "Grundfarbe", "relevance": "HIGH", "multiValue": False, "allowedValues": ["beige", "natur", "grün"]},
    {"name": "Farbe", "relevance": "LOW", "allowedValues": []},
]


class OttoAttributeValidationTests(SimpleTestCase):
    def test_exact_allowed_values_and_required_attributes(self):
        errors = attribute_errors({"attributes": [{"name": "Grundfarbe", "values": ["Beige"]}]}, TAXONOMY, "items[0].productDescription")
        self.assertEqual(errors[0]["code"], "attribute_value_not_allowed")
        self.assertEqual(errors[0]["field"], "items[0].productDescription.attributes[0].values")
        self.assertEqual(errors[0]["allowed_values"], ["beige", "natur", "grün"])
        errors = attribute_errors({}, TAXONOMY, "description")
        self.assertEqual(errors[0]["code"], "required_attribute_missing")
        self.assertEqual(errors[0]["attribute"], "Grundfarbe")

    def test_valid_input_is_not_mutated_and_optional_fields_stay_optional(self):
        description = {"attributes": [{"name": "Grundfarbe", "values": ["beige"]}, {"name": "Farbe", "values": ["Beige"]}]}
        original = deepcopy(description)
        self.assertEqual(attribute_errors(description, TAXONOMY, "description"), [])
        self.assertEqual(description, original)
        self.assertEqual(attribute_errors({"attributes": description["attributes"][:1]}, TAXONOMY, "description"), [])

    def test_malformed_duplicate_empty_and_multiple_values_are_rejected(self):
        for attributes in (None, {}, [None], [{"name": "Grundfarbe", "values": "beige"}], [{"name": "Grundfarbe", "values": [""]}]):
            with self.subTest(attributes=attributes):
                self.assertTrue(attribute_errors({"attributes": attributes}, TAXONOMY, "description"))
        errors = attribute_errors({"attributes": [
            {"name": "Grundfarbe", "values": ["beige", "natur"]},
            {"name": "Grundfarbe", "values": ["beige", "natur"]},
        ]}, TAXONOMY, "description")
        self.assertEqual({error["code"] for error in errors}, {"duplicate_attribute", "attribute_single_value"})
        self.assertTrue(all(error["attribute"] == "Grundfarbe" for error in errors))
        errors = attribute_errors({"attributes": [{"name": "Grundfarbe", "values": []}]}, TAXONOMY, "description")
        self.assertEqual(errors[0]["attribute"], "Grundfarbe")

    def test_batch_loads_each_category_once_and_retains_item_paths(self):
        with patch("otto_service.attribute_validation.OttoCategoryCache") as cache:
            cache.return_value.category_id_by_name.return_value = "42"
            cache.return_value.attributes.return_value = TAXONOMY
            errors = validate_product_attributes([{"productDescription": {"category": "Sessel"}}] * 2)
        self.assertEqual([error["field"] for error in errors], ["items[0].productDescription.attributes", "items[1].productDescription.attributes"])
        cache.return_value.attributes.assert_called_once_with("42")

    def test_missing_or_malformed_taxonomy_is_not_an_empty_required_list(self):
        for taxonomy in (None, {}, [None], [{"name": "Grundfarbe", "allowedValues": "beige"}]):
            with self.subTest(taxonomy=taxonomy), patch("otto_service.attribute_validation.OttoCategoryCache") as cache:
                cache.return_value.category_id_by_name.return_value = "42"
                cache.return_value.attributes.return_value = taxonomy
                with self.assertRaises(OttoTaxonomyUnavailable):
                    validate_product_attributes([{"productDescription": {"category": "Sessel"}}])

    def test_partial_updates_without_category_do_not_load_taxonomy(self):
        with patch("otto_service.attribute_validation.OttoCategoryCache") as cache:
            self.assertEqual(validate_product_attributes([{"pricing": {}}, {"productDescription": {"description": "Text"}}]), [])
        cache.assert_not_called()

    def test_category_resolution_requires_exact_unique_name(self):
        cache = OttoCategoryCache.__new__(OttoCategoryCache)
        cache._categories = Mock()
        for rows, expected in (([], None), ([{"_id": "42"}], "42"), ([{"_id": "42"}, {"_id": "43"}], None)):
            cache._categories.find.return_value.limit.return_value = rows
            self.assertEqual(cache.category_id_by_name("Sessel"), expected)
            cache._categories.find.assert_called_with({"name": "Sessel"}, {"_id": 1})

    def test_upsert_stops_before_external_write_for_both_accounts(self):
        for profile in ("jv", "xl"):
            with self.subTest(profile=profile), patch("otto_service.attribute_validation.OttoCategoryCache") as cache, patch("otto_service.views.OttoExternalProductsClient") as client:
                cache.return_value.category_id_by_name.return_value = "42"
                cache.return_value.attributes.return_value = TAXONOMY
                request = APIRequestFactory().post("/", {"productReference": "test", "productDescription": {"category": "Sessel"}}, format="json")
                request.session = {"role": "admin"}
                response = OttoProductUpsertAPIView.as_view()(request, profile=profile)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], "otto_attributes_invalid")
                client.assert_not_called()

    def test_unavailable_taxonomy_returns_safe_503_without_publication(self):
        with patch("otto_service.attribute_validation.OttoCategoryCache", side_effect=RuntimeError("private database detail")), patch("otto_service.views.OttoExternalProductsClient") as client:
            request = APIRequestFactory().post("/", {"productReference": "test", "productDescription": {"category": "Sessel"}}, format="json")
            request.session = {"role": "admin"}
            response = OttoProductUpsertAPIView.as_view()(request, profile="jv")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["code"], "otto_taxonomy_unavailable")
        self.assertNotIn("private", str(response.data))
        client.assert_not_called()

    def test_valid_upsert_keeps_payload_and_pending_response(self):
        product = {"productReference": "test", "productDescription": {"category": "Sessel", "attributes": [{"name": "Grundfarbe", "values": ["beige"]}]}}
        for profile in ("jv", "xl"):
            with self.subTest(profile=profile), patch("otto_service.attribute_validation.OttoCategoryCache") as cache, patch("otto_service.views.OttoExternalProductsClient") as client, patch("otto_service.views._upsert_products", return_value=(1, 0, [])), patch("otto_service.views.record_submissions") as record:
                cache.return_value.category_id_by_name.return_value = "42"
                cache.return_value.attributes.return_value = TAXONOMY
                client.return_value.create_or_update_products.return_value = {"job_id": "task"}
                request = APIRequestFactory().post("/", {"items": [product]}, format="json")
                request.session = {"role": "admin"}
                response = OttoProductUpsertAPIView.as_view()(request, profile=profile)
                self.assertEqual(response.status_code, 202)
                self.assertEqual(response.data["publication_state"], "pending")
                client.return_value.create_or_update_products.assert_called_once_with(controller=profile, products=[product])
                record.assert_called_once_with(profile, [product], {"job_id": "task"})
