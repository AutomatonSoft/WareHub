"""Low-level, side-effect-free Afterbuy XML API adapter."""

from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Final, Optional
from xml.etree import ElementTree

import requests

from .contracts import (
    AfterbuyAddress,
    AfterbuyOrder,
    AfterbuyOrderItem,
    AfterbuyPayment,
    AfterbuyShipping,
)

AFTERBUY_API_URL: Final = "https://api.afterbuy.de/afterbuy/ABInterface.aspx"
DEFAULT_TIMEOUT_SECONDS: Final = 20


class AfterbuyApiError(RuntimeError):
    """Raised when Afterbuy returns an unusable response."""


class AfterbuyCredentialsError(AfterbuyApiError):
    """Raised when a configured marketplace profile has no credentials."""


@dataclass(frozen=True)
class AfterbuyCredentials:
    partner_token: str
    account_token: str

    @classmethod
    def from_environment(cls, profile: str) -> "AfterbuyCredentials":
        prefix = f"AFTERBUY_{profile.upper()}"
        partner_token = os.getenv(f"{prefix}_PARTNER_TOKEN", "").strip()
        account_token = os.getenv(f"{prefix}_ACCOUNT_TOKEN", "").strip()
        if not partner_token or not account_token:
            raise AfterbuyCredentialsError(
                f"Afterbuy profile '{profile}' is not fully configured."
            )
        return cls(partner_token=partner_token, account_token=account_token)


class AfterbuyApiClient:
    """Fetches sold orders for one Afterbuy account without persistence."""

    def __init__(
        self,
        *,
        profile: str,
        credentials: AfterbuyCredentials,
        session: Optional[requests.Session] = None,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._profile = profile.upper()
        self._credentials = credentials
        self._session = session or requests.Session()
        self._timeout_seconds = timeout_seconds

    @property
    def profile(self) -> str:
        return self._profile

    def fetch_orders_by_kid(self, kid_number: str) -> tuple[AfterbuyOrder, ...]:
        normalized_kid = kid_number.strip()
        if not normalized_kid:
            raise ValueError("kid_number must not be empty")
        return self._fetch_sold_items("AfterbuyUserID", normalized_kid)

    def _fetch_sold_items(self, filter_name: str, filter_value: str) -> tuple[AfterbuyOrder, ...]:
        payload = self._build_get_sold_items_request(filter_name, filter_value)
        try:
            response = self._session.post(
                AFTERBUY_API_URL,
                data=payload,
                headers={"Content-Type": "application/xml; charset=utf-8"},
                timeout=self._timeout_seconds,
            )
            response.raise_for_status()
        except requests.RequestException as error:
            raise AfterbuyApiError(
                f"Afterbuy request failed for profile '{self._profile}'."
            ) from error
        return self._parse_orders(response.content)

    def _build_get_sold_items_request(self, filter_name: str, filter_value: str) -> bytes:
        root = ElementTree.Element("Request")
        global_request = ElementTree.SubElement(root, "AfterbuyGlobal")
        ElementTree.SubElement(global_request, "CallName").text = "GetSoldItems"
        ElementTree.SubElement(global_request, "PartnerToken").text = self._credentials.partner_token
        ElementTree.SubElement(global_request, "AccountToken").text = self._credentials.account_token
        ElementTree.SubElement(global_request, "DetailLevel").text = "0"
        ElementTree.SubElement(global_request, "ErrorLanguage").text = "DE"
        ElementTree.SubElement(root, "MaxSoldItems").text = "100"
        ElementTree.SubElement(root, "ReturnHiddenItems").text = "1"
        data_filter = ElementTree.SubElement(root, "DataFilter")
        filter_node = ElementTree.SubElement(data_filter, "Filter")
        ElementTree.SubElement(filter_node, "FilterName").text = filter_name
        values = ElementTree.SubElement(filter_node, "FilterValues")
        ElementTree.SubElement(values, "FilterValue").text = filter_value
        return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)

    def _parse_orders(self, response_body: bytes) -> tuple[AfterbuyOrder, ...]:
        try:
            root = ElementTree.fromstring(response_body)
        except ElementTree.ParseError as error:
            raise AfterbuyApiError("Afterbuy returned malformed XML.") from error

        error_text = _text(root, "ErrorList/Error/ErrorDescription")
        if error_text:
            raise AfterbuyApiError(f"Afterbuy returned an API error for profile '{self._profile}'.")

        return tuple(
            _parse_order(order_node, self._profile)
            for order_node in root.findall(".//Orders/Order")
        )


