import base64
import hashlib
import json
import os
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.cache import cache
from django.test import SimpleTestCase
from django.urls import resolve
from django.core import signing
from rest_framework.test import APIRequestFactory

from .client import EbayApiConfig, EbayApiError, EbayNotificationClient, EbayOAuthClient, EbayTaxonomyClient, _listing_payload, _raise_for_bulk_update_errors
from .credentials import load_refresh_token, store_refresh_token
from .models import EbayOAuthCredential
from .listing_operations import _legacy_ean_matches, _merge_inventory_item, _merge_inventory_offer, _prepare_inventory_offer, _validate_inventory_publish_payload, execute_listing_operation
from .views import EbayMarketplaceAccountDeletionAPIView, _OAUTH_STATE_SALT, _account, _exchange_code_response, _inventory_location_address, _seller_setup_error_response


class FakeResponse:
    def __init__(self, payload, *, content=b"", ok=True, status_code=200):
        self._payload = payload
        self.content = content
        self.ok = ok
        self.status_code = status_code

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self):
        self.calls = []

    def post(self, *args, **kwargs):
        self.calls.append(("post", args, kwargs))
        data = kwargs.get("data", {})
        if isinstance(data, dict) and data.get("grant_type") == "authorization_code":
            return FakeResponse({"access_token": "access-token", "refresh_token": "refresh-token"})
        if args[0].endswith("/sell/inventory/v1/location/jv-main"):
            return FakeResponse({}, status_code=204)
        if args[0].endswith("/sell/account/v1/program/opt_in"):
            return FakeResponse({}, status_code=204)
        if args[0].endswith("/sell/account/v1/fulfillment_policy"):
            return FakeResponse({"fulfillmentPolicyId": "fulfillment-policy-id"})
        if args[0].endswith("/sell/account/v1/payment_policy"):
            return FakeResponse({"paymentPolicyId": "payment-policy-id"})
        if args[0].endswith("/sell/account/v1/return_policy"):
            return FakeResponse({"returnPolicyId": "return-policy-id"})
        if args[0].endswith("/sell/inventory/v1/offer"):
            return FakeResponse({"offerId": "offer-id"})
        if args[0].endswith("/ws/api.dll") and b"<GetMyeBaySellingRequest" in data:
            return FakeResponse(
                {},
                content=b'''<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ActiveList>
    <ItemArray>
      <Item>
        <ItemID>205926392508</ItemID><Title>Test chair</Title><SKU>JVM4062292372025</SKU>
        <Quantity>4</Quantity><QuantityAvailable>2</QuantityAvailable>
        <SellingStatus><ListingStatus>Active</ListingStatus><QuantitySold>2</QuantitySold></SellingStatus>
        <ProductListingDetails><EAN>4062292372025</EAN></ProductListingDetails>
      </Item>
    </ItemArray>
    <PaginationResult><TotalNumberOfEntries>1</TotalNumberOfEntries><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult>
  </ActiveList>
</GetMyeBaySellingResponse>''',
            )
        if args[0].endswith("/ws/api.dll") and b"<GetItemRequest" in data:
            return FakeResponse(
                {},
                content=b'''<?xml version="1.0" encoding="utf-8"?>
<GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <Item>
    <ItemID>205926392508</ItemID><Title>Test chair</Title><SKU>JVM4062292372025</SKU>
    <InventoryTrackingMethod>SKU</InventoryTrackingMethod><Quantity>4</Quantity><QuantityAvailable>2</QuantityAvailable><StartPrice currencyID="EUR">199.99</StartPrice>
    <Seller><UserID>depotum</UserID></Seller><SellingStatus><ListingStatus>Active</ListingStatus><QuantitySold>2</QuantitySold></SellingStatus>
    <ProductListingDetails><EAN>4062292372025</EAN></ProductListingDetails>
    <ItemSpecifics><NameValueList><Name>EAN</Name><Value>4062292372025</Value></NameValueList></ItemSpecifics>
  </Item>
</GetItemResponse>''',
            )
        if args[0].endswith("/ws/api.dll"):
            return FakeResponse(
                {},
                content=b'''<?xml version="1.0" encoding="utf-8"?>
<GeteBayDetailsResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ShippingServiceDetails>
    <Description>Standard</Description><InternationalService>false</InternationalService>
    <ServiceType>Flat</ServiceType><ShippingCarrier>DHL</ShippingCarrier>
    <ShippingCategory>STANDARD</ShippingCategory><ShippingService>DE_DHLPaket</ShippingService>
    <ValidForSellingFlow>true</ValidForSellingFlow>
  </ShippingServiceDetails>
  <ShippingServiceDetails><ShippingService>Deprecated</ShippingService><ValidForSellingFlow>false</ValidForSellingFlow></ShippingServiceDetails>
</GeteBayDetailsResponse>''',
            )
        return FakeResponse({"access_token": "test-token"})

    def put(self, *args, **kwargs):
        self.calls.append(("put", args, kwargs))
        return FakeResponse({}, status_code=204)

    def get(self, *args, **kwargs):
        self.calls.append(("get", args, kwargs))
        if args[0].endswith("/sell/inventory/v1/location"):
            return FakeResponse({"locations": []})
        if args[0].endswith("/fulfillment_policy"):
            return FakeResponse({"fulfillmentPolicies": []})
        if args[0].endswith("/payment_policy"):
            return FakeResponse({"paymentPolicies": []})
        if args[0].endswith("/return_policy"):
            return FakeResponse({"returnPolicies": []})
        if "get_default_category_tree_id" in args[0]:
            return FakeResponse({"categoryTreeId": "123"})
        return FakeResponse({"categorySuggestions": []})


