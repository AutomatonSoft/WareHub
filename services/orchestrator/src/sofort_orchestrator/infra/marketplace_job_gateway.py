from __future__ import annotations

from dataclasses import dataclass

from .http_client import HttpClient


@dataclass
class GatewayResult:
    status_code: int
    body: dict


class MarketplaceJobGateway:
    def __init__(
        self,
        base_url: str,
        http_client: HttpClient,
        service_auth_token: str = "",
        timeout_seconds: float | None = None,
    ) -> None:
        self.base_url = base_url
        self.http = http_client
        self.service_auth_token = service_auth_token
        self.timeout_seconds = timeout_seconds

    def _headers(self, request_id: str) -> dict[str, str]:
        headers = {
            "X-Request-Id": request_id,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self.service_auth_token:
            headers["X-WareHub-Service-Token"] = self.service_auth_token
        return headers

    def toggle_jv_by_kid(self, *, kid_number: str, inactive: bool, request_id: str) -> GatewayResult:
        response = self.http.request(
            "POST",
            f"{self.base_url}/api/v1/marketplace/jv/deactivate-sofort-by-kid/",
            headers=self._headers(request_id),
            json={"kid_number": kid_number, "inactive": inactive},
            timeout_seconds=self.timeout_seconds,
        )
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def toggle_hood_by_kid(self, *, kid_number: str, inactive: bool, request_id: str) -> GatewayResult:
        response = self.http.request(
            "POST",
            f"{self.base_url}/api/v1/marketplace/hood/deactivate-by-kid/",
            headers=self._headers(request_id),
            json={"kid_number": kid_number, "inactive": inactive},
            timeout_seconds=self.timeout_seconds,
        )
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))


def _json_or_text(response) -> dict:
    try:
        body = response.json()
        if isinstance(body, dict):
            return body
        return {"data": body}
    except Exception:
        return {"raw": response.text[:1500]}
