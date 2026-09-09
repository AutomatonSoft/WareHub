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

    def _headers(self, request_id: str, *, actor_login: str = "", actor_name: str = "") -> dict[str, str]:
        headers = {
            "X-Request-Id": request_id,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self.service_auth_token:
            headers["X-WareHub-Service-Token"] = self.service_auth_token
        if actor_login:
            headers["X-WareHub-Actor-Login"] = actor_login
        if actor_name:
            headers["X-WareHub-Actor-Name"] = actor_name
        return headers

    def toggle_all_by_kid(
        self,
        *,
        kid_number: str,
        inactive: bool,
        request_id: str,
        place: str | None = None,
        actor_login: str = "",
        actor_name: str = "",
    ) -> GatewayResult:
        body = {"kid_number": kid_number, "inactive": inactive}
        if place:
            body["place"] = place
        response = self.http.request(
            "POST",
            f"{self.base_url}/api/v1/marketplace/deactivate-by-kid/",
            headers=self._headers(request_id, actor_login=actor_login, actor_name=actor_name),
            json=body,
            timeout_seconds=self.timeout_seconds,
        )
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def toggle_local_statuses_by_kid(
        self, *, kid_number: str, inactive: bool, request_id: str, actor_login: str = "", actor_name: str = ""
    ) -> GatewayResult:
        response = self.http.request(
            "POST",
            f"{self.base_url}/api/v1/marketplace/local-statuses-by-kid/",
            headers=self._headers(request_id, actor_login=actor_login, actor_name=actor_name),
            json={"kid_number": kid_number, "inactive": inactive},
            timeout_seconds=self.timeout_seconds,
        )
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def toggle_jv_by_kid(
        self,
        *,
        kid_number: str,
        inactive: bool,
        request_id: str,
        place: str | None = None,
        actor_login: str = "",
        actor_name: str = "",
    ) -> GatewayResult:
        body = {"kid_number": kid_number, "inactive": inactive}
        if place:
            body["place"] = place
        response = self.http.request(
            "POST",
            f"{self.base_url}/api/v1/marketplace/jv/deactivate-sofort-by-kid/",
            headers=self._headers(request_id, actor_login=actor_login, actor_name=actor_name),
            json=body,
            timeout_seconds=self.timeout_seconds,
        )
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def toggle_xl_by_kid(
        self,
        *,
        kid_number: str,
        inactive: bool,
        request_id: str,
        place: str | None = None,
        actor_login: str = "",
        actor_name: str = "",
    ) -> GatewayResult:
        body = {"kid_number": kid_number, "inactive": inactive}
        if place:
            body["place"] = place
        response = self.http.request(
            "POST",
            f"{self.base_url}/api/v1/marketplace/xl/deactivate-by-kid/",
            headers=self._headers(request_id, actor_login=actor_login, actor_name=actor_name),
            json=body,
            timeout_seconds=self.timeout_seconds,
        )
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def toggle_hood_by_kid(
        self,
        *,
        kid_number: str,
        inactive: bool,
        request_id: str,
        place: str | None = None,
        actor_login: str = "",
        actor_name: str = "",
    ) -> GatewayResult:
        body = {"kid_number": kid_number, "inactive": inactive}
        if place:
            body["place"] = place
        response = self.http.request(
            "POST",
            f"{self.base_url}/api/v1/marketplace/hood/deactivate-by-kid/",
            headers=self._headers(request_id, actor_login=actor_login, actor_name=actor_name),
            json=body,
            timeout_seconds=self.timeout_seconds,
        )
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def toggle_kaufland_by_kid(
        self,
        *,
        kid_number: str,
        inactive: bool,
        request_id: str,
        place: str | None = None,
        actor_login: str = "",
        actor_name: str = "",
    ) -> GatewayResult:
        body = {"kid_number": kid_number, "inactive": inactive}
        if place:
            body["place"] = place
        response = self.http.request(
            "POST",
            f"{self.base_url}/api/v1/marketplace/kaufland/toggle-by-kid/",
            headers=self._headers(request_id, actor_login=actor_login, actor_name=actor_name),
            json=body,
            timeout_seconds=self.timeout_seconds,
        )
        return GatewayResult(status_code=response.status_code, body=_json_or_text(response))

    def toggle_otto_by_kid(
        self,
        *,
        kid_number: str,
        inactive: bool,
        request_id: str,
        place: str | None = None,
        actor_login: str = "",
        actor_name: str = "",
    ) -> GatewayResult:
        body = {"kid_number": kid_number, "inactive": inactive}
        if place:
            body["place"] = place
        response = self.http.request(
            "POST",
            f"{self.base_url}/api/v1/marketplace/otto/toggle-by-kid/",
            headers=self._headers(request_id, actor_login=actor_login, actor_name=actor_name),
            json=body,
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
