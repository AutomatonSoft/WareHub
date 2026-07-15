from __future__ import annotations

from dataclasses import dataclass

from ..domain.models import ChannelTarget, Marketplace, Operation
from .http_client import HttpClient


@dataclass
class AdapterResult:
    status_code: int
    body: dict


class MarketplaceAdapters:
    def __init__(self, base_url: str, http_client: HttpClient, service_auth_token: str = "") -> None:
        self.base_url = base_url
        self.http = http_client
        self.service_auth_token = service_auth_token

    def dispatch(
        self,
        *,
        ean: str,
        request_id: str,
        channel: ChannelTarget,
        payload: dict,
        operation: Operation = Operation.UPDATE,
    ) -> AdapterResult:
        headers = {"X-Request-Id": request_id, "Content-Type": "application/json"}
        if self.service_auth_token:
            headers["X-WareHub-Service-Token"] = self.service_auth_token

        if channel.marketplace is Marketplace.HOOD:
            account = (channel.account or "jv").strip().lower()
            url = f"{self.base_url}/api/v1/hood/items/by-ean/{ean}/"
            method = "POST" if operation is Operation.PUBLISH else "PATCH"
            response = self.http.request(method, url, headers=headers, params={"account": account}, json=payload)
            return AdapterResult(status_code=response.status_code, body=_json_or_text(response))

        if channel.marketplace is Marketplace.KAUFLAND:
            url = f"{self.base_url}/api/v1/kaufland/products/ean/change/"
            body = {"ean": ean, "controller": (channel.account or "jv").strip().lower(), **payload}
            response = self.http.request("POST", url, headers=headers, json=body)
            return AdapterResult(status_code=response.status_code, body=_json_or_text(response))

        if channel.marketplace is Marketplace.OTTO:
            profile = (channel.profile or channel.account or "jv").strip().lower()
            url = f"{self.base_url}/api/v1/otto/{profile}/products/upsert/"
            response = self.http.request("POST", url, headers=headers, json=payload)
            return AdapterResult(status_code=response.status_code, body=_json_or_text(response))

        if channel.marketplace is Marketplace.XLJV:
            site = (channel.site or "XL").strip().upper()
            params = {"site": site}
            site_key = (channel.site_key or "").strip().upper()
            if site_key:
                params["site_key"] = site_key
            route_site = "jv" if site == "JV" else "xl"
            product_editor_mode = str(payload.get("__product_editor_mode") or "").strip().lower()
            if product_editor_mode == "jv_batch_apply":
                url = f"{self.base_url}/api/v1/jv/batch/update-by-artikelnr/{ean}/apply/"
                batch_payload = {key: value for key, value in payload.items() if not str(key).startswith("__product_editor_")}
                response = self.http.request("POST", url, headers=headers, json=batch_payload)
                return AdapterResult(status_code=response.status_code, body=_json_or_text(response))
            if product_editor_mode == "xl_batch_apply":
                url = f"{self.base_url}/api/v1/xl/batch/update-by-ean/{ean}/apply/"
                batch_payload = {key: value for key, value in payload.items() if not str(key).startswith("__product_editor_")}
                response = self.http.request("POST", url, headers=headers, json=batch_payload)
                return AdapterResult(status_code=response.status_code, body=_json_or_text(response))
            url = f"{self.base_url}/api/v1/{route_site}/products/update-by-ean/{ean}/"
            response = self.http.request("PATCH", url, headers=headers, params=params, json=payload)
            return AdapterResult(status_code=response.status_code, body=_json_or_text(response))

        raise ValueError(f"Unsupported marketplace: {channel.marketplace}")


def _json_or_text(response) -> dict:
    try:
        body = response.json()
        if isinstance(body, dict):
            return body
        return {"data": body}
    except Exception:
        return {"raw": response.text[:1500]}
