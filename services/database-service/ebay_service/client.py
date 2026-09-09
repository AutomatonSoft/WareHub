import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import requests


class EbayApiError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, details: object = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


@dataclass(frozen=True)
class EbayApiConfig:
    client_id: str
    client_secret: str
    base_url: str
    token_url: str
    connect_timeout: int
    read_timeout: int

    @classmethod
    def from_env(cls) -> "EbayApiConfig":
        environment = (os.getenv("EBAY_API_ENV") or "sandbox").strip().lower()
        if environment not in {"sandbox", "production"}:
            raise EbayApiError("EBAY_API_ENV must be sandbox or production.")

        client_id = (os.getenv("EBAY_CLIENT_ID") or "").strip()
        client_secret = (os.getenv("EBAY_CLIENT_SECRET") or "").strip()
        if not client_id or not client_secret:
            raise EbayApiError("eBay API credentials are not configured.")

        host = "https://api.sandbox.ebay.com" if environment == "sandbox" else "https://api.ebay.com"
        return cls(
            client_id=client_id,
            client_secret=client_secret,
            base_url=host,
            token_url=f"{host}/identity/v1/oauth2/token",
            connect_timeout=int(os.getenv("EBAY_API_CONNECT_TIMEOUT", "8")),
            read_timeout=int(os.getenv("EBAY_API_READ_TIMEOUT", "20")),
        )


class EbayTaxonomyClient:
    def __init__(
        self,
        *,
        config: EbayApiConfig | None = None,
        session: requests.Session | None = None,
    ):
        self._config = config or EbayApiConfig.from_env()
        self._session = session or requests.Session()

    def category_suggestions(self, *, marketplace_id: str, query: str) -> dict[str, Any]:
        token = self._application_token()
        category_tree_id = self._category_tree_id(token=token, marketplace_id=marketplace_id)
        return self._get(
            token=token,
            path=f"/commerce/taxonomy/v1/category_tree/{category_tree_id}/get_category_suggestions",
            params={"q": _required(query, "q")},
        )

    def category_aspects(self, *, marketplace_id: str, category_id: str) -> dict[str, Any]:
        token = self._application_token()
        category_tree_id = self._category_tree_id(token=token, marketplace_id=marketplace_id)
        return self._get(
            token=token,
            path=f"/commerce/taxonomy/v1/category_tree/{category_tree_id}/get_item_aspects_for_category",
            params={"category_id": _required(category_id, "category_id")},
        )

    def _category_tree_id(self, *, token: str, marketplace_id: str) -> str:
        payload = self._get(
            token=token,
            path="/commerce/taxonomy/v1/get_default_category_tree_id",
            params={"marketplace_id": _required(marketplace_id, "marketplace_id")},
        )
        category_tree_id = str(payload.get("categoryTreeId") or "").strip()
        if not category_tree_id:
            raise EbayApiError("eBay Taxonomy API response does not contain a category tree ID.", details=payload)
        return category_tree_id

    def _get(self, *, token: str, path: str, params: dict[str, str]) -> dict[str, Any]:
        try:
            response = self._session.get(
                f"{self._config.base_url}{path}",
                params=params,
                headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError("eBay Taxonomy API request failed.") from error
        return _response_payload(response, "eBay Taxonomy API")

    def _application_token(self) -> str:
        try:
            response = self._session.post(
                self._config.token_url,
                data={
                    "grant_type": "client_credentials",
                    "scope": "https://api.ebay.com/oauth/api_scope",
                },
                auth=(self._config.client_id, self._config.client_secret),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError("eBay OAuth token request failed.") from error

        payload = _response_payload(response, "eBay OAuth")
        token = str(payload.get("access_token") or "").strip()
        if not token:
            raise EbayApiError("eBay OAuth response does not contain an access token.", details=payload)
        return token


class EbayOAuthClient:
    _SELL_SCOPES = (
        "https://api.ebay.com/oauth/api_scope/sell.inventory",
        "https://api.ebay.com/oauth/api_scope/sell.account",
    )

    def __init__(
        self,
        *,
        config: EbayApiConfig | None = None,
        ru_name: str | None = None,
        session: requests.Session | None = None,
    ):
        self._config = config or EbayApiConfig.from_env()
        self._ru_name = str(ru_name if ru_name is not None else os.getenv("EBAY_OAUTH_RU_NAME") or "").strip()
        self._session = session or requests.Session()
        if not self._ru_name:
            raise EbayApiError("EBAY_OAUTH_RU_NAME is not configured.")

    def authorization_url(self, *, state: str) -> str:
        host = "https://auth.sandbox.ebay.com" if "sandbox" in self._config.base_url else "https://auth.ebay.com"
        return f"{host}/oauth2/authorize?{urlencode({
            'client_id': self._config.client_id,
            'redirect_uri': self._ru_name,
            'response_type': 'code',
            'scope': ' '.join(self._SELL_SCOPES),
            'state': state,
        })}"

    def exchange_code(self, *, code: str) -> dict[str, Any]:
        try:
            response = self._session.post(
                self._config.token_url,
                data={"grant_type": "authorization_code", "code": _required(code, "code"), "redirect_uri": self._ru_name},
                auth=(self._config.client_id, self._config.client_secret),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError("eBay OAuth code exchange failed.") from error
        return _response_payload(response, "eBay OAuth")


def _required(value: str, name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise EbayApiError(f"{name} is required.")
    return normalized


def _response_payload(response: requests.Response, source: str) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as error:
        raise EbayApiError(
            f"{source} returned an invalid JSON response.",
            status_code=response.status_code,
        ) from error

    if not response.ok:
        raise EbayApiError(
            f"{source} returned an error response.",
            status_code=response.status_code,
            details=payload,
        )
    if not isinstance(payload, dict):
        raise EbayApiError(f"{source} response must be an object.", status_code=response.status_code, details=payload)
    return payload
