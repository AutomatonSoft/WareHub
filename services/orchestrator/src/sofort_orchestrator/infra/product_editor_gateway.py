from __future__ import annotations

from dataclasses import dataclass

from .http_client import HttpClient


@dataclass
class GatewayResult:
    status_code: int
    body: dict


class ProductEditorGateway:
    def __init__(self, base_url: str, http_client: HttpClient) -> None:
        self.base_url = base_url
        self.http = http_client

    def fetch_hood_by_ean(self, *, ean: str, account: str, request_id: str) -> GatewayResult:
        headers = {"X-Request-Id": request_id, "Accept": "application/json"}
        url = f"{self.base_url}/api/hood/items/by-ean/{ean}/"
        response = self.http.request("GET", url, headers=headers, params={"account": account})
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def patch_hood_by_ean(self, *, ean: str, account: str, request_id: str, payload: dict) -> GatewayResult:
        headers = {"X-Request-Id": request_id, "Content-Type": "application/json"}
        url = f"{self.base_url}/api/hood/items/by-ean/{ean}/"
        response = self.http.request("PATCH", url, headers=headers, params={"account": account}, json=payload)
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def fetch_jv_sites_by_ean(self, *, ean: str, request_id: str) -> GatewayResult:
        headers = {"X-Request-Id": request_id, "Accept": "application/json"}
        url = f"{self.base_url}/api/jv/sites/by-ean/{ean}/"
        response = self.http.request("GET", url, headers=headers, params={"site": "JV"})
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def fetch_jv_local_by_ean(self, *, ean: str, site_key: str, request_id: str) -> GatewayResult:
        headers = {"X-Request-Id": request_id, "Accept": "application/json"}
        url = f"{self.base_url}/api/jv/products/local-by-ean/{ean}/"
        response = self.http.request("GET", url, headers=headers, params={"site": "JV", "site_key": site_key})
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def sync_jv_by_ean(self, *, ean: str, site_key: str, request_id: str) -> GatewayResult:
        headers = {"X-Request-Id": request_id, "Content-Type": "application/json"}
        url = f"{self.base_url}/api/jv/products/sync-by-ean/{ean}/"
        response = self.http.request("POST", url, headers=headers, params={"site": "JV", "site_key": site_key}, json={})
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def apply_jv_batch_by_ean(self, *, ean: str, request_id: str, payload: dict) -> GatewayResult:
        headers = {"X-Request-Id": request_id, "Content-Type": "application/json"}
        url = f"{self.base_url}/api/jv/batch/update-by-ean/{ean}/apply/"
        response = self.http.request("POST", url, headers=headers, json=payload)
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))


def _json_or_text(response) -> dict:
    try:
        body = response.json()
        if isinstance(body, dict):
            return body
        return {"data": body}
    except Exception:
        return {"raw": response.text[:1500]}
