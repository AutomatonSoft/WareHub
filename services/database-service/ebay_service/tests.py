import os
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from django.test import SimpleTestCase
from django.urls import resolve
from django.core import signing

from .client import EbayApiConfig, EbayApiError, EbayOAuthClient, EbayTaxonomyClient
from .credentials import load_refresh_token, store_refresh_token
from .views import _OAUTH_STATE_SALT, _exchange_code_response, _seller_setup_error_response


class FakeResponse:
    def __init__(self, payload, *, ok=True, status_code=200):
        self._payload = payload
        self.ok = ok
        self.status_code = status_code

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self):
        self.calls = []

    def post(self, *args, **kwargs):
        self.calls.append(("post", args, kwargs))
        if kwargs.get("data", {}).get("grant_type") == "authorization_code":
            return FakeResponse({"access_token": "access-token", "refresh_token": "refresh-token"})
        return FakeResponse({"access_token": "test-token"})

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


class EbayRouteTests(SimpleTestCase):
    def test_taxonomy_routes_are_registered(self):
        self.assertEqual(resolve("/api/v1/ebay/taxonomy/category-suggestions/").url_name, "ebay-category-suggestions-v1")
        self.assertEqual(resolve("/api/v1/ebay/taxonomy/category-aspects/").url_name, "ebay-category-aspects-v1")
        self.assertEqual(resolve("/api/v1/ebay/oauth/callback/").url_name, "ebay-oauth-callback-v1")
        self.assertEqual(resolve("/api/v1/ebay/seller/setup/").url_name, "ebay-seller-setup-v1")

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
        response = _seller_setup_error_response(EbayApiError("upstream failed", status_code=500, details={"errors": ["temporary"]}))

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["details"], {"errors": ["temporary"]})


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
