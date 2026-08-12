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
            if operation is Operation.PUBLISH:
                url = f"{self.base_url}/api/v1/kaufland/products/create/"
            else:
                url = f"{self.base_url}/api/v1/kaufland/products/ean/change/"
            body = {"ean": ean, "controller": (channel.account or "jv").strip().lower(), **payload}
            response = self.http.request("POST", url, headers=headers, json=body)
            return AdapterResult(status_code=response.status_code, body=_json_or_text(response))

        if channel.marketplace is Marketplace.OTTO:
            profile = (channel.profile or channel.account or "jv").strip().lower()
            url = f"{self.base_url}/api/v1/otto/{profile}/products/upsert/"
            otto_payload = dict(payload)
            if channel.ean_source == "pool":
                otto_payload.update({"productReference": ean, "sku": ean, "ean": ean})
            response = self.http.request("POST", url, headers=headers, json=otto_payload)
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
            if operation is Operation.PUBLISH:
                create_payload = _build_xljv_create_payload(ean=ean, site=site, payload=payload)
                if site == "JV":
                    url = f"{self.base_url}/api/v1/jv/products/create-and-push/"
                    response = self.http.request("POST", url, headers=headers, params=params, json=create_payload)
                else:
                    url = f"{self.base_url}/api/v1/xl/products/create-and-push/"
                    response = self.http.request("POST", url, headers=headers, params={"site_key": site_key}, json=create_payload)
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


def _build_xljv_create_payload(*, ean: str, site: str, payload: dict) -> dict:
    image_urls = [str(value).strip() for value in payload.get("images", []) if str(value).strip()]
    title = str(payload.get("title") or "").strip()
    description = str(payload.get("description") or title).strip()
    primary_image = str(payload.get("image") or "").strip() or (image_urls[0] if image_urls else "")
    secondary_images = image_urls[1:] if image_urls and primary_image == image_urls[0] else image_urls

    create_payload = {
        "ean": ean,
        "source_model": str(payload.get("source_model") or ean).strip(),
        "source_sku": str(payload.get("source_sku") or "").strip(),
        "source_ean_field": str(payload.get("source_ean_field") or ean).strip(),
        "price": payload.get("price"),
        "quantity": payload.get("quantity", 1),
        "status": bool(payload.get("status", True)),
        "image": primary_image,
        "images": [{"image": image, "sort_order": index} for index, image in enumerate(secondary_images)],
        "descriptions": [
            {
                "language_id": 1,
                "name": title,
                "description": description,
                "tag": "",
                "meta_title": title,
                "meta_description": description,
                "meta_keyword": "",
            }
        ],
    }
    for field in ("manufacturer_id", "stock_status_id", "tax_class_id", "date_available", "categories", "stores", "specials"):
        if field in payload:
            create_payload[field] = payload[field]
    if site == "JV" and "jv_fields" in payload:
        create_payload["jv_fields"] = payload["jv_fields"]
    return create_payload
