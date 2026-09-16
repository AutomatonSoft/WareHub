import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urlencode
from xml.etree import ElementTree

import requests

from .credentials import EbayCredentialError, load_refresh_token


class EbayApiError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, details: object = None, operation: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details
        self.operation = operation


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
    _TRADING_COMPATIBILITY_LEVEL = "1477"
    _TRADING_SITE_IDS = {"EBAY_DE": "77"}
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

    def seller_setup(self, *, account: str, marketplace_id: str) -> dict[str, Any]:
        access_token = self._seller_access_token(account=account)
        return {
            "account": account,
            "marketplace_id": marketplace_id,
            "locations": self._seller_get(
                token=access_token,
                path="/sell/inventory/v1/location",
                params={"limit": "100"},
                operation="inventory_locations",
            ),
            "fulfillment_policies": self._seller_get(
                token=access_token,
                path="/sell/account/v1/fulfillment_policy",
                params={"marketplace_id": marketplace_id},
                operation="fulfillment_policies",
            ),
            "payment_policies": self._seller_get(
                token=access_token,
                path="/sell/account/v1/payment_policy",
                params={"marketplace_id": marketplace_id},
                operation="payment_policies",
            ),
            "return_policies": self._seller_get(
                token=access_token,
                path="/sell/account/v1/return_policy",
                params={"marketplace_id": marketplace_id},
                operation="return_policies",
            ),
        }

    def create_inventory_location(
        self,
        *,
        account: str,
        merchant_location_key: str,
        name: str,
        postal_code: str,
        country: str,
    ) -> None:
        access_token = self._seller_access_token(account=account)
        self._seller_post(
            token=access_token,
            path=f"/sell/inventory/v1/location/{quote(merchant_location_key, safe='')}",
            payload={
                "name": name,
                "location": {"address": {"postalCode": postal_code, "country": country}},
                "locationTypes": ["WAREHOUSE"],
                "merchantLocationStatus": "ENABLED",
            },
            operation="create_inventory_location",
        )

    def opt_in_to_selling_policy_management(self, *, account: str) -> None:
        access_token = self._seller_access_token(account=account)
        self._seller_post(
            token=access_token,
            path="/sell/account/v1/program/opt_in",
            payload={"programType": "SELLING_POLICY_MANAGEMENT"},
            operation="selling_policy_management_opt_in",
        )

    def create_seller_policy(self, *, account: str, policy_type: str, policy: dict[str, Any]) -> dict[str, Any]:
        paths = {
            "fulfillment": "/sell/account/v1/fulfillment_policy",
            "payment": "/sell/account/v1/payment_policy",
            "return": "/sell/account/v1/return_policy",
        }
        path = paths.get(policy_type)
        if path is None:
            raise EbayApiError("Unsupported eBay seller policy type.")
        access_token = self._seller_access_token(account=account)
        return self._seller_post(
            token=access_token,
            path=path,
            payload=policy,
            operation=f"create_{policy_type}_policy",
        )

    def shipping_services(self, *, account: str, marketplace_id: str) -> dict[str, Any]:
        site_id = self._TRADING_SITE_IDS.get(marketplace_id)
        if site_id is None:
            raise EbayApiError("Shipping-service metadata is currently available only for EBAY_DE.")

        access_token = self._seller_access_token(account=account)
        xml = """<?xml version=\"1.0\" encoding=\"utf-8\"?>
<GeteBayDetailsRequest xmlns=\"urn:ebay:apis:eBLBaseComponents\">
  <DetailName>ShippingServiceDetails</DetailName>
</GeteBayDetailsRequest>"""
        try:
            response = self._session.post(
                f"{self._config.base_url}/ws/api.dll",
                data=xml.encode("utf-8"),
                headers={
                    "Content-Type": "text/xml",
                    "X-EBAY-API-CALL-NAME": "GeteBayDetails",
                    "X-EBAY-API-COMPATIBILITY-LEVEL": self._TRADING_COMPATIBILITY_LEVEL,
                    "X-EBAY-API-SITEID": site_id,
                    "X-EBAY-API-IAF-TOKEN": access_token,
                },
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError(
                "eBay shipping-service metadata request failed.",
                details={"kind": type(error).__name__},
                operation="shipping_services",
            ) from error
        return _shipping_services_payload(response=response, marketplace_id=marketplace_id)

    def _seller_access_token(self, *, account: str) -> str:
        try:
            refresh_token = load_refresh_token(account=account)
        except EbayCredentialError as error:
            raise EbayApiError(str(error)) from error
        if not refresh_token:
            raise EbayApiError(f"EBAY_{account.upper()}_REFRESH_TOKEN is not configured.")

        return self._refresh_access_token(refresh_token=refresh_token)

    def _refresh_access_token(self, *, refresh_token: str) -> str:
        try:
            response = self._session.post(
                self._config.token_url,
                data={"grant_type": "refresh_token", "refresh_token": refresh_token},
                auth=(self._config.client_id, self._config.client_secret),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError("eBay OAuth refresh-token exchange failed.") from error

        payload = _response_payload(response, "eBay OAuth")
        token = str(payload.get("access_token") or "").strip()
        if not token:
            raise EbayApiError("eBay OAuth response does not contain an access token.", details=payload)
        return token

    def _seller_get(self, *, token: str, path: str, params: dict[str, str], operation: str) -> dict[str, Any]:
        try:
            response = self._session.get(
                f"{self._config.base_url}{path}",
                params=params,
                headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError(
                "eBay seller request failed.",
                details={"kind": type(error).__name__},
                operation=operation,
            ) from error
        return self._seller_response_payload(response=response, operation=operation)

    def _seller_post(self, *, token: str, path: str, payload: dict[str, Any], operation: str) -> dict[str, Any]:
        try:
            response = self._session.post(
                f"{self._config.base_url}{path}",
                json=payload,
                headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError(
                "eBay seller request failed.",
                details={"kind": type(error).__name__},
                operation=operation,
            ) from error
        return self._seller_response_payload(response=response, operation=operation)

    def _seller_response_payload(self, *, response: requests.Response, operation: str) -> dict[str, Any]:
        if response.status_code == 204:
            return {}
        try:
            return _response_payload(response, "eBay seller setup")
        except EbayApiError as error:
            raise EbayApiError(
                str(error),
                status_code=error.status_code,
                details=error.details,
                operation=operation,
            ) from error


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


def _shipping_services_payload(*, response: requests.Response, marketplace_id: str) -> dict[str, Any]:
    try:
        root = ElementTree.fromstring(response.content)
    except (AttributeError, ElementTree.ParseError) as error:
        raise EbayApiError(
            "eBay shipping-service metadata returned an invalid XML response.",
            status_code=response.status_code,
            operation="shipping_services",
        ) from error

    namespace = {"ebay": "urn:ebay:apis:eBLBaseComponents"}
    errors = [
        {
            "code": _xml_text(item, "ebay:ErrorCode", namespace),
            "message": _xml_text(item, "ebay:LongMessage", namespace) or _xml_text(item, "ebay:ShortMessage", namespace),
        }
        for item in root.findall("ebay:Errors", namespace)
    ]
    if not response.ok or _xml_text(root, "ebay:Ack", namespace) not in {"Success", "Warning"}:
        raise EbayApiError(
            "eBay shipping-service metadata returned an error response.",
            status_code=response.status_code,
            details={"errors": errors},
            operation="shipping_services",
        )

    services = []
    for item in root.findall("ebay:ShippingServiceDetails", namespace):
        if _xml_text(item, "ebay:ValidForSellingFlow", namespace).lower() != "true":
            continue
        service_code = _xml_text(item, "ebay:ShippingService", namespace)
        if not service_code:
            continue
        services.append(
            {
                "shipping_service_code": service_code,
                "shipping_carrier_code": _xml_text(item, "ebay:ShippingCarrier", namespace),
                "description": _xml_text(item, "ebay:Description", namespace),
                "international": _xml_text(item, "ebay:InternationalService", namespace).lower() == "true",
                "shipping_category": _xml_text(item, "ebay:ShippingCategory", namespace),
                "cost_types": [entry.text for entry in item.findall("ebay:ServiceType", namespace) if entry.text],
            }
        )
    return {"marketplace_id": marketplace_id, "services": services}


def _xml_text(element: ElementTree.Element, path: str, namespace: dict[str, str]) -> str:
    return str(element.findtext(path, default="", namespaces=namespace) or "").strip()
