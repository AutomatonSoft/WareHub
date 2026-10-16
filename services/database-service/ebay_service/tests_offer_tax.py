from copy import deepcopy
from unittest.mock import patch

from django.test import SimpleTestCase

from .client import EbayApiConfig, EbayOAuthClient
from .offer_tax import with_fixed_vat
from .tests import FakeSession


class EbayOfferTaxTests(SimpleTestCase):
    def test_forces_vat_and_preserves_other_fields_without_mutation(self):
        for tax in (None, {}, {"vatPercentage": 0}, {"vatPercentage": 7, "applyTax": False, "thirdPartyTaxCategory": "example"}):
            with self.subTest(tax=tax):
                offer = {"marketplaceId": "EBAY_DE", "tax": tax, "pricingSummary": {"price": {"value": "119.00", "currency": "EUR"}}}
                original = deepcopy(offer)
                result = with_fixed_vat(offer)
                self.assertEqual(result["tax"]["vatPercentage"], 19.0)
                self.assertEqual(result["pricingSummary"], original["pricingSummary"])
                self.assertEqual(offer, original)
                if isinstance(tax, dict):
                    for key, value in tax.items():
                        if key != "vatPercentage":
                            self.assertEqual(result["tax"][key], value)

    @patch("ebay_service.client.load_refresh_token", return_value="refresh-token")
    def test_create_and_update_always_send_fixed_vat_for_each_account(self, _refresh):
        for account in ("jv", "xl", "dep"):
            with self.subTest(account=account):
                session = FakeSession()
                client = EbayOAuthClient(
                    config=EbayApiConfig("client", "secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
                    ru_name="test-runame", session=session,
                )
                for tax in (None, {"vatPercentage": 7, "applyTax": False}):
                    offer = {"marketplaceId": "EBAY_DE", "sku": "test-sku"}
                    if tax is not None:
                        offer["tax"] = tax
                    original = deepcopy(offer)
                    client.create_offer(account=account, offer=offer)
                    self.assertEqual(session.calls[-1][2]["json"]["tax"]["vatPercentage"], 19.0)
                    client.update_offer(account=account, offer_id="offer-id", offer=offer)
                    self.assertEqual(session.calls[-1][2]["json"]["tax"]["vatPercentage"], 19.0)
                    self.assertEqual(offer, original)