class NotificationSession:
    def __init__(self, public_key: str):
        self.public_key = public_key
        self.calls = []

    def post(self, *args, **kwargs):
        self.calls.append(("post", args, kwargs))
        return FakeResponse({"access_token": "application-token"})

    def get(self, *args, **kwargs):
        self.calls.append(("get", args, kwargs))
        return FakeResponse({"key": self.public_key, "algorithm": "ECDSA", "digest": "SHA1"})


class EbayRouteTests(SimpleTestCase):
    def test_accepts_configured_seller_accounts(self):
        self.assertEqual(_account("DEP"), "dep")
        self.assertIsNone(_account("unknown"))

    def test_inventory_location_address_accepts_postal_or_city_state_country(self):
        self.assertEqual(
            _inventory_location_address({"postal_code": "40210", "country": "de"}),
            {"postalCode": "40210", "country": "DE"},
        )

    def test_inventory_item_patch_preserves_unspecified_nested_fields(self):
        merged = _merge_inventory_item(
            current={
                "condition": "NEW",
                "product": {"title": "Original", "description": "Current", "aspects": {"Brand": ["Depotum"]}},
                "availability": {"shipToLocationAvailability": {"quantity": 3}},
            },
            patch={"product": {"title": "Renamed"}},
        )

        self.assertEqual(merged["condition"], "NEW")
        self.assertEqual(merged["product"]["title"], "Renamed")
        self.assertEqual(merged["product"]["description"], "Current")
        self.assertEqual(merged["availability"]["shipToLocationAvailability"]["quantity"], 3)
        self.assertEqual(
            _inventory_location_address(
                {"address": {"address_line1": "Example 1", "city": "Dusseldorf", "state_or_province": "NRW", "country": "DE"}}
            ),
            {"addressLine1": "Example 1", "city": "Dusseldorf", "stateOrProvince": "NRW", "country": "DE"},
        )

    def test_oauth_credential_account_field_allows_seller_account_names(self):
        self.assertEqual(EbayOAuthCredential._meta.get_field("account").max_length, 32)

    def test_taxonomy_routes_are_registered(self):
        self.assertEqual(resolve("/api/v1/ebay/taxonomy/category-suggestions/").url_name, "ebay-category-suggestions-v1")
        self.assertEqual(resolve("/api/v1/ebay/taxonomy/category-aspects/").url_name, "ebay-category-aspects-v1")
        self.assertEqual(resolve("/api/v1/ebay/taxonomy/category-tree/").url_name, "ebay-category-tree-v1")
        self.assertEqual(resolve("/api/v1/ebay/oauth/callback/").url_name, "ebay-oauth-callback-v1")
        self.assertEqual(
            resolve("/api/v1/ebay/notifications/marketplace-account-deletion/").url_name,
            "ebay-marketplace-account-deletion-v1",
        )
        self.assertEqual(resolve("/api/v1/ebay/seller/setup/").url_name, "ebay-seller-setup-v1")
        self.assertEqual(resolve("/api/v1/ebay/seller/locations/").url_name, "ebay-inventory-location-v1")
        self.assertEqual(
            resolve("/api/v1/ebay/seller/programs/selling-policy-management/").url_name,
            "ebay-selling-policy-management-v1",
        )
        self.assertEqual(resolve("/api/v1/ebay/seller/policies/").url_name, "ebay-seller-policy-v1")
        self.assertEqual(resolve("/api/v1/ebay/seller/shipping-services/").url_name, "ebay-shipping-services-v1")
        self.assertEqual(resolve("/api/v1/ebay/listings/205926392508/").url_name, "ebay-listing-v1")
        self.assertEqual(resolve("/api/v1/ebay/seller/active-listings/").url_name, "ebay-active-listings-v1")
        self.assertEqual(resolve("/api/v1/ebay/listings/reconcile-legacy/").url_name, "ebay-legacy-listing-reconciliation-v1")
        self.assertEqual(resolve("/api/v1/ebay/inventory/items/").url_name, "ebay-inventory-item-v1")
        self.assertEqual(resolve("/api/v1/ebay/offers/").url_name, "ebay-offer-v1")
        self.assertEqual(resolve("/api/v1/ebay/listing-operations/").url_name, "ebay-listing-operation-v1")

    @patch("ebay_service.views.store_refresh_token")
    @patch("ebay_service.views.EbayOAuthClient.exchange_code", return_value={"refresh_token": "refresh-token"})
    def test_oauth_exchange_stores_but_never_returns_refresh_token(self, _exchange_code, store_token):
        response = _exchange_code_response(
            code="one-time-code",
            state=signing.dumps({"account": "jv"}, salt=_OAUTH_STATE_SALT, compress=True),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "connected")
        self.assertNotIn("refresh_token", response.data)
        store_token.assert_called_once_with(account="jv", refresh_token="refresh-token")

    def test_seller_setup_error_includes_upstream_details(self):
        response = _seller_setup_error_response(
            EbayApiError(
                "upstream failed",
                status_code=500,
                operation="inventory_locations",
                details={"errors": [{"errorId": 25001}]},
            ),
            account="jv",
            marketplace_id="EBAY_DE",
        )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["operation"], "inventory_locations")
        self.assertEqual(response.data["account"], "jv")
        self.assertEqual(response.data["marketplace_id"], "EBAY_DE")
        self.assertEqual(response.data["details"]["errors"][0]["errorId"], 25001)


