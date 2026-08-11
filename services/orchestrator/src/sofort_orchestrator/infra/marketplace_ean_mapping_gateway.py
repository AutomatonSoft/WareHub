from __future__ import annotations

from typing import Any

from .http_client import HttpClient


class MarketplaceEanMappingGatewayError(RuntimeError):
    """Raised when database-service cannot confirm a published marketplace EAN."""


class MarketplaceEanMappingGateway:
    def __init__(self, *, base_url: str, http_client: HttpClient, service_auth_token: str = "") -> None:
        self.base_url = base_url.rstrip("/")
        self.http = http_client
        self.service_auth_token = service_auth_token

    def confirm(
        self,
        *,
        request_id: str,
        kid_number: str,
        marketplace: str,
        account: str,
        ean: str,
        workspace: str = "sofort",
    ) -> dict[str, Any]:
        headers = {"X-Request-Id": request_id, "Content-Type": "application/json"}
        if self.service_auth_token:
            headers["X-WareHub-Service-Token"] = self.service_auth_token
        if workspace == "benim_depom":
            headers["X-WareHub-Inventory-Workspace"] = workspace
        response = self.http.request(
            "POST",
            f"{self.base_url}/api/v1/marketplace/ean-mappings/confirm/",
            headers=headers,
            json={
                "kid_number": kid_number,
                "marketplace": marketplace,
                "account": account,
                "ean": ean,
            },
        )
        if not 200 <= response.status_code < 300:
            raise MarketplaceEanMappingGatewayError(
                f"Marketplace EAN mapping confirmation failed with HTTP {response.status_code}."
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise MarketplaceEanMappingGatewayError("Marketplace EAN mapping returned a non-JSON response.") from exc
        if not isinstance(body, dict):
            raise MarketplaceEanMappingGatewayError("Marketplace EAN mapping returned an invalid response.")
        return body
