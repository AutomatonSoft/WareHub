from __future__ import annotations

from dataclasses import dataclass

from .http_client import HttpClient


@dataclass
class GatewayResult:
    status_code: int
    body: dict


class ProductEditorGateway:
    def __init__(self, base_url: str, http_client: HttpClient, service_auth_token: str = "") -> None:
        self.base_url = base_url
        self.http = http_client
        self.service_auth_token = service_auth_token

    def _headers(self, request_id: str, *, content_type: str | None = None) -> dict[str, str]:
        headers = {"X-Request-Id": request_id, "Accept": "application/json"}
        if content_type:
            headers["Content-Type"] = content_type
        if self.service_auth_token:
            headers["X-WareHub-Service-Token"] = self.service_auth_token
        return headers

    def fetch_hood_by_ean(self, *, ean: str, account: str, request_id: str) -> GatewayResult:
        headers = self._headers(request_id)
        url = f"{self.base_url}/api/v1/hood/items/by-ean/{ean}/"
        response = self.http.request("GET", url, headers=headers, params={"account": account})
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def patch_hood_by_ean(self, *, ean: str, account: str, request_id: str, payload: dict) -> GatewayResult:
        headers = self._headers(request_id, content_type="application/json")
        url = f"{self.base_url}/api/v1/hood/items/by-ean/{ean}/"
        response = self.http.request("PATCH", url, headers=headers, params={"account": account}, json=payload)
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def fetch_jv_sites_by_ean(self, *, ean: str, request_id: str) -> GatewayResult:
        headers = self._headers(request_id)
        url = f"{self.base_url}/api/v1/jv/sites/by-ean/{ean}/"
        response = self.http.request("GET", url, headers=headers, params={"site": "JV"})
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def fetch_jv_local_by_ean(self, *, ean: str, site_key: str, request_id: str) -> GatewayResult:
        headers = self._headers(request_id)
        url = f"{self.base_url}/api/v1/jv/products/local-by-ean/{ean}/"
        response = self.http.request("GET", url, headers=headers, params={"site": "JV", "site_key": site_key})
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def sync_jv_by_ean(self, *, ean: str, site_key: str, request_id: str) -> GatewayResult:
        headers = self._headers(request_id, content_type="application/json")
        url = f"{self.base_url}/api/v1/jv/products/sync-by-ean/{ean}/"
        response = self.http.request("POST", url, headers=headers, params={"site": "JV", "site_key": site_key}, json={})
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def apply_jv_batch_by_ean(self, *, ean: str, request_id: str, payload: dict) -> GatewayResult:
        headers = self._headers(request_id, content_type="application/json")
        url = f"{self.base_url}/api/v1/jv/batch/update-by-ean/{ean}/apply/"
        response = self.http.request("POST", url, headers=headers, json=payload)
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def fetch_jv_batch_job_status(self, *, job_id: int, request_id: str) -> GatewayResult:
        headers = self._headers(request_id)
        url = f"{self.base_url}/api/v1/jv/batch/jobs/{job_id}/"
        response = self.http.request("GET", url, headers=headers)
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def fetch_xl_sites_by_ean(self, *, ean: str, request_id: str, site_key: str | None = None) -> GatewayResult:
        headers = self._headers(request_id)
        url = f"{self.base_url}/api/v1/xl/sites/by-ean/{ean}/"
        params = {"site": "XL"}
        if site_key:
            params["site_key"] = site_key
        response = self.http.request("GET", url, headers=headers, params=params)
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def fetch_xl_local_by_ean(self, *, ean: str, site_key: str, request_id: str) -> GatewayResult:
        headers = self._headers(request_id)
        url = f"{self.base_url}/api/v1/xl/products/local-by-ean/{ean}/"
        response = self.http.request("GET", url, headers=headers, params={"site": "XL", "site_key": site_key})
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def sync_xl_by_ean(self, *, ean: str, site_key: str, request_id: str) -> GatewayResult:
        headers = self._headers(request_id, content_type="application/json")
        url = f"{self.base_url}/api/v1/xl/products/sync-by-ean/{ean}/"
        response = self.http.request("POST", url, headers=headers, params={"site": "XL", "site_key": site_key}, json={})
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def apply_xl_batch_by_ean(self, *, ean: str, request_id: str, payload: dict) -> GatewayResult:
        headers = self._headers(request_id, content_type="application/json")
        url = f"{self.base_url}/api/v1/xl/batch/update-by-ean/{ean}/apply/"
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