def _parse_order(node: ElementTree.Element, profile: str) -> AfterbuyOrder:
    return AfterbuyOrder(
        profile=profile,
        order_id=_text(node, "OrderID"),
        order_id_alt=_text(node, "OrderIDAlt"),
        order_date=_text(node, "OrderDate"),
        invoice_number=_text(node, "InvoiceNumber"),
        memo=_text(node, "Memo"),
        marketplace=_text(node, "EbayAccount"),
        invoice_amount=_decimal(_text(node, "OrderOriginalCurrency/InvoiceAmount")),
        paid_amount=_decimal(_text(node, "OrderOriginalCurrency/PayedAmount")),
        currency=_text(node, "OrderOriginalCurrency/InvoiceAmountCode"),
        contains_ebay_plus_transaction=_boolean(_text(node, "ContainseBayPlusTransaction")),
        billing_address=_parse_address(node, "BuyerInfo/BillingAddress", include_contact=True),
        shipping_address=_parse_address(node, "BuyerInfo/ShippingAddress", include_contact=False),
        payment=AfterbuyPayment(
            payment_id=_text(node, "PaymentInfo/PaymentID"),
            method=_text(node, "PaymentInfo/PaymentMethod"),
            function=_text(node, "PaymentInfo/PaymentFunction"),
            paid_amount=_decimal(_text(node, "PaymentInfo/AlreadyPaid")),
            total_amount=_decimal(_text(node, "PaymentInfo/FullAmount")),
            paid_at=_text(node, "PaymentInfo/PaymentDate"),
        ),
        shipping=AfterbuyShipping(
            method=_text(node, "ShippingInfo/ShippingMethod"),
            delivery_at=_text(node, "ShippingInfo/DeliveryDate"),
            shipping_cost=_decimal(_text(node, "ShippingInfo/ShippingCost")),
            total_cost=_decimal(_text(node, "ShippingInfo/ShippingTotalCost")),
            tax_rate=_decimal(_text(node, "ShippingInfo/ShippingTaxRate")),
        ),
        items=tuple(_parse_item(item) for item in node.findall("SoldItems/SoldItem")),
    )


def _parse_address(
    node: ElementTree.Element, address_name: str, *, include_contact: bool
) -> AfterbuyAddress:
    prefix = f"{address_name}/"
    return AfterbuyAddress(
        afterbuy_user_id=_text(node, f"{prefix}AfterbuyUserID") if include_contact else "",
        afterbuy_user_id_alt=_text(node, f"{prefix}AfterbuyUserIDAlt") if include_contact else "",
        user_id_platform=_text(node, f"{prefix}UserIDPlattform") if include_contact else "",
        first_name=_text(node, f"{prefix}FirstName"),
        last_name=_text(node, f"{prefix}LastName"),
        title=_text(node, f"{prefix}Title"),
        company=_text(node, f"{prefix}Company"),
        street=_text(node, f"{prefix}Street"),
        street_2=_text(node, f"{prefix}Street2"),
        postal_code=_text(node, f"{prefix}PostalCode"),
        city=_text(node, f"{prefix}City"),
        state_or_province=_text(node, f"{prefix}StateOrProvince"),
        country=_text(node, f"{prefix}Country"),
        country_iso=_text(node, f"{prefix}CountryISO"),
        email=_text(node, f"{prefix}Mail") if include_contact else "",
        phone=_text(node, f"{prefix}Phone") if include_contact else "",
        fax=_text(node, f"{prefix}Fax") if include_contact else "",
        is_merchant=_boolean(_text(node, f"{prefix}IsMerchant")) if include_contact else False,
        tax_id_number=_text(node, f"{prefix}TaxIDNumber"),
    )


def _parse_item(node: ElementTree.Element) -> AfterbuyOrderItem:
    return AfterbuyOrderItem(
        item_id=_text(node, "ItemID"),
        article_number=_text(node, "Anr"),
        alternative_item_number=_text(node, "AlternativeItemNumber"),
        alternative_item_number_1=_text(node, "AlternativeItemNumber1"),
        platform_item_id=_text(node, "PlatformSpecificItemId"),
        title=_text(node, "ItemTitle"),
        quantity=_integer(_text(node, "ItemQuantity")),
        unit_price=_decimal(_text(node, "ItemPrice")),
        original_unit_price=_decimal(_text(node, "ItemOriginalCurrency/ItemPrice")),
        currency=_text(node, "ItemOriginalCurrency/ItemPriceCode"),
        shipping_amount=_decimal(_text(node, "ItemOriginalCurrency/ItemShipping")),
        eco_fee=_decimal(_text(node, "EcoFee")),
        tax_rate=_decimal(_text(node, "TaxRate")),
        tax_collected_by=_text(node, "TaxCollectedBy"),
        weight=_decimal(_text(node, "ItemWeight")),
        ended_at=_text(node, "ItemEndDate"),
        modified_at=_text(node, "ItemModDate"),
        platform=_text(node, "ItemPlatformName"),
        platform_order_id=_text(node, "PlatformSpecificOrderId"),
        user_defined_flag=_text(node, "UserDefinedFlag"),
        internal_item_type=_text(node, "InternalItemType"),
        details_done=_boolean(_text(node, "ItemDetailsDone")),
        is_amazon_invoiced=_boolean(_text(node, "IsAmazonInvoiced")),
        is_external_invoice=_boolean(_text(node, "IsExternalInvoice")),
        ebay_transaction_id=_text(node, "eBayTransactionID"),
        is_ebay_plus_transaction=_boolean(_text(node, "eBayPlusTransaction")),
        ebay_feedback_completed=_boolean(_text(node, "eBayFeedbackCompleted")),
        ebay_feedback_received=_boolean(_text(node, "eBayFeedbackReceived")),
    )


def _text(node: ElementTree.Element, path: str) -> str:
    if "/@" in path:
        element_path, attribute_name = path.rsplit("/@", maxsplit=1)
        element = node.find(element_path)
        return (element.get(attribute_name, "") if element is not None else "").strip()
    element = node.find(path)
    return (element.text or "").strip() if element is not None else ""


def _decimal(value: str) -> Optional[Decimal]:
    if not value:
        return None
    try:
        parsed = Decimal(value.replace(",", "."))
        return parsed if parsed.is_finite() else None
    except InvalidOperation:
        return None


def _integer(value: str) -> Optional[int]:
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _boolean(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes"}
