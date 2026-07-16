"""Persistence use case for synchronising Afterbuy orders into WareHub."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from database.models import Client, Kid, OrderItem, Orders

from .contracts import AfterbuyAddress, AfterbuyLookupResult, AfterbuyOrder, AfterbuyOrderItem
from .service import AfterbuyOrderLookupService


@dataclass(frozen=True)
class AfterbuySyncStats:
    client_updated: bool = False
    orders_created: int = 0
    orders_updated: int = 0
    items_created: int = 0
    items_updated: int = 0
    found: bool = False


class AfterbuyKidSyncService:
    """Reads a KID from Afterbuy and atomically upserts its local order data."""

    def __init__(self, lookup_service: AfterbuyOrderLookupService | None = None) -> None:
        self._lookup_service = lookup_service or AfterbuyOrderLookupService()

    def sync_kid(self, *, kid: Kid, kid_number: str) -> AfterbuySyncStats:
        lookup_result = self.lookup_kid(kid_number)
        if lookup_result is None:
            return AfterbuySyncStats()

        return self.sync_lookup_result(kid=kid, lookup_result=lookup_result)

    def lookup_kid(self, kid_number: str) -> AfterbuyLookupResult | None:
        return self._lookup_service.find_by_kid(kid_number)

    def sync_lookup_result(
        self, *, kid: Kid, lookup_result: AfterbuyLookupResult
    ) -> AfterbuySyncStats:

        orders_created = orders_updated = items_created = items_updated = 0
        with transaction.atomic():
            self._upsert_client(kid, lookup_result.orders[0])
            for afterbuy_order in lookup_result.orders:
                order, created = _upsert_order(kid, afterbuy_order)
                if created:
                    orders_created += 1
                else:
                    orders_updated += 1

                for afterbuy_item in afterbuy_order.items:
                    if not afterbuy_item.item_id:
                        continue
                    _, created = OrderItem.objects.update_or_create(
                        order=order,
                        afterbuy_item_id=afterbuy_item.item_id,
                        defaults=_item_defaults(afterbuy_item),
                    )
                    if created:
                        items_created += 1
                    else:
                        items_updated += 1

        return AfterbuySyncStats(
            client_updated=True,
            orders_created=orders_created,
            orders_updated=orders_updated,
            items_created=items_created,
            items_updated=items_updated,
            found=True,
        )

    @staticmethod
    def _upsert_client(kid: Kid, order: AfterbuyOrder) -> None:
        billing = order.billing_address
        shipping = order.shipping_address
        Client.objects.update_or_create(
            kid=kid,
            defaults={
                "afterbuy_user_id": billing.afterbuy_user_id,
                "afterbuy_user_id_alt": billing.afterbuy_user_id_alt,
                "user_id_platform": billing.user_id_platform,
                **_address_defaults("billing", billing),
                **_address_defaults("shipping", shipping),
                "contains_ebay_plus_transaction": order.contains_ebay_plus_transaction,
            },
        )


def _order_defaults(order: AfterbuyOrder) -> dict[str, object]:
    return {
        "platform": order.marketplace or None,
        "buyer": _full_name(order.billing_address) or None,
        "title": order.items[0].title if order.items else f"Order {order.order_id}",
        "memo": order.memo or None,
        "order_date": _datetime_or_none(order.order_date),
        "invoice_number": order.invoice_number or None,
        "already_paid": order.payment.paid_amount,
        "full_amount": _decimal_text(order.payment.total_amount),
        "shipping_tax_rate": order.shipping.tax_rate,
        "delivery_date": _datetime_or_none(order.shipping.delivery_at),
        "invoice_amount": order.invoice_amount,
        "paid_amount": order.paid_amount,
        "payment_date": _datetime_or_none(order.payment.paid_at),
        "payment_method": order.payment.method or None,
        "payment_id": order.payment.payment_id or None,
        "payment_function": order.payment.function or None,
        "shipping_method": order.shipping.method or None,
        "status": _payment_status(order),
    }


def _upsert_order(kid: Kid, afterbuy_order: AfterbuyOrder) -> tuple[Orders, bool]:
    """Reconcile legacy comma-separated IDs with the canonical Afterbuy ID."""

    exact_order = Orders.objects.filter(kid=kid, order_id=afterbuy_order.order_id).first()
    legacy_orders = [
        candidate
        for candidate in Orders.objects.filter(kid=kid).exclude(order_id=afterbuy_order.order_id)
        if afterbuy_order.order_id in _split_order_ids(candidate.order_id)
    ]
    defaults = _order_defaults(afterbuy_order)

    if exact_order is None and legacy_orders:
        order = legacy_orders.pop(0)
        order.order_id = afterbuy_order.order_id
        for field_name, value in defaults.items():
            setattr(order, field_name, value)
        order.save(update_fields=["order_id", *defaults.keys()])
        return order, False

    if exact_order is not None:
        for legacy_order in legacy_orders:
            if not exact_order.additional_items and legacy_order.additional_items:
                exact_order.additional_items = legacy_order.additional_items
                exact_order.save(update_fields=["additional_items"])
            legacy_order.delete()
        for field_name, value in defaults.items():
            setattr(exact_order, field_name, value)
        exact_order.save(update_fields=list(defaults.keys()))
        return exact_order, False

    return Orders.objects.create(kid=kid, order_id=afterbuy_order.order_id, **defaults), True


def _split_order_ids(value: str) -> set[str]:
    return {part.strip() for part in value.split(",") if part.strip()}


def _item_defaults(item: AfterbuyOrderItem) -> dict[str, object]:
    return {
        "article_number": item.article_number,
        "alternative_item_number": item.alternative_item_number,
        "alternative_item_number_1": item.alternative_item_number_1,
        "platform_item_id": item.platform_item_id,
        "platform_order_id": item.platform_order_id,
        "title": item.title,
        "quantity": item.quantity,
        "item_price": item.unit_price,
        "original_item_price": item.original_unit_price,
        "currency": item.currency,
        "item_shipping_amount": item.shipping_amount,
        "eco_fee": item.eco_fee,
        "tax_rate": item.tax_rate,
        "tax_collected_by": item.tax_collected_by,
        "item_weight": item.weight,
        "item_end_date": _datetime_or_none(item.ended_at),
        "afterbuy_item_modified_at": _datetime_or_none(item.modified_at),
        "platform_name": item.platform,
        "user_defined_flag": item.user_defined_flag,
        "internal_item_type": item.internal_item_type,
        "item_details_done": item.details_done,
        "is_amazon_invoiced": item.is_amazon_invoiced,
        "is_external_invoice": item.is_external_invoice,
        "ebay_transaction_id": item.ebay_transaction_id,
        "is_ebay_plus_transaction": item.is_ebay_plus_transaction,
        "ebay_feedback_completed": item.ebay_feedback_completed,
        "ebay_feedback_received": item.ebay_feedback_received,
    }


def _address_defaults(prefix: str, address: AfterbuyAddress) -> dict[str, object]:
    values = {
        "first_name": address.first_name,
        "last_name": address.last_name,
        "company": address.company,
        "street": address.street,
        "street_2": address.street_2,
        "postal_code": address.postal_code,
        "city": address.city,
        "state_or_province": address.state_or_province,
        "country": address.country,
        "country_iso": address.country_iso,
        "phone": address.phone,
        "tax_id_number": address.tax_id_number,
    }
    if prefix == "billing":
        values.update(
            title=address.title,
            fax=address.fax,
            email=address.email,
            is_merchant=address.is_merchant,
        )
    return {f"{prefix}_{field}": value for field, value in values.items()}


def _full_name(address: AfterbuyAddress) -> str:
    return " ".join(part for part in (address.first_name, address.last_name) if part).strip()


def _decimal_text(value: Decimal | None) -> str | None:
    return format(value, "f") if value is not None else None


def _payment_status(order: AfterbuyOrder) -> str:
    if (
        order.payment.paid_amount is not None
        and order.payment.total_amount is not None
        and order.payment.paid_amount >= order.payment.total_amount
    ):
        return "paid"
    return "no_paid"


def _datetime_or_none(value: str) -> datetime | None:
    normalized = value.strip()
    if not normalized:
        return None
    for format_string in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y"):
        try:
            parsed = datetime.strptime(normalized, format_string)
            return timezone.make_aware(parsed, timezone.get_current_timezone())
        except ValueError:
            continue
    return None
