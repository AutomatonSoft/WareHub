from urllib.parse import parse_qs, urlparse

from django.test import SimpleTestCase
from django.urls import resolve

from .client import EbayApiConfig, EbayOAuthClient, EbayTaxonomyClient


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
        if "get_default_category_tree_id" in args[0]:
            return FakeResponse({"categoryTreeId": "123"})
        return FakeResponse({"categorySuggestions": []})


class EbayRouteTests(SimpleTestCase):
    def test_taxonomy_routes_are_registered(self):
        self.assertEqual(resolve("/api/v1/ebay/taxonomy/category-suggestions/").url_name, "ebay-category-suggestions-v1")
        self.assertEqual(resolve("/api/v1/ebay/taxonomy/category-aspects/").url_name, "ebay-category-aspects-v1")
        self.assertEqual(resolve("/api/v1/ebay/oauth/callback/").url_name, "ebay-oauth-callback-v1")


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
