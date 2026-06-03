from __future__ import annotations

from dataclasses import dataclass

from ..domain.models import ChannelTarget, Marketplace
from .http_client import HttpClient


@dataclass
class AdapterResult:
    status_code: int
    body: dict


class MarketplaceAdapters:
    def __init__(self, base_url: str, http_client: HttpClient) -> None:
        self.base_url = base_url
        self.http = http_client

    def dispatch(self, *, ean: str, request_id: str, channel: ChannelTarget, payload: dict) -> AdapterResult:
        headers = {"X-Request-Id": request_id, "Content-Type": "application/json"}

        if channel.marketplace is Marketplace.HOOD:
            account = (channel.account or "jv").strip().lower()
            url = f"{self.base_url}/api/hood/items/by-ean/{ean}/"
            response = self.http.request("PATCH", url, headers=headers, params={"account": account}, json=payload)
            return AdapterResult(status_code=response.status_code, body=_json_or_text(response))

        if channel.marketplace is Marketplace.KAUFLAND:
            url = f"{self.base_url}/api/kaufland/products/ean/change/"
            body = {"ean": ean, "controller": (channel.account or "jv").strip().lower(), **payload}
            response = self.http.request("POST", url, headers=headers, json=body)
            return AdapterResult(status_code=response.status_code, body=_json_or_text(response))

        if channel.marketplace is Marketplace.OTTO:
            profile = (channel.profile or channel.account or "jv").strip().lower()
            url = f"{self.base_url}/api/otto/{profile}/products/upsert/"
            response = self.http.request("POST", url, headers=headers, json=payload)
            return AdapterResult(status_code=response.status_code, body=_json_or_text(response))

        if channel.marketplace is Marketplace.XLJV:
            site = (channel.site or "XL").strip().upper()
            params = {"site": site}
            site_key = (channel.site_key or "").strip().upper()
            if site_key:
                params["site_key"] = site_key
            route_site = "jv" if site == "JV" else "xl"
            url = f"{self.base_url}/api/{route_site}/products/update-by-ean/{ean}/"
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
