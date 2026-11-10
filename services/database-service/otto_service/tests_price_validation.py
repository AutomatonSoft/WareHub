from django.test import SimpleTestCase

from .serializers import OttoProductPayloadSerializer


class OttoPriceValidationTests(SimpleTestCase):
    def test_valid_price_preserves_currency_vat_and_other_pricing_fields(self):
        serializer = OttoProductPayloadSerializer(data={
            "productReference": "source_SOFORT_XL", "quantity": 1,
            "pricing": {"standardPrice": {"amount": "700.50", "currency": "EUR"}, "vat": "FULL"},
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["pricing"], {"standardPrice": {"amount": 700.5, "currency": "EUR"}, "vat": "FULL"})
        self.assertEqual(serializer.validated_data["quantity"], 1)

    def test_invalid_amount_is_rejected_on_the_server_before_calling_otto(self):
        for amount in [None, "", "invalid", "700,50", True, float("nan"), float("inf"), -1]:
            with self.subTest(amount=amount):
                serializer = OttoProductPayloadSerializer(data={"productReference": "source", "pricing": {"standardPrice": {"amount": amount, "currency": "EUR"}}})
                self.assertFalse(serializer.is_valid())
                self.assertIn("pricing", serializer.errors)

    def test_invalid_standard_price_shape_and_missing_amount_are_rejected(self):
        for standard_price in [None, [], "700", {}]:
            serializer = OttoProductPayloadSerializer(data={"productReference": "source", "pricing": {"standardPrice": standard_price}})
            self.assertFalse(serializer.is_valid())

    def test_partial_update_without_standard_price_remains_supported(self):
        for extra in [{}, {"pricing": {"vat": "FULL"}}]:
            serializer = OttoProductPayloadSerializer(data={"productReference": "source", **extra})
            self.assertTrue(serializer.is_valid(), serializer.errors)
