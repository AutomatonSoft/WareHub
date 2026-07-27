import os
from typing import Any

import requests


class OttoExternalAPIError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, details: object = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


class OttoExternalProductsClient:
    """HTTP adapter for the OTTO product read API."""

    def __init__(
        self,
        *,
        session: requests.Session | None = None,
        base_url: str | None = None,
        connect_timeout: int | None = None,
        read_timeout: int | None = None,
    ):
        self._session = session or requests.Session()
        self._base_url = (base_url or os.getenv("OTTO_API_BASE_URL", "https://okb.automatonsoft.de")).rstrip("/")
        self._products_endpoint = os.getenv("OTTO_API_PRODUCTS_ENDPOINT", "/extermal/get_products")
        self._connect_timeout = connect_timeout or int(os.getenv("OTTO_API_CONNECT_TIMEOUT", "8"))
        self._read_timeout = read_timeout or int(os.getenv("OTTO_API_READ_TIMEOUT", "30"))

    def fetch_products(self, *, sku: str, controller: str, page: int, limit: int) -> dict[str, Any]:
        try:
            response = self._session.get(
                f"{self._base_url}{self._products_endpoint}",
                params={"sku": sku, "page": page, "limit": limit, "controller": controller},
                headers={"Accept": "application/json"},
                timeout=(self._connect_timeout, self._read_timeout),
            )
        except requests.RequestException as error:
            raise OttoExternalAPIError("OTTO product API request failed.") from error

        try:
            payload = response.json()
        except ValueError as error:
            raise OttoExternalAPIError(
                "OTTO product API returned an invalid JSON response.",
                status_code=response.status_code,
            ) from error

        if not response.ok:
            raise OttoExternalAPIError(
                "OTTO product API returned an error response.",
                status_code=response.status_code,
                details=payload,
            )

        if not isinstance(payload, dict) or not isinstance(payload.get("productVariations"), list):
            raise OttoExternalAPIError(
                "OTTO product API response does not contain productVariations.",
                status_code=response.status_code,
                details=payload,
            )

        return payload
