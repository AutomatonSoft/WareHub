import base64
import binascii
import hashlib
import json
import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urlencode
from xml.sax.saxutils import escape as xml_escape
from xml.etree import ElementTree

import requests
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.cache import cache

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
        return _application_token(config=self._config, session=self._session)


class EbayNotificationClient:
    _PUBLIC_KEY_CACHE_TIMEOUT_SECONDS = 3600

    def __init__(
        self,
        *,
        config: EbayApiConfig | None = None,
        session: requests.Session | None = None,
    ):
        self._config = config or EbayApiConfig.from_env()
        self._session = session or requests.Session()

    def verify_marketplace_account_deletion_notification(self, *, raw_payload: bytes, signature_header: str) -> bool:
        header = _notification_signature_header(signature_header)
        key_id = str(header.get("kid") or "").strip()
        encoded_signature = str(header.get("signature") or "").strip()
        if not key_id or not encoded_signature:
            raise EbayApiError("eBay notification signature is invalid.")
        try:
            signature = base64.b64decode(encoded_signature, validate=True)
        except (ValueError, binascii.Error) as error:
            raise EbayApiError("eBay notification signature is invalid.") from error

        try:
            public_key = serialization.load_pem_public_key(self._public_key(key_id).encode("ascii"))
            public_key.verify(signature, raw_payload, ec.ECDSA(hashes.SHA1()))
        except (TypeError, ValueError) as error:
            raise EbayApiError("eBay notification public key is invalid.") from error
        except InvalidSignature:
            return False
        return True

    def _public_key(self, key_id: str) -> str:
        cache_key = f"ebay:notification-public-key:{hashlib.sha256(key_id.encode('utf-8')).hexdigest()}"
        cached_key = cache.get(cache_key)
        if isinstance(cached_key, str) and cached_key:
            return cached_key

        token = _application_token(config=self._config, session=self._session)
        try:
            response = self._session.get(
                f"{self._config.base_url}/commerce/notification/v1/public_key/{quote(key_id, safe='')}",
                headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError("eBay notification public-key request failed.") from error

        payload = _response_payload(response, "eBay notification public-key API")
        public_key = str(payload.get("key") or "").strip()
        algorithm = str(payload.get("algorithm") or "").strip().upper()
        digest = str(payload.get("digest") or "").strip().upper()
        if not public_key or algorithm != "ECDSA" or digest != "SHA1":
            raise EbayApiError("eBay notification public-key response is invalid.", details=payload)
        cache.set(cache_key, public_key, timeout=self._PUBLIC_KEY_CACHE_TIMEOUT_SECONDS)
        return public_key


class EbayOAuthClient:
    _TRADING_COMPATIBILITY_LEVEL = "1477"
    _TRADING_SITE_IDS = {"EBAY_DE": "77"}
    _MARKETPLACE_LOCALES = {"EBAY_DE": "de-DE"}
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
            'prompt': 'login',
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
        address: dict[str, str],
    ) -> None:
        access_token = self._seller_access_token(account=account)
        self._seller_post(
            token=access_token,
            path=f"/sell/inventory/v1/location/{quote(merchant_location_key, safe='')}",
            payload={
                "name": name,
                "location": {"address": address},
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

    def create_or_replace_inventory_item(
        self,
        *,
        account: str,
        sku: str,
        item: dict[str, Any],
        marketplace_id: str = "EBAY_DE",
    ) -> None:
        access_token = self._seller_access_token(account=account)
        self._seller_put(
            token=access_token,
            path=f"/sell/inventory/v1/inventory_item/{quote(sku, safe='')}",
            payload=item,
            operation="create_or_replace_inventory_item",
            content_language=self._marketplace_locale(marketplace_id),
        )

    def inventory_items(self, *, account: str, limit: int = 100, offset: int = 0) -> dict[str, Any]:
        access_token = self._seller_access_token(account=account)
        return self._seller_get(
            token=access_token,
            path="/sell/inventory/v1/inventory_item",
            params={"limit": str(limit), "offset": str(offset)},
            operation="get_inventory_items",
        )

    def inventory_item(self, *, account: str, sku: str) -> dict[str, Any]:
        access_token = self._seller_access_token(account=account)
        return self._seller_get(
            token=access_token,
            path=f"/sell/inventory/v1/inventory_item/{quote(_required(sku, 'sku'), safe='')}",
            params={},
            operation="get_inventory_item",
        )

    def create_offer(self, *, account: str, offer: dict[str, Any]) -> dict[str, Any]:
        access_token = self._seller_access_token(account=account)
        return self._seller_post(
            token=access_token,
            path="/sell/inventory/v1/offer",
            payload=offer,
            operation="create_offer",
            content_language=self._marketplace_locale(_required(str(offer.get("marketplaceId") or ""), "offer.marketplaceId")),
        )

    def offers_by_sku(self, *, account: str, sku: str, marketplace_id: str) -> list[dict[str, Any]]:
        access_token = self._seller_access_token(account=account)
        payload = self._seller_get(
            token=access_token,
            path="/sell/inventory/v1/offer",
            params={"sku": _required(sku, "sku"), "marketplace_id": _required(marketplace_id, "marketplace_id"), "limit": "100"},
            operation="get_offers_by_sku",
        )
        offers = payload.get("offers")
        return [entry for entry in offers if isinstance(entry, dict)] if isinstance(offers, list) else []

    def offer(self, *, account: str, offer_id: str) -> dict[str, Any]:
        access_token = self._seller_access_token(account=account)
        return self._seller_get(
            token=access_token,
            path=f"/sell/inventory/v1/offer/{quote(_required(offer_id, 'offer_id'), safe='')}",
            params={},
            operation="get_offer",
        )

    def update_offer(self, *, account: str, offer_id: str, offer: dict[str, Any]) -> None:
        access_token = self._seller_access_token(account=account)
        self._seller_put(
            token=access_token,
            path=f"/sell/inventory/v1/offer/{quote(_required(offer_id, 'offer_id'), safe='')}",
            payload=offer,
            operation="update_offer",
            content_language=self._marketplace_locale(_required(str(offer.get("marketplaceId") or ""), "offer.marketplaceId")),
        )

    def publish_offer(self, *, account: str, offer_id: str) -> dict[str, Any]:
        access_token = self._seller_access_token(account=account)
        return self._seller_post(
            token=access_token,
            path=f"/sell/inventory/v1/offer/{quote(_required(offer_id, 'offer_id'), safe='')}/publish",
            payload={},
            operation="publish_offer",
        )

    def withdraw_offer(self, *, account: str, offer_id: str) -> None:
        access_token = self._seller_access_token(account=account)
        self._seller_post(
            token=access_token,
            path=f"/sell/inventory/v1/offer/{quote(_required(offer_id, 'offer_id'), safe='')}/withdraw",
            payload={},
            operation="withdraw_offer",
        )

    def bulk_update_price_quantity(
        self,
        *,
        account: str,
        sku: str,
        offer_id: str,
        quantity: int | None,
        price: str | None,
        currency: str = "EUR",
    ) -> dict[str, Any]:
        if quantity is None and price is None:
            raise EbayApiError("At least one of quantity or price is required.")
        offer: dict[str, Any] = {"offerId": _required(offer_id, "offer_id")}
        if quantity is not None:
            offer["availableQuantity"] = quantity
        if price is not None:
            offer["price"] = {"currency": currency, "value": price}
        request: dict[str, Any] = {"sku": _required(sku, "sku"), "offers": [offer]}
        if quantity is not None:
            request["shipToLocationAvailability"] = {"quantity": quantity}
        access_token = self._seller_access_token(account=account)
        response = self._seller_post(
            token=access_token,
            path="/sell/inventory/v1/bulk_update_price_quantity",
            payload={"requests": [request]},
            operation="bulk_update_price_quantity",
        )
        _raise_for_bulk_update_errors(response)
        return response

    def revise_legacy_fixed_price_listing(
        self,
        *,
        account: str,
        item_id: str,
        marketplace_id: str,
        quantity: int | None,
        price: str | None,
        currency: str = "EUR",
    ) -> dict[str, Any]:
        if quantity is None and price is None:
            raise EbayApiError("At least one of quantity or price is required.")
        item_fields = [f"<ItemID>{xml_escape(_required(item_id, 'item_id'))}</ItemID>"]
        if quantity is not None:
            item_fields.append(f"<Quantity>{quantity}</Quantity>")
        if price is not None:
            item_fields.append(f'<StartPrice currencyID="{xml_escape(currency)}">{xml_escape(price)}</StartPrice>')
        return self._trading_request(
            account=account,
            marketplace_id=marketplace_id,
            call_name="ReviseFixedPriceItem",
            operation="revise_legacy_fixed_price_listing",
            request_xml=(
                '<?xml version="1.0" encoding="utf-8"?>'
                '<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
                f"<Item>{''.join(item_fields)}</Item>"
                "</ReviseFixedPriceItemRequest>"
            ),
        )

    def revise_legacy_fixed_price_variation(
        self,
        *,
        account: str,
        item_id: str,
        marketplace_id: str,
        variation_sku: str,
        quantity: int,
        price: str,
        currency: str = "EUR",
    ) -> dict[str, Any]:
        return self._trading_request(
            account=account,
            marketplace_id=marketplace_id,
            call_name="ReviseFixedPriceItem",
            operation="revise_legacy_fixed_price_variation",
            request_xml=(
                '<?xml version="1.0" encoding="utf-8"?>'
                '<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
                "<Item>"
                f"<ItemID>{xml_escape(_required(item_id, 'item_id'))}</ItemID>"
                "<Variations><Variation>"
                f"<SKU>{xml_escape(_required(variation_sku, 'variation_sku'))}</SKU>"
                f'<StartPrice currencyID="{xml_escape(currency)}">{xml_escape(price)}</StartPrice>'
                f"<Quantity>{quantity}</Quantity>"
                "</Variation></Variations>"
                "</Item>"
                "</ReviseFixedPriceItemRequest>"
            ),
        )

    def end_legacy_fixed_price_listing(self, *, account: str, item_id: str, marketplace_id: str) -> dict[str, Any]:
        return self._trading_request(
            account=account,
            marketplace_id=marketplace_id,
            call_name="EndFixedPriceItem",
            operation="end_legacy_fixed_price_listing",
            request_xml=(
                '<?xml version="1.0" encoding="utf-8"?>'
                '<EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
                f"<ItemID>{xml_escape(_required(item_id, 'item_id'))}</ItemID>"
                "<EndingReason>NotAvailable</EndingReason>"
                "</EndFixedPriceItemRequest>"
            ),
        )

    def relist_legacy_fixed_price_listing(
        self,
        *,
        account: str,
        item_id: str,
        marketplace_id: str,
        quantity: int | None,
        price: str | None,
        currency: str = "EUR",
    ) -> dict[str, Any]:
        item_fields = [f"<ItemID>{xml_escape(_required(item_id, 'item_id'))}</ItemID>"]
        if quantity is not None:
            item_fields.append(f"<Quantity>{quantity}</Quantity>")
        if price is not None:
            item_fields.append(f'<StartPrice currencyID="{xml_escape(currency)}">{xml_escape(price)}</StartPrice>')
        return self._trading_request(
            account=account,
            marketplace_id=marketplace_id,
            call_name="RelistFixedPriceItem",
            operation="relist_legacy_fixed_price_listing",
            request_xml=(
                '<?xml version="1.0" encoding="utf-8"?>'
                '<RelistFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
                f"<Item>{''.join(item_fields)}</Item>"
                "</RelistFixedPriceItemRequest>"
            ),
        )

    def _marketplace_locale(self, marketplace_id: str) -> str:
        locale = self._MARKETPLACE_LOCALES.get(marketplace_id)
        if locale is None:
            raise EbayApiError("eBay marketplace locale is not configured.")
        return locale

    def _trading_request(
        self,
        *,
        account: str,
        marketplace_id: str,
        call_name: str,
        operation: str,
        request_xml: str,
    ) -> dict[str, Any]:
        site_id = self._TRADING_SITE_IDS.get(marketplace_id)
        if site_id is None:
            raise EbayApiError("Trading listing operations are currently available only for EBAY_DE.")
        access_token = self._seller_access_token(account=account)
        try:
            response = self._session.post(
                f"{self._config.base_url}/ws/api.dll",
                data=request_xml.encode("utf-8"),
                headers={
                    "Content-Type": "text/xml",
                    "X-EBAY-API-CALL-NAME": call_name,
                    "X-EBAY-API-COMPATIBILITY-LEVEL": self._TRADING_COMPATIBILITY_LEVEL,
                    "X-EBAY-API-SITEID": site_id,
                    "X-EBAY-API-IAF-TOKEN": access_token,
                },
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError(
                "eBay Trading API request failed.",
                details={"kind": type(error).__name__},
                operation=operation,
            ) from error
        return _trading_operation_payload(response=response, operation=operation)

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

    def listing(self, *, account: str, item_id: str, marketplace_id: str) -> dict[str, Any]:
        site_id = self._TRADING_SITE_IDS.get(marketplace_id)
        if site_id is None:
            raise EbayApiError("Listing lookup is currently available only for EBAY_DE.")

        access_token = self._seller_access_token(account=account)
        xml = f'''<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>{item_id}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>'''
        try:
            response = self._session.post(
                f"{self._config.base_url}/ws/api.dll",
                data=xml.encode("utf-8"),
                headers={
                    "Content-Type": "text/xml",
                    "X-EBAY-API-CALL-NAME": "GetItem",
                    "X-EBAY-API-COMPATIBILITY-LEVEL": self._TRADING_COMPATIBILITY_LEVEL,
                    "X-EBAY-API-SITEID": site_id,
                    "X-EBAY-API-IAF-TOKEN": access_token,
                },
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError(
                "eBay listing lookup failed.",
                details={"kind": type(error).__name__},
                operation="get_listing",
            ) from error
        return _listing_payload(response=response, marketplace_id=marketplace_id)

    def active_listings(self, *, account: str, marketplace_id: str, page: int, limit: int) -> dict[str, Any]:
        site_id = self._TRADING_SITE_IDS.get(marketplace_id)
        if site_id is None:
            raise EbayApiError("Active listing lookup is currently available only for EBAY_DE.")

        access_token = self._seller_access_token(account=account)
        xml = f'''<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <DetailLevel>ReturnAll</DetailLevel>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>{limit}</EntriesPerPage>
      <PageNumber>{page}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>'''
        try:
            response = self._session.post(
                f"{self._config.base_url}/ws/api.dll",
                data=xml.encode("utf-8"),
                headers={
                    "Content-Type": "text/xml",
                    "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
                    "X-EBAY-API-COMPATIBILITY-LEVEL": self._TRADING_COMPATIBILITY_LEVEL,
                    "X-EBAY-API-SITEID": site_id,
                    "X-EBAY-API-IAF-TOKEN": access_token,
                },
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError(
                "eBay active listing lookup failed.",
                details={"kind": type(error).__name__},
                operation="get_active_listings",
            ) from error
        return _active_listings_payload(response=response, marketplace_id=marketplace_id, page=page, limit=limit)

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

    def _seller_post(
        self,
        *,
        token: str,
        path: str,
        payload: dict[str, Any],
        operation: str,
        content_language: str | None = None,
    ) -> dict[str, Any]:
        try:
            headers = {"Accept": "application/json", "Authorization": f"Bearer {token}"}
            if content_language:
                headers["Content-Language"] = content_language
            response = self._session.post(
                f"{self._config.base_url}{path}",
                json=payload,
                headers=headers,
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError(
                "eBay seller request failed.",
                details={"kind": type(error).__name__},
                operation=operation,
            ) from error
        return self._seller_response_payload(response=response, operation=operation)

    def _seller_put(
        self,
        *,
        token: str,
        path: str,
        payload: dict[str, Any],
        operation: str,
        content_language: str | None = None,
    ) -> dict[str, Any]:
        try:
            headers = {"Accept": "application/json", "Authorization": f"Bearer {token}"}
            if content_language:
                headers["Content-Language"] = content_language
            response = self._session.put(
                f"{self._config.base_url}{path}",
                json=payload,
                headers=headers,
                timeout=(self._config.connect_timeout, self._config.read_timeout),
            )
        except requests.RequestException as error:
            raise EbayApiError(
                "eBay seller request failed.",
                details={"kind": type(error).__name__},
                operation=operation,
            ) from error
        self._seller_response_payload(response=response, operation=operation)

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


def _application_token(*, config: EbayApiConfig, session: requests.Session) -> str:
    try:
        response = session.post(
            config.token_url,
            data={
                "grant_type": "client_credentials",
                "scope": "https://api.ebay.com/oauth/api_scope",
            },
            auth=(config.client_id, config.client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=(config.connect_timeout, config.read_timeout),
        )
    except requests.RequestException as error:
        raise EbayApiError("eBay OAuth token request failed.") from error

    payload = _response_payload(response, "eBay OAuth")
    token = str(payload.get("access_token") or "").strip()
    if not token:
        raise EbayApiError("eBay OAuth response does not contain an access token.", details=payload)
    return token


def _notification_signature_header(value: str) -> dict[str, Any]:
    try:
        decoded = base64.b64decode(str(value or ""), validate=True).decode("utf-8")
        payload = json.loads(decoded)
    except (UnicodeDecodeError, ValueError, binascii.Error) as error:
        raise EbayApiError("eBay notification signature is invalid.") from error
    if not isinstance(payload, dict):
        raise EbayApiError("eBay notification signature is invalid.")
    return payload


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


def _raise_for_bulk_update_errors(payload: dict[str, Any]) -> None:
    failures: list[dict[str, Any]] = []
    top_level_errors = payload.get("errors")
    if isinstance(top_level_errors, list) and top_level_errors:
        failures.append({"errors": top_level_errors})
    for entry in payload.get("responses", []):
        if not isinstance(entry, dict):
            continue
        if _response_status_failed(entry):
            failures.append(entry)
        for offer_entry in entry.get("offerResponses", []):
            if isinstance(offer_entry, dict) and _response_status_failed(offer_entry):
                failures.append(offer_entry)
    if failures:
        raise EbayApiError(
            "eBay bulk price and quantity update returned failed item results.",
            status_code=422,
            details={"responses": failures},
            operation="bulk_update_price_quantity",
        )


def _response_status_failed(entry: dict[str, Any]) -> bool:
    try:
        return int(entry.get("statusCode")) >= 400
    except (TypeError, ValueError):
        return False


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


def _listing_payload(*, response: requests.Response, marketplace_id: str) -> dict[str, Any]:
    try:
        root = ElementTree.fromstring(response.content)
    except (AttributeError, ElementTree.ParseError) as error:
        raise EbayApiError(
            "eBay listing lookup returned an invalid XML response.",
            status_code=response.status_code,
            operation="get_listing",
        ) from error

    namespace = {"ebay": "urn:ebay:apis:eBLBaseComponents"}
    errors = [
        {
            "code": _xml_text(error, "ebay:ErrorCode", namespace),
            "message": _xml_text(error, "ebay:LongMessage", namespace) or _xml_text(error, "ebay:ShortMessage", namespace),
        }
        for error in root.findall("ebay:Errors", namespace)
    ]
    if not response.ok or _xml_text(root, "ebay:Ack", namespace) not in {"Success", "Warning"}:
        raise EbayApiError(
            "eBay listing lookup returned an error response.",
            status_code=response.status_code,
            details={"errors": errors},
            operation="get_listing",
        )

    item = root.find("ebay:Item", namespace)
    if item is None:
        raise EbayApiError("eBay listing lookup response has no item.", operation="get_listing")

    return _listing_item_payload(item=item, marketplace_id=marketplace_id, namespace=namespace)


def _trading_operation_payload(*, response: requests.Response, operation: str) -> dict[str, Any]:
    try:
        root = ElementTree.fromstring(response.content)
    except (AttributeError, ElementTree.ParseError) as error:
        raise EbayApiError(
            "eBay Trading API returned an invalid XML response.",
            status_code=response.status_code,
            operation=operation,
        ) from error

    namespace = {"ebay": "urn:ebay:apis:eBLBaseComponents"}
    errors = [
        {
            "code": _xml_text(error, "ebay:ErrorCode", namespace),
            "message": _xml_text(error, "ebay:LongMessage", namespace) or _xml_text(error, "ebay:ShortMessage", namespace),
        }
        for error in root.findall("ebay:Errors", namespace)
    ]
    if not response.ok or _xml_text(root, "ebay:Ack", namespace) not in {"Success", "Warning"}:
        raise EbayApiError(
            "eBay Trading API returned an error response.",
            status_code=response.status_code,
            details={"errors": errors},
            operation=operation,
        )
    return {
        "ack": _xml_text(root, "ebay:Ack", namespace),
        "item_id": _xml_text(root, "ebay:ItemID", namespace),
        "end_time": _xml_text(root, "ebay:EndTime", namespace),
        "fees": [
            {
                "name": _xml_text(fee, "ebay:Name", namespace),
                "fee": _xml_text(fee, "ebay:Fee", namespace),
            }
            for fee in root.findall("ebay:Fees/ebay:Fee", namespace)
        ],
    }


def _active_listings_payload(*, response: requests.Response, marketplace_id: str, page: int, limit: int) -> dict[str, Any]:
    try:
        root = ElementTree.fromstring(response.content)
    except (AttributeError, ElementTree.ParseError) as error:
        raise EbayApiError(
            "eBay active listing lookup returned an invalid XML response.",
            status_code=response.status_code,
            operation="get_active_listings",
        ) from error

    namespace = {"ebay": "urn:ebay:apis:eBLBaseComponents"}
    errors = [
        {
            "code": _xml_text(error, "ebay:ErrorCode", namespace),
            "message": _xml_text(error, "ebay:LongMessage", namespace) or _xml_text(error, "ebay:ShortMessage", namespace),
        }
        for error in root.findall("ebay:Errors", namespace)
    ]
    if not response.ok or _xml_text(root, "ebay:Ack", namespace) not in {"Success", "Warning"}:
        raise EbayApiError(
            "eBay active listing lookup returned an error response.",
            status_code=response.status_code,
            details={"errors": errors},
            operation="get_active_listings",
        )

    active_list = root.find("ebay:ActiveList", namespace)
    items = [] if active_list is None else active_list.findall("ebay:ItemArray/ebay:Item", namespace)
    pagination = active_list.find("ebay:PaginationResult", namespace) if active_list is not None else None
    return {
        "marketplace_id": marketplace_id,
        "page": page,
        "limit": limit,
        "total": _xml_text(pagination, "ebay:TotalNumberOfEntries", namespace) if pagination is not None else "0",
        "total_pages": _xml_text(pagination, "ebay:TotalNumberOfPages", namespace) if pagination is not None else "0",
        "listings": [_listing_item_payload(item=item, marketplace_id=marketplace_id, namespace=namespace) for item in items],
    }


def _listing_item_payload(*, item: ElementTree.Element, marketplace_id: str, namespace: dict[str, str]) -> dict[str, Any]:
    identifiers: dict[str, list[str]] = {}
    for entry in item.findall("ebay:ItemSpecifics/ebay:NameValueList", namespace):
        name = _xml_text(entry, "ebay:Name", namespace)
        if name.casefold() not in {"ean", "gtin", "upc", "isbn", "mpn"}:
            continue
        values = [str(value.text or "").strip() for value in entry.findall("ebay:Value", namespace) if str(value.text or "").strip()]
        if values:
            identifiers[name] = values

    product_ean = _xml_text(item, "ebay:ProductListingDetails/ebay:EAN", namespace)
    if product_ean and product_ean not in identifiers.get("EAN", []):
        identifiers.setdefault("EAN", []).append(product_ean)

    start_price = item.find("ebay:StartPrice", namespace)
    return {
        "marketplace_id": marketplace_id,
        "item_id": _xml_text(item, "ebay:ItemID", namespace),
        "seller": _xml_text(item, "ebay:Seller/ebay:UserID", namespace),
        "title": _xml_text(item, "ebay:Title", namespace),
        "sku": _xml_text(item, "ebay:SKU", namespace),
        "inventory_tracking_method": _xml_text(item, "ebay:InventoryTrackingMethod", namespace),
        "listing_type": _xml_text(item, "ebay:ListingType", namespace),
        "has_variations": item.find("ebay:Variations", namespace) is not None,
        "variations": [_variation_payload(variation=variation, namespace=namespace) for variation in item.findall("ebay:Variations/ebay:Variation", namespace)],
        "listing_status": _xml_text(item, "ebay:SellingStatus/ebay:ListingStatus", namespace)
        or _xml_text(item, "ebay:ListingDetails/ebay:ListingStatus", namespace),
        "quantity": _xml_text(item, "ebay:Quantity", namespace),
        "quantity_sold": _xml_text(item, "ebay:SellingStatus/ebay:QuantitySold", namespace),
        "quantity_available": _xml_text(item, "ebay:QuantityAvailable", namespace),
        "price": _xml_text(item, "ebay:StartPrice", namespace),
        "currency": str(start_price.attrib.get("currencyID") or "").strip() if start_price is not None else "",
        "identifiers": identifiers,
    }


def _variation_payload(*, variation: ElementTree.Element, namespace: dict[str, str]) -> dict[str, Any]:
    identifiers: dict[str, list[str]] = {}
    for entry in variation.findall("ebay:VariationSpecifics/ebay:NameValueList", namespace):
        name = _xml_text(entry, "ebay:Name", namespace)
        if name.casefold() not in {"ean", "gtin", "upc", "isbn", "mpn"}:
            continue
        values = [str(value.text or "").strip() for value in entry.findall("ebay:Value", namespace) if str(value.text or "").strip()]
        if values:
            identifiers[name] = values
    variation_ean = _xml_text(variation, "ebay:VariationProductListingDetails/ebay:EAN", namespace)
    if variation_ean and variation_ean not in identifiers.get("EAN", []):
        identifiers.setdefault("EAN", []).append(variation_ean)
    return {
        "sku": _xml_text(variation, "ebay:SKU", namespace),
        "quantity": _xml_text(variation, "ebay:Quantity", namespace),
        "quantity_sold": _xml_text(variation, "ebay:SellingStatus/ebay:QuantitySold", namespace),
        "price": _xml_text(variation, "ebay:StartPrice", namespace),
        "currency": str(variation.find("ebay:StartPrice", namespace).attrib.get("currencyID") or "").strip()
        if variation.find("ebay:StartPrice", namespace) is not None
        else "",
        "identifiers": identifiers,
    }


def _xml_text(element: ElementTree.Element, path: str, namespace: dict[str, str]) -> str:
    return str(element.findtext(path, default="", namespaces=namespace) or "").strip()