class EbayMarketplaceAccountDeletionTests(SimpleTestCase):
    endpoint = "https://warehub.automatonsoft.de/api/v1/ebay/notifications/marketplace-account-deletion/"
    verification_token = "a" * 32

    def setUp(self):
        self.factory = APIRequestFactory()

    @patch.dict(
        os.environ,
        {
            "EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT": endpoint,
            "EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN": verification_token,
        },
        clear=False,
    )
    def test_challenge_response_uses_ebay_parameter_order(self):
        request = self.factory.get("/api/v1/ebay/notifications/marketplace-account-deletion/?challenge_code=challenge")
        response = EbayMarketplaceAccountDeletionAPIView.as_view()(request)

        expected = hashlib.sha256(f"challenge{self.verification_token}{self.endpoint}".encode("utf-8")).hexdigest()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"challengeResponse": expected})

    @patch("ebay_service.views.EbayNotificationClient.verify_marketplace_account_deletion_notification", return_value=True)
    def test_valid_notification_is_acknowledged_without_exposing_payload(self, verify_notification):
        request = self.factory.post(
            "/api/v1/ebay/notifications/marketplace-account-deletion/",
            {"metadata": {"topic": "MARKETPLACE_ACCOUNT_DELETION"}, "notification": {"notificationId": "event-1"}},
            format="json",
            HTTP_X_EBAY_SIGNATURE="signature",
        )
        response = EbayMarketplaceAccountDeletionAPIView.as_view()(request)

        self.assertEqual(response.status_code, 204)
        verify_notification.assert_called_once()

    def test_notification_without_signature_is_rejected(self):
        request = self.factory.post(
            "/api/v1/ebay/notifications/marketplace-account-deletion/",
            {"metadata": {"topic": "MARKETPLACE_ACCOUNT_DELETION"}},
            format="json",
        )
        response = EbayMarketplaceAccountDeletionAPIView.as_view()(request)

        self.assertEqual(response.status_code, 412)

    @patch("ebay_service.views.EbayNotificationClient.verify_marketplace_account_deletion_notification", return_value=False)
    def test_notification_with_invalid_signature_is_rejected(self, _verify_notification):
        request = self.factory.post(
            "/api/v1/ebay/notifications/marketplace-account-deletion/",
            {"metadata": {"topic": "MARKETPLACE_ACCOUNT_DELETION"}},
            format="json",
            HTTP_X_EBAY_SIGNATURE="signature",
        )
        response = EbayMarketplaceAccountDeletionAPIView.as_view()(request)

        self.assertEqual(response.status_code, 412)

    def test_notification_signature_is_verified_with_ebay_public_key(self):
        cache.clear()
        private_key = ec.generate_private_key(ec.SECP256R1())
        public_key = private_key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("ascii")
        raw_payload = b'{"metadata":{"topic":"MARKETPLACE_ACCOUNT_DELETION"},"notification":{"notificationId":"event-1"}}'
        signature = base64.b64encode(private_key.sign(raw_payload, ec.ECDSA(hashes.SHA1()))).decode("ascii")
        signature_header = base64.b64encode(json.dumps({"kid": "test-key", "signature": signature}).encode("utf-8")).decode("ascii")
        config = EbayApiConfig(
            client_id="client-id",
            client_secret="client-secret",
            base_url="https://api.sandbox.ebay.com",
            token_url="https://api.sandbox.ebay.com/identity/v1/oauth2/token",
            connect_timeout=1,
            read_timeout=1,
        )

        is_valid = EbayNotificationClient(config=config, session=NotificationSession(public_key)).verify_marketplace_account_deletion_notification(
            raw_payload=raw_payload,
            signature_header=signature_header,
        )

        self.assertTrue(is_valid)


