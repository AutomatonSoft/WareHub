"""Application service for searching orders across Afterbuy profiles."""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable

from .client import AfterbuyApiClient, AfterbuyApiError, AfterbuyCredentials
from .contracts import AfterbuyLookupResult, AfterbuyOrder, AfterbuyOrderIdentity

DEFAULT_PROFILES = ("JV", "XL", "CH")
logger = logging.getLogger(__name__)


class AfterbuyOrderLookupService:
    """Looks up a KID in configured Afterbuy accounts, without writing data."""

    def __init__(
        self,
        client_factory: Callable[[str], AfterbuyApiClient] | None = None,
    ) -> None:
        self._client_factory = client_factory or self._build_client

    def find_by_kid(
        self, kid_number: str, profiles: Iterable[str] = DEFAULT_PROFILES
    ) -> AfterbuyLookupResult | None:
        for profile in profiles:
            try:
                client = self._client_factory(profile)
                orders = client.fetch_orders_by_kid(kid_number)
            except AfterbuyApiError:
                logger.warning("AFTERBUY_PROFILE_LOOKUP_FAILED profile=%s", profile)
                continue
            if orders:
                return AfterbuyLookupResult(profile=client.profile, orders=orders)
        return None

    def resolve_internal_order_id(
        self,
        *,
        kid_number: str,
        external_order_id: str,
        profiles: Iterable[str] = DEFAULT_PROFILES,
    ) -> AfterbuyOrderIdentity | None:
        normalized_external_id = external_order_id.strip()
        if not normalized_external_id:
            return None
        for profile in profiles:
            try:
                client = self._client_factory(profile)
                orders = client.fetch_orders_by_kid(kid_number)
            except AfterbuyApiError:
                logger.warning("AFTERBUY_ORDER_ID_RESOLUTION_FAILED profile=%s", profile)
                continue
            for order in orders:
                if _matches_external_order_id(order, normalized_external_id) and _is_positive_order_id(order.order_id):
                    logger.info(
                        "AFTERBUY_ORDER_ID_RESOLVED profile=%s external_order_id=%s internal_order_id=%s",
                        client.profile,
                        normalized_external_id,
                        order.order_id,
                    )
                    return AfterbuyOrderIdentity(
                        profile=client.profile,
                        order_id=order.order_id,
                        main_item_id=_main_item_id(order),
                        marketplace=_marketplace_name(order),
                        marketplace_account=order.marketplace,
                    )
        logger.warning("AFTERBUY_ORDER_ID_NOT_FOUND external_order_id=%s", normalized_external_id)
        return None

    def update_order_memo(self, *, profile: str, order_id: str, memo: str) -> None:
        client = self._client_factory(profile)
        client.update_order_memo(order_id=order_id, memo=memo)

    @staticmethod
    def _build_client(profile: str) -> AfterbuyApiClient:
        normalized_profile = profile.upper()
        return AfterbuyApiClient(
            profile=normalized_profile,
            credentials=AfterbuyCredentials.from_environment(normalized_profile),
        )


def _matches_external_order_id(order: AfterbuyOrder, external_order_id: str) -> bool:
    order_values = {order.order_id, order.order_id_alt}
    if external_order_id in order_values:
        return True
    return any(
        external_order_id in {item.platform_order_id, item.ebay_transaction_id}
        for item in order.items
    )


def _is_positive_order_id(value: str) -> bool:
    return value.isdecimal() and int(value) > 0


def _main_item_id(order: AfterbuyOrder) -> str:
    matching_item = next((item for item in order.items if item.item_id == order.order_id), None)
    if matching_item is not None:
        return matching_item.item_id
    return next((item.item_id for item in order.items if item.item_id), "")


def _marketplace_name(order: AfterbuyOrder) -> str:
    return next((item.platform for item in order.items if item.platform), "")
