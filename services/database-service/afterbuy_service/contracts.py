"""Typed contracts returned by the Afterbuy adapter."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional


@dataclass(frozen=True)
class AfterbuyAddress:
    afterbuy_user_id: str = ""
    afterbuy_user_id_alt: str = ""
    user_id_platform: str = ""
    first_name: str = ""
    last_name: str = ""
    title: str = ""
    company: str = ""
    street: str = ""
    street_2: str = ""
    postal_code: str = ""
    city: str = ""
    state_or_province: str = ""
    country: str = ""
    country_iso: str = ""
    email: str = ""
    phone: str = ""
    fax: str = ""
    is_merchant: bool = False
    tax_id_number: str = ""


@dataclass(frozen=True)
class AfterbuyPayment:
    payment_id: str = ""
    method: str = ""
    function: str = ""
    paid_amount: Optional[Decimal] = None
    total_amount: Optional[Decimal] = None
    paid_at: str = ""


@dataclass(frozen=True)
class AfterbuyShipping:
    method: str = ""
    delivery_at: str = ""
    shipping_cost: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    tax_rate: Optional[Decimal] = None


@dataclass(frozen=True)
class AfterbuyOrderItem:
    item_id: str = ""
    article_number: str = ""
    alternative_item_number: str = ""
    alternative_item_number_1: str = ""
    platform_item_id: str = ""
    title: str = ""
    quantity: Optional[int] = None
    unit_price: Optional[Decimal] = None
    original_unit_price: Optional[Decimal] = None
    currency: str = ""
    shipping_amount: Optional[Decimal] = None
    eco_fee: Optional[Decimal] = None
    tax_rate: Optional[Decimal] = None
    tax_collected_by: str = ""
    weight: Optional[Decimal] = None
    ended_at: str = ""
    modified_at: str = ""
    platform: str = ""
    platform_order_id: str = ""
    user_defined_flag: str = ""
    internal_item_type: str = ""
    details_done: bool = False
    is_amazon_invoiced: bool = False
    is_external_invoice: bool = False
    ebay_transaction_id: str = ""
    is_ebay_plus_transaction: bool = False
    ebay_feedback_completed: bool = False
    ebay_feedback_received: bool = False


@dataclass(frozen=True)
class AfterbuyOrder:
    profile: str
    order_id: str
    order_id_alt: str = ""
    order_date: str = ""
    invoice_number: str = ""
    memo: str = ""
    marketplace: str = ""
    invoice_amount: Optional[Decimal] = None
    paid_amount: Optional[Decimal] = None
    currency: str = ""
    contains_ebay_plus_transaction: bool = False
    billing_address: AfterbuyAddress = field(default_factory=AfterbuyAddress)
    shipping_address: AfterbuyAddress = field(default_factory=AfterbuyAddress)
    payment: AfterbuyPayment = field(default_factory=AfterbuyPayment)
    shipping: AfterbuyShipping = field(default_factory=AfterbuyShipping)
    items: tuple[AfterbuyOrderItem, ...] = ()


@dataclass(frozen=True)
class AfterbuyLookupResult:
    profile: str
    orders: tuple[AfterbuyOrder, ...]
