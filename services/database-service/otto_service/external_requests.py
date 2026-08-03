import os
from typing import Any

import requests


class OttoExternalAPIError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, details: object = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


def _to_external_otto_product(product: dict[str, Any], *, controller: str) -> dict[str, Any]:
    external_product = dict(product)
    if controller.strip().lower() == "jv":
        product_description = external_product.pop("productDescription", None)
        if product_description is not None:
            external_product["productDescriprion"] = product_description

        compliance = external_product.pop("compliance", None)
        if compliance is not None:
            external_product["compliace"] = compliance

    order = external_product.pop("order", None)
    if isinstance(order, dict) and "maxOrderQuantity" not in external_product:
        external_product["maxOrderQuantity"] = order.get("maxOrderQuantity")

    return external_product


class OttoExternalProductsClient:
    """HTTP adapter for the OTTO read API."""

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
        self._categories_endpoint = os.getenv("OTTO_API_CATEGORIES_ENDPOINT", "/extermal/categories")
        self._attributes_endpoint = os.getenv("OTTO_API_ATTRIBUTES_ENDPOINT", "/extermal/attributes")
        self._upsert_endpoint = os.getenv("OTTO_API_UPSERT_ENDPOINT", "/extermal/create_or_update_product")
        self._activate_endpoint = os.getenv("OTTO_API_ACTIVATE_ENDPOINT", "/extermal/activate")
        self._deactivate_endpoint = os.getenv("OTTO_API_DEACTIVATE_ENDPOINT", "/extermal/deactivate")
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

    def fetch_attributes(self, *, category_id: str) -> dict[str, Any]:
        try:
            response = self._session.get(
                f"{self._base_url}{self._attributes_endpoint}",
                params={"categoryId": category_id},
                headers={"Accept": "application/json"},
                timeout=(self._connect_timeout, self._read_timeout),
            )
        except requests.RequestException as error:
            raise OttoExternalAPIError("OTTO attributes API request failed.") from error

        try:
            payload = response.json()
        except ValueError as error:
            raise OttoExternalAPIError(
                "OTTO attributes API returned an invalid JSON response.",
                status_code=response.status_code,
            ) from error

        if not response.ok:
            raise OttoExternalAPIError(
                "OTTO attributes API returned an error response.",
                status_code=response.status_code,
                details=payload,
            )

        if not isinstance(payload, dict) or not isinstance(payload.get("attributes"), list):
            raise OttoExternalAPIError(
                "OTTO attributes API response does not contain attributes.",
                status_code=response.status_code,
                details=payload,
            )

        return payload

    def create_or_update_products(self, *, controller: str, products: list[dict[str, Any]]) -> Any:
        external_products = [_to_external_otto_product(product, controller=controller) for product in products]
        try:
            response = self._session.post(
                f"{self._base_url}{self._upsert_endpoint}",
                params={"controller": controller},
                json=external_products,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                timeout=(self._connect_timeout, self._read_timeout),
            )
        except requests.RequestException as error:
            raise OttoExternalAPIError("OTTO create/update API request failed.") from error

        try:
            payload = response.json()
        except ValueError as error:
            raise OttoExternalAPIError(
                "OTTO create/update API returned an invalid JSON response.",
                status_code=response.status_code,
            ) from error

        if not response.ok:
            raise OttoExternalAPIError(
                "OTTO create/update API returned an error response.",
                status_code=response.status_code,
                details=payload,
            )

        return payload

    def set_active_state(self, *, ean: str, controller: str, active: bool) -> dict[str, Any]:
        endpoint = self._activate_endpoint if active else self._deactivate_endpoint
        try:
            response = self._session.post(
                f"{self._base_url}{endpoint}",
                json={"ean": ean, "controller": controller},
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                timeout=(self._connect_timeout, self._read_timeout),
            )
        except requests.RequestException as error:
            raise OttoExternalAPIError("OTTO activate/deactivate API request failed.") from error

        try:
            payload = response.json()
        except ValueError as error:
            raise OttoExternalAPIError(
                "OTTO activate/deactivate API returned an invalid JSON response.",
                status_code=response.status_code,
            ) from error

        if not response.ok:
            raise OttoExternalAPIError(
                "OTTO activate/deactivate API returned an error response.",
                status_code=response.status_code,
                details=payload,
            )

        if not isinstance(payload, dict):
            raise OttoExternalAPIError(
                "OTTO activate/deactivate API response must be an object.",
                status_code=response.status_code,
                details=payload,
            )

        return payload

    def fetch_categories(
        self,
        *,
        page: int,
        limit: int,
        category: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "limit": limit}
        if category:
            params["category"] = category
        try:
            response = self._session.get(
                f"{self._base_url}{self._categories_endpoint}",
                params=params,
                headers={"Accept": "application/json"},
                timeout=(self._connect_timeout, self._read_timeout),
            )
        except requests.RequestException as error:
            raise OttoExternalAPIError("OTTO categories API request failed.") from error

        try:
            payload = response.json()
        except ValueError as error:
            raise OttoExternalAPIError(
                "OTTO categories API returned an invalid JSON response.",
                status_code=response.status_code,
            ) from error

        if not response.ok:
            raise OttoExternalAPIError(
                "OTTO categories API returned an error response.",
                status_code=response.status_code,
                details=payload,
            )

        if not isinstance(payload, dict) or not isinstance(payload.get("categories"), list):
            raise OttoExternalAPIError(
                "OTTO categories API response does not contain categories.",
                status_code=response.status_code,
                details=payload,
            )

        return payload

    def fetch_all_categories(self, *, page_size: int = 2000, max_pages: int = 1000) -> list[dict[str, Any]]:
        if not 1 <= page_size <= 2000:
            raise ValueError("page_size must be between 1 and 2000.")
        if max_pages < 1:
            raise ValueError("max_pages must be positive.")

        categories_by_id: dict[str, dict[str, Any]] = {}
        for page in range(max_pages):
            page_categories = self.fetch_categories(page=page, limit=page_size)["categories"]
            if not page_categories:
                break

            count_before_page = len(categories_by_id)
            for category in page_categories:
                if not isinstance(category, dict):
                    continue
                category_id = str(category.get("id") or category.get("categoryId") or "").strip()
                if category_id:
                    categories_by_id[category_id] = category

            if len(page_categories) < page_size or len(categories_by_id) == count_before_page:
                break
        else:
            raise OttoExternalAPIError("OTTO category API pagination exceeded the configured page limit.")

        return list(categories_by_id.values())
