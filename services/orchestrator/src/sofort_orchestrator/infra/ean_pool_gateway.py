from __future__ import annotations

from typing import Any

from .http_client import HttpClient


class EanPoolGatewayError(RuntimeError):
    """Raised when the database service cannot safely allocate a pool EAN."""


class EanPoolGateway:
    def __init__(self, *, base_url: str, http_client: HttpClient, service_auth_token: str = "") -> None:
        self.base_url = base_url.rstrip("/")
        self.http = http_client
        self.service_auth_token = service_auth_token

    def claim_for_job(self, *, job_id: str, request_id: str) -> str:
        payload = self._post(path="/api/v1/ean-pool/claim-for-job/", job_id=job_id, request_id=request_id)
        ean = str(payload.get("ean") or "").strip()
        if not ean:
            raise EanPoolGatewayError("EAN pool allocation response did not contain an EAN.")
        return ean

    def mark_used_for_job(self, *, job_id: str, request_id: str) -> None:
        self._post(path="/api/v1/ean-pool/mark-job-used/", job_id=job_id, request_id=request_id)

    def _post(self, *, path: str, job_id: str, request_id: str) -> dict[str, Any]:
        headers = {"X-Request-Id": request_id, "Content-Type": "application/json"}
        if self.service_auth_token:
            headers["X-WareHub-Service-Token"] = self.service_auth_token
        response = self.http.request(
            "POST",
            f"{self.base_url}{path}",
            headers=headers,
            json={"job_id": job_id},
        )
        if not 200 <= response.status_code < 300:
            raise EanPoolGatewayError(f"EAN pool request failed with HTTP {response.status_code}.")
        try:
            body = response.json()
        except ValueError as exc:
            raise EanPoolGatewayError("EAN pool returned a non-JSON response.") from exc
        if not isinstance(body, dict):
            raise EanPoolGatewayError("EAN pool returned an invalid response.")
        return body
