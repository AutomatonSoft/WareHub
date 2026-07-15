from __future__ import annotations

from src.sofort_orchestrator.domain.models import ChannelTarget, Marketplace, Operation
from src.sofort_orchestrator.infra.marketplace_adapters import MarketplaceAdapters
from src.sofort_orchestrator.infra.product_editor_gateway import ProductEditorGateway


class FakeResponse:
    def __init__(self, status_code=200, body=None):
        self.status_code = status_code
        self._body = body if body is not None else {"ok": True}
        self.text = ""

    def json(self):
        return self._body


class CapturingHttpClient:
    def __init__(self):
        self.calls = []

    def request(self, method, url, *, headers, params=None, json=None):
        self.calls.append(
            {
                "method": method,
                "url": url,
                "headers": headers,
                "params": params,
                "json": json,
            }
        )
        return FakeResponse()


def test_hood_contract_path_and_params():
    fake_http = CapturingHttpClient()
    adapters = MarketplaceAdapters(base_url="http://database-service:8000", http_client=fake_http)
    adapters.dispatch(
        ean="4012345678901",
        request_id="r1",
        channel=ChannelTarget(marketplace=Marketplace.HOOD, account="jv"),
        payload={"title": "Desk"},
    )
    call = fake_http.calls[0]
    assert call["method"] == "PATCH"
    assert call["url"] == "http://database-service:8000/api/v1/hood/items/by-ean/4012345678901/"
    assert call["params"] == {"account": "jv"}


def test_hood_publish_contract_uses_post():
    fake_http = CapturingHttpClient()
    adapters = MarketplaceAdapters(base_url="http://database-service:8000", http_client=fake_http)
    adapters.dispatch(
        ean="4012345678901",
        request_id="r1",
        channel=ChannelTarget(marketplace=Marketplace.HOOD, account="xl"),
        payload={"title": "Desk", "price": "19.99", "quantity": 1},
        operation=Operation.PUBLISH,
    )
    call = fake_http.calls[0]
    assert call["method"] == "POST"
    assert call["url"] == "http://database-service:8000/api/v1/hood/items/by-ean/4012345678901/"
    assert call["params"] == {"account": "xl"}


def test_kaufland_contract_path_and_body():
    fake_http = CapturingHttpClient()
    adapters = MarketplaceAdapters(base_url="http://database-service:8000", http_client=fake_http)
    adapters.dispatch(
        ean="4012345678901",
        request_id="r2",
        channel=ChannelTarget(marketplace=Marketplace.KAUFLAND, account="xl"),
        payload={"title": "Desk"},
    )
    call = fake_http.calls[0]
    assert call["method"] == "POST"
    assert call["url"] == "http://database-service:8000/api/v1/kaufland/products/ean/change/"
    assert call["json"]["ean"] == "4012345678901"
    assert call["json"]["controller"] == "xl"


def test_product_editor_kaufland_discover_contract_path():
    fake_http = CapturingHttpClient()
    gateway = ProductEditorGateway(base_url="http://database-service:8000", http_client=fake_http)

    gateway.fetch_kaufland_by_ean(ean="4012345678901", controller="jv", request_id="r-kaufland")

    call = fake_http.calls[0]
    assert call["method"] == "GET"
    assert call["url"] == "http://database-service:8000/api/v1/kaufland/4012345678901/jv/"
    assert call["params"] is None


def test_otto_contract_path_with_profile():
    fake_http = CapturingHttpClient()
    adapters = MarketplaceAdapters(base_url="http://database-service:8000", http_client=fake_http)
    adapters.dispatch(
        ean="4012345678901",
        request_id="r3",
        channel=ChannelTarget(marketplace=Marketplace.OTTO, profile="jv"),
        payload={"productReference": "OTTO-1"},
    )
    call = fake_http.calls[0]
    assert call["method"] == "POST"
    assert call["url"] == "http://database-service:8000/api/v1/otto/jv/products/upsert/"


def test_xl_contract_path_and_query_params():
    fake_http = CapturingHttpClient()
    adapters = MarketplaceAdapters(base_url="http://database-service:8000", http_client=fake_http)
    adapters.dispatch(
        ean="4012345678901",
        request_id="r4",
        channel=ChannelTarget(marketplace=Marketplace.XLJV, site="XL", site_key="DE"),
        payload={"price": "19.99"},
    )
    call = fake_http.calls[0]
    assert call["method"] == "PATCH"
    assert call["url"] == "http://database-service:8000/api/v1/xl/products/update-by-ean/4012345678901/"
    assert call["params"] == {"site": "XL", "site_key": "DE"}
