from django.test import SimpleTestCase

from .serializers import HoodPatchSerializer


class HoodUniquePropertyTests(SimpleTestCase):
    def test_duplicate_names_are_rejected_for_create_and_patch(self):
        for partial in (False, True):
            for duplicate in ("Produktart", " produktart ", "PRODUKTART"):
                with self.subTest(partial=partial, duplicate=duplicate):
                    serializer = HoodPatchSerializer(data={"productProperties": [
                        {"name": "Produktart", "value": "Sofa"}, {"name": duplicate, "value": "Holz"},
                    ]}, partial=partial)
                    self.assertFalse(serializer.is_valid())
                    self.assertIn("productProperties", serializer.errors)

    def test_corrected_payload_can_be_submitted_after_duplicate_error(self):
        properties = [{"name": "Produktart", "value": "Sofa"}, {"name": "Produktart", "value": "Holz"}]
        self.assertFalse(HoodPatchSerializer(data={"productProperties": properties}).is_valid())
        properties.pop()
        serializer = HoodPatchSerializer(data={"productProperties": properties})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["productProperties"], properties)

    def test_distinct_properties_and_empty_list_are_preserved(self):
        for properties in ([], [{"name": "Produktart", "value": "Sofa"}, {"name": "Material", "value": "Holz"}]):
            serializer = HoodPatchSerializer(data={"productProperties": properties})
            self.assertTrue(serializer.is_valid(), serializer.errors)
            self.assertEqual(serializer.validated_data["productProperties"], properties)

    def test_duplicate_names_with_extra_internal_whitespace_are_rejected(self):
        serializer = HoodPatchSerializer(data={"productProperties": [
            {"name": "Montage erforderlich", "value": "Ja"},
            {"name": " Montage   erforderlich ", "value": "Nein"},
        ]})
        self.assertFalse(serializer.is_valid())