class EbayTaxonomyClientTests(SimpleTestCase):
    def test_fetches_category_suggestions_with_application_token(self):
        session = FakeSession()
        client = EbayTaxonomyClient(
            config=EbayApiConfig(
                client_id="client-id",
                client_secret="client-secret",
                base_url="https://api.sandbox.ebay.com",
                token_url="https://api.sandbox.ebay.com/identity/v1/oauth2/token",
                connect_timeout=8,
                read_timeout=20,
            ),
            session=session,
        )

        self.assertEqual(client.category_suggestions(marketplace_id="EBAY_DE", query="Sofa"), {"categorySuggestions": []})
        self.assertEqual(session.calls[0][0], "post")
        self.assertEqual(session.calls[1][0], "get")
        self.assertEqual(session.calls[1][2]["params"], {"marketplace_id": "EBAY_DE"})
        self.assertEqual(session.calls[2][0], "get")
        self.assertIn("get_category_suggestions", session.calls[2][1][0])
        self.assertEqual(session.calls[2][2]["params"], {"q": "Sofa"})

    def test_fetches_category_subtree_with_application_token(self):
        session = FakeSession()
        client = EbayTaxonomyClient(
            config=EbayApiConfig(
                client_id="client-id",
                client_secret="client-secret",
                base_url="https://api.sandbox.ebay.com",
                token_url="https://api.sandbox.ebay.com/identity/v1/oauth2/token",
                connect_timeout=8,
                read_timeout=20,
            ),
            session=session,
        )

        self.assertEqual(client.category_tree(marketplace_id="EBAY_DE", category_id="123"), {"categorySuggestions": []})
        self.assertIn("get_category_subtree", session.calls[2][1][0])
        self.assertEqual(session.calls[2][2]["params"], {"category_id": "123"})

    def test_builds_authorization_url_and_exchanges_code(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )

        params = parse_qs(urlparse(client.authorization_url(state="signed-state")).query)
        self.assertEqual(params["client_id"], ["client-id"])
        self.assertEqual(params["redirect_uri"], ["sandbox-runame"])
        self.assertEqual(params["prompt"], ["login"])
        self.assertEqual(params["state"], ["signed-state"])
        self.assertEqual(client.exchange_code(code="one-time-code")["refresh_token"], "refresh-token")

    def test_loads_seller_locations_and_policies_with_refresh_token(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            response = client.seller_setup(account="jv", marketplace_id="EBAY_DE")

        self.assertEqual(response["locations"], {"locations": []})
        self.assertEqual(response["fulfillment_policies"], {"fulfillmentPolicies": []})
        self.assertEqual(response["payment_policies"], {"paymentPolicies": []})
        self.assertEqual(response["return_policies"], {"returnPolicies": []})
        self.assertEqual(session.calls[0][2]["data"], {"grant_type": "refresh_token", "refresh_token": "refresh-token"})
        self.assertEqual(session.calls[2][2]["params"], {"marketplace_id": "EBAY_DE"})

    def test_creates_inventory_location_with_seller_access_token(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig(
                client_id="client-id",
                client_secret="client-secret",
                base_url="https://api.sandbox.ebay.com",
                token_url="https://api.sandbox.ebay.com/identity/v1/oauth2/token",
                connect_timeout=8,
                read_timeout=20,
            ),
            session=session,
        )

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            client.create_inventory_location(
                account="jv",
                merchant_location_key="jv-main",
                name="JV Main Warehouse",
                address={"postalCode": "40210", "country": "DE"},
            )

        request = session.calls[1]
        self.assertEqual(request[0], "post")
        self.assertTrue(request[1][0].endswith("/sell/inventory/v1/location/jv-main"))
        self.assertEqual(request[2]["json"]["location"]["address"], {"postalCode": "40210", "country": "DE"})

    def test_opts_in_seller_to_business_policies(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            client.opt_in_to_selling_policy_management(account="jv")

        request = session.calls[1]
        self.assertEqual(request[0], "post")
        self.assertTrue(request[1][0].endswith("/sell/account/v1/program/opt_in"))
        self.assertEqual(request[2]["json"], {"programType": "SELLING_POLICY_MANAGEMENT"})

    def test_seller_transport_error_is_safely_identified(self):
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=FakeSession(),
        )

        with patch.object(client._session, "post", side_effect=requests.ConnectionError), self.assertRaises(EbayApiError) as context:
            client._seller_post(token="access-token", path="/sell/account/v1/program/opt_in", payload={}, operation="selling_policy_management_opt_in")

        self.assertEqual(context.exception.details, {"kind": "ConnectionError"})

    def test_creates_each_supported_seller_policy(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )
        policy = {
            "name": "Sandbox policy",
            "marketplaceId": "EBAY_DE",
            "categoryTypes": [{"name": "ALL_EXCLUDING_MOTORS_VEHICLES"}],
        }

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            for policy_type, path, policy_id in (
                ("fulfillment", "/sell/account/v1/fulfillment_policy", "fulfillmentPolicyId"),
                ("payment", "/sell/account/v1/payment_policy", "paymentPolicyId"),
                ("return", "/sell/account/v1/return_policy", "returnPolicyId"),
            ):
                result = client.create_seller_policy(account="jv", policy_type=policy_type, policy=policy)
                self.assertIn(policy_id, result)
                self.assertTrue(session.calls[-1][1][0].endswith(path))

    def test_lists_only_valid_shipping_services_for_ebay_de(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            result = client.shipping_services(account="jv", marketplace_id="EBAY_DE")

        self.assertEqual(result["services"], [{"shipping_service_code": "DE_DHLPaket", "shipping_carrier_code": "DHL", "description": "Standard", "international": False, "shipping_category": "STANDARD", "cost_types": ["Flat"]}])
        request = session.calls[1]
        self.assertTrue(request[1][0].endswith("/ws/api.dll"))
        self.assertEqual(request[2]["headers"]["X-EBAY-API-SITEID"], "77")
        self.assertEqual(request[2]["headers"]["X-EBAY-API-CALL-NAME"], "GeteBayDetails")

    def test_creates_inventory_item_and_offer_with_seller_access_token(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            client.create_or_replace_inventory_item(
                account="jv",
                sku="sku-1",
                item={"availability": {"shipToLocationAvailability": {"quantity": 1}}},
            )
            offer = client.create_offer(account="jv", offer={"sku": "sku-1", "marketplaceId": "EBAY_DE"})

        self.assertEqual(session.calls[1][0], "put")
        self.assertTrue(session.calls[1][1][0].endswith("/sell/inventory/v1/inventory_item/sku-1"))
        self.assertEqual(session.calls[1][2]["headers"]["Content-Language"], "de-DE")
        self.assertEqual(session.calls[-1][0], "post")
        self.assertTrue(session.calls[-1][1][0].endswith("/sell/inventory/v1/offer"))
        self.assertEqual(session.calls[-1][2]["headers"]["Content-Language"], "de-DE")
        self.assertEqual(offer, {"offerId": "offer-id"})

    def test_reads_inventory_items_and_single_sku_with_seller_access_token(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            client.inventory_items(account="dep", limit=25, offset=50)
            client.inventory_item(account="dep", sku="sku-1")
            client.offer(account="dep", offer_id="offer-1")

        inventory_calls = [call for call in session.calls if call[0] == "get" and "/sell/inventory/v1/inventory_item" in call[1][0]]
        self.assertTrue(inventory_calls[0][1][0].endswith("/sell/inventory/v1/inventory_item"))
        self.assertEqual(inventory_calls[0][2]["params"], {"limit": "25", "offset": "50"})
        self.assertTrue(inventory_calls[1][1][0].endswith("/sell/inventory/v1/inventory_item/sku-1"))
        self.assertEqual(inventory_calls[1][2]["params"], {})
        self.assertTrue(session.calls[-1][1][0].endswith("/sell/inventory/v1/offer/offer-1"))

    def test_updates_publishes_and_withdraws_inventory_offer(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            client.update_offer(account="jv", offer_id="offer-id", offer={"sku": "sku-1", "marketplaceId": "EBAY_DE"})
            client.publish_offer(account="jv", offer_id="offer-id")
            client.bulk_update_price_quantity(account="jv", sku="sku-1", offer_id="offer-id", quantity=2, price="19.99")
            client.withdraw_offer(account="jv", offer_id="offer-id")

        operation_calls = [call for call in session.calls if "/sell/inventory/" in call[1][0]]
        self.assertTrue(operation_calls[0][1][0].endswith("/sell/inventory/v1/offer/offer-id"))
        self.assertTrue(operation_calls[1][1][0].endswith("/sell/inventory/v1/offer/offer-id/publish"))
        self.assertEqual(operation_calls[2][2]["json"]["requests"][0]["shipToLocationAvailability"], {"quantity": 2})
        self.assertEqual(operation_calls[2][2]["json"]["requests"][0]["offers"][0]["price"], {"currency": "EUR", "value": "19.99"})
        self.assertTrue(operation_calls[3][1][0].endswith("/sell/inventory/v1/offer/offer-id/withdraw"))

    def test_uses_trading_api_item_id_for_legacy_operations(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            client.revise_legacy_fixed_price_listing(
                account="dep", item_id="205926392508", marketplace_id="EBAY_DE", quantity=2, price="199.99"
            )
            client.revise_legacy_fixed_price_variation(
                account="dep",
                item_id="205926392508",
                marketplace_id="EBAY_DE",
                variation_sku="JVM4062292372025-YELLOW",
                quantity=2,
                price="199.99",
            )
            client.end_legacy_fixed_price_listing(account="dep", item_id="205926392508", marketplace_id="EBAY_DE")
            client.relist_legacy_fixed_price_listing(
                account="dep", item_id="205926392508", marketplace_id="EBAY_DE", quantity=2, price="199.99"
            )

        operation_calls = [call for call in session.calls if call[1][0].endswith("/ws/api.dll")]
        self.assertEqual(operation_calls[0][2]["headers"]["X-EBAY-API-CALL-NAME"], "ReviseFixedPriceItem")
        self.assertIn(b"<ItemID>205926392508</ItemID>", operation_calls[0][2]["data"])
        self.assertIn(b"<Variations><Variation><SKU>JVM4062292372025-YELLOW</SKU>", operation_calls[1][2]["data"])
        self.assertEqual(operation_calls[2][2]["headers"]["X-EBAY-API-CALL-NAME"], "EndFixedPriceItem")
        self.assertEqual(operation_calls[3][2]["headers"]["X-EBAY-API-CALL-NAME"], "RelistFixedPriceItem")

    def test_gets_listing_by_ebay_item_id(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            listing = client.listing(account="dep", item_id="205926392508", marketplace_id="EBAY_DE")

        request = session.calls[1]
        self.assertEqual(request[0], "post")
        self.assertEqual(request[2]["headers"]["X-EBAY-API-CALL-NAME"], "GetItem")
        self.assertIn(b"<DetailLevel>ReturnAll</DetailLevel>", request[2]["data"])
        self.assertEqual(listing["sku"], "JVM4062292372025")
        self.assertEqual(listing["seller"], "depotum")
        self.assertEqual(listing["quantity"], "4")
        self.assertEqual(listing["quantity_sold"], "2")
        self.assertEqual(listing["price"], "199.99")
        self.assertEqual(listing["currency"], "EUR")
        self.assertEqual(listing["listing_type"], "")
        self.assertFalse(listing["has_variations"])
        self.assertEqual(listing["identifiers"], {"EAN": ["4062292372025"]})

    def test_get_listing_exposes_variation_sku_price_and_available_quantity_inputs(self):
        response = FakeResponse(
            {},
            content=b'''<?xml version="1.0" encoding="utf-8"?>
<GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Success</Ack><Item>
  <ItemID>205926392508</ItemID><ListingType>FixedPriceItem</ListingType>
  <Variations><Variation><SKU>yellow</SKU><Quantity>5</Quantity><StartPrice currencyID="EUR">199.99</StartPrice>
  <VariationProductListingDetails><EAN>4062292372025</EAN></VariationProductListingDetails>
  <SellingStatus><QuantitySold>2</QuantitySold></SellingStatus></Variation></Variations>
</Item></GetItemResponse>''',
        )

        listing = _listing_payload(response=response, marketplace_id="EBAY_DE")

        self.assertTrue(listing["has_variations"])
        self.assertEqual(
            listing["variations"],
            [{"sku": "yellow", "quantity": "5", "quantity_sold": "2", "price": "199.99", "currency": "EUR", "identifiers": {"EAN": ["4062292372025"]}}],
        )

    def test_get_listing_reads_variation_ean_from_variation_specifics(self):
        response = FakeResponse(
            {},
            content=b'''<?xml version="1.0" encoding="utf-8"?>
<GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Success</Ack><Item>
  <ItemID>205926392508</ItemID><ListingType>FixedPriceItem</ListingType>
  <Variations><Variation><SKU>yellow</SKU><Quantity>5</Quantity><StartPrice currencyID="EUR">199.99</StartPrice>
  <VariationSpecifics><NameValueList><Name>EAN</Name><Value>4062292372025</Value></NameValueList></VariationSpecifics>
  </Variation></Variations>
</Item></GetItemResponse>''',
        )

        listing = _listing_payload(response=response, marketplace_id="EBAY_DE")

        self.assertEqual(listing["variations"][0]["identifiers"], {"EAN": ["4062292372025"]})

    def test_matches_legacy_variation_ean_to_its_variation_sku(self):
        listing = {
            "item_id": "205926392508",
            "identifiers": {},
            "variations": [{"sku": "yellow", "identifiers": {"EAN": ["4062292372025"]}}],
        }

        self.assertEqual(_legacy_ean_matches(listings=[listing], source_ean="4062292372025"), [(listing, "yellow")])

    def test_gets_paginated_active_listings(self):
        session = FakeSession()
        client = EbayOAuthClient(
            config=EbayApiConfig("client-id", "client-secret", "https://api.sandbox.ebay.com", "https://api.sandbox.ebay.com/identity/v1/oauth2/token", 8, 20),
            ru_name="sandbox-runame",
            session=session,
        )

        with patch("ebay_service.client.load_refresh_token", return_value="refresh-token"):
            result = client.active_listings(account="dep", marketplace_id="EBAY_DE", page=2, limit=50)

        request = session.calls[1]
        self.assertEqual(request[2]["headers"]["X-EBAY-API-CALL-NAME"], "GetMyeBaySelling")
        self.assertIn(b"<PageNumber>2</PageNumber>", request[2]["data"])
        self.assertEqual(result["total"], "1")
        self.assertEqual(result["listings"][0]["identifiers"], {"EAN": ["4062292372025"]})


class EbayLegacyVariationOperationTests(SimpleTestCase):
    @patch("ebay_service.listing_operations._save_listing", return_value={"status": "active"})
    @patch("ebay_service.listing_operations._resolve_legacy_listing", return_value=("205926392508", None))
    @patch("ebay_service.listing_operations.EbayOAuthClient")
    def test_updates_selected_legacy_variation_with_current_price_and_available_quantity(self, client_class, _resolve, _save):
        client = client_class.return_value
        client.listing.return_value = {
            "listing_type": "FixedPriceItem",
            "has_variations": True,
            "variations": [{"sku": "yellow", "quantity": "5", "quantity_sold": "2", "price": "199.99", "currency": "EUR"}],
        }

        execute_listing_operation(
            account="dep",
            marketplace_id="EBAY_DE",
            operation="update",
            listing_mode="legacy",
            item_id="205926392508",
            variation_sku="yellow",
            price="189.99",
        )

        client.revise_legacy_fixed_price_variation.assert_called_once_with(
            account="dep",
            item_id="205926392508",
            marketplace_id="EBAY_DE",
            variation_sku="yellow",
            quantity=3,
            price="189.99",
            currency="EUR",
        )


class EbayInventoryPublishValidationTests(SimpleTestCase):
    def test_offer_merge_preserves_current_settings_and_removes_read_only_fields(self):
        offer = _merge_inventory_offer(
            current={
                "offerId": "offer-1",
                "listing": {"listingId": "123"},
                "marketplaceId": "EBAY_DE",
                "sku": "old-sku",
                "listingPolicies": {"paymentPolicyId": "payment-1", "returnPolicyId": "return-1"},
            },
            patch={"listingPolicies": {"fulfillmentPolicyId": "fulfillment-1"}},
            sku="4062292372025",
            marketplace_id="EBAY_DE",
        )

        self.assertNotIn("offerId", offer)
        self.assertNotIn("listing", offer)
        self.assertEqual(offer["sku"], "4062292372025")
        self.assertEqual(
            offer["listingPolicies"],
            {"paymentPolicyId": "payment-1", "returnPolicyId": "return-1", "fulfillmentPolicyId": "fulfillment-1"},
        )

    def test_prepare_publish_offer_applies_canonical_price_and_quantity(self):
        offer = _prepare_inventory_offer(
            offer={"categoryId": "123"},
            sku="4062292372025",
            marketplace_id="EBAY_DE",
            quantity=2,
            price="199.99",
            currency="EUR",
        )

        self.assertEqual(offer["sku"], "4062292372025")
        self.assertEqual(offer["marketplaceId"], "EBAY_DE")
        self.assertEqual(offer["availableQuantity"], 2)
        self.assertEqual(offer["pricingSummary"]["price"], {"currency": "EUR", "value": "199.99"})

    def test_publish_validation_returns_missing_fields_before_ebay_call(self):
        with self.assertRaises(EbayApiError) as error:
            _validate_inventory_publish_payload(inventory_item={}, offer={})

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(error.exception.operation, "publish_offer")
        self.assertIn("inventory_item.condition", error.exception.details["missing_fields"])
        self.assertIn("offer.merchantLocationKey", error.exception.details["missing_fields"])

    def test_bulk_update_rejects_failed_per_offer_result(self):
        with self.assertRaises(EbayApiError) as error:
            _raise_for_bulk_update_errors(
                {
                    "responses": [
                        {
                            "sku": "4062292372025",
                            "offerResponses": [{"offerId": "offer-1", "statusCode": 400, "errors": [{"errorId": 25001}]}],
                        }
                    ]
                }
            )

        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(error.exception.operation, "bulk_update_price_quantity")
        self.assertEqual(error.exception.details["responses"][0]["offerId"], "offer-1")


class EbayCredentialStoreTests(SimpleTestCase):
    @patch.dict(os.environ, {"EBAY_TOKEN_ENCRYPTION_KEY": "xqVc7R-czLE_Gc7xEXbHlASAf2KIfxE9F_C1Tj0glBI="})
    @patch("ebay_service.credentials.EbayOAuthCredential.objects.update_or_create")
    @patch("ebay_service.credentials.EbayOAuthCredential.objects.filter")
    def test_stores_encrypted_refresh_token(self, credential_filter, update_or_create):
        store_refresh_token(account="jv", refresh_token="refresh-token")
        encrypted = update_or_create.call_args.kwargs["defaults"]["refresh_token_encrypted"]
        credential_filter.return_value.only.return_value.first.return_value = SimpleNamespace(refresh_token_encrypted=encrypted)

        self.assertEqual(load_refresh_token(account="jv"), "refresh-token")
        self.assertNotEqual(encrypted, "refresh-token")
