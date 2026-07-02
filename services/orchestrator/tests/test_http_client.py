from __future__ import annotations

import httpx

from src.sofort_orchestrator.infra import http_client as http_client_module
from src.sofort_orchestrator.infra.http_client import HttpClient


class FakeSyncClient:
    def __init__(self, *, timeout, trust_env, limits):
        self.timeout = timeout
        self.trust_env = trust_env
        self.limits = limits
        self.calls: list[dict] = []
        self.closed = False

<<<<<<< HEAD
    def request(self, method, url, *, headers, params=None, json=None, timeout=None):
=======
    def request(self, method, url, *, headers, params=None, json=None):
>>>>>>> origin/main
        self.calls.append(
            {
                "method": method,
                "url": url,
                "headers": headers,
                "params": params,
                "json": json,
<<<<<<< HEAD
                "timeout": timeout,
=======
>>>>>>> origin/main
            }
        )
        return httpx.Response(200, json={"ok": True}, request=httpx.Request(method, url))

    def close(self):
        self.closed = True


def test_http_client_reuses_single_httpx_client(monkeypatch):
    created_clients: list[FakeSyncClient] = []

    def fake_client_factory(*, timeout, trust_env, limits):
        client = FakeSyncClient(timeout=timeout, trust_env=trust_env, limits=limits)
        created_clients.append(client)
        return client

    monkeypatch.setattr(http_client_module.httpx, "Client", fake_client_factory)

    client = HttpClient(timeout_seconds=8, retries=2)

    first = client.request("GET", "http://example.test/one", headers={"X-Request-Id": "r1"})
    second = client.request("POST", "http://example.test/two", headers={"X-Request-Id": "r2"}, json={"ok": True})

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(created_clients) == 1
    assert created_clients[0].trust_env is False
    assert created_clients[0].limits.max_connections == 20
    assert created_clients[0].limits.max_keepalive_connections == 10
    assert len(created_clients[0].calls) == 2

    client.close()

    assert created_clients[0].closed is True


def test_http_client_recreates_httpx_client_after_close(monkeypatch):
    created_clients: list[FakeSyncClient] = []

    def fake_client_factory(*, timeout, trust_env, limits):
        client = FakeSyncClient(timeout=timeout, trust_env=trust_env, limits=limits)
        created_clients.append(client)
        return client

    monkeypatch.setattr(http_client_module.httpx, "Client", fake_client_factory)

    client = HttpClient(timeout_seconds=8, retries=0)
    client.request("GET", "http://example.test/one", headers={"X-Request-Id": "r1"})
    client.close()
    client.request("GET", "http://example.test/two", headers={"X-Request-Id": "r2"})

    assert len(created_clients) == 2
    assert created_clients[0].closed is True
    assert created_clients[1].closed is False
