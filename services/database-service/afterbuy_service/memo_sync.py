"""Application service for synchronising a locally edited order memo to Afterbuy."""

from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from database.models import Orders

from .client import AfterbuyApiError
from .contracts import AfterbuyOrderIdentity
from .service import DEFAULT_PROFILES, AfterbuyOrderLookupService

MEMO_SYNC_MAX_ATTEMPTS = 2
AFTERBUY_OPERATION_NOT_SELECTABLE = "afterbuy_operation_not_selectable"
logger = logging.getLogger(__name__)


class AfterbuyOrderMemoSyncService:
    """Pushes an order memo to Afterbuy while retaining a durable local outcome."""

    def __init__(
        self,
        lookup_service: AfterbuyOrderLookupService | None = None,
    ) -> None:
        self._lookup_service = lookup_service or AfterbuyOrderLookupService()

    def sync_order(self, order: Orders) -> Orders:
        identity = self._resolve_internal_order_identity(order)
        if identity is None:
            return self._mark_failed(
                order,
                "Afterbuy internal OrderID was not found; UpdateSoldItems was not called.",
            )
        profile = identity.profile
        afterbuy_order_id = identity.order_id

        self._mark_pending(order, profile)
        for attempt in range(1, MEMO_SYNC_MAX_ATTEMPTS + 1):
            try:
                self._lookup_service.update_order_memo(
                    profile=profile,
                    order_id=afterbuy_order_id,
                    memo=order.memo or "",
                )
            except (AfterbuyApiError, ValueError) as error:
                if _is_operation_not_selectable(error):
                    self._log_operation_not_selectable(order, identity, error)
                    return self._mark_failed(
                        order,
                        _memo_sync_error_message(error),
                        error_type=AFTERBUY_OPERATION_NOT_SELECTABLE,
                    )
                if not _is_retryable(error):
                    return self._mark_failed(order, _memo_sync_error_message(error))
                if attempt == MEMO_SYNC_MAX_ATTEMPTS:
                    logger.warning(
                        "AFTERBUY_ORDER_MEMO_SYNC_FAILED order_id=%s profile=%s attempts=%s",
                        order.id,
                        profile,
                        attempt,
                    )
                    return self._mark_failed(order, _memo_sync_error_message(error))
            else:
                return self._mark_synced(order, profile)

        return self._mark_failed(order, "Afterbuy memo sync failed.")

    def _resolve_internal_order_identity(self, order: Orders) -> AfterbuyOrderIdentity | None:
        kid_number = _primary_kid_number(order)
        if not kid_number:
            return None
        profiles = (order.afterbuy_profile,) if order.afterbuy_profile else DEFAULT_PROFILES
        identity = self._lookup_service.resolve_internal_order_id(
            kid_number=kid_number,
            external_order_id=order.order_id,
            profiles=profiles,
        )
        if identity is None:
            return None
        return identity

    @staticmethod
    def _mark_pending(order: Orders, profile: str) -> None:
        Orders.objects.filter(pk=order.pk).update(
            afterbuy_profile=profile,
            memo_sync_status="pending",
            memo_sync_error=None,
            memo_sync_error_type=None,
        )
        order.afterbuy_profile = profile
        order.memo_sync_status = "pending"
        order.memo_sync_error = None
        order.memo_sync_error_type = None

    @staticmethod
    def _mark_synced(order: Orders, profile: str) -> Orders:
        synced_at = timezone.now()
        with transaction.atomic():
            Orders.objects.filter(pk=order.pk).update(
                afterbuy_profile=profile,
                memo_sync_status="synced",
                memo_sync_error=None,
                memo_sync_error_type=None,
                memo_last_synced_at=synced_at,
            )
        order.afterbuy_profile = profile
        order.memo_sync_status = "synced"
        order.memo_sync_error = None
        order.memo_sync_error_type = None
        order.memo_last_synced_at = synced_at
        return order

    @staticmethod
    def _mark_failed(
        order: Orders,
        message: str,
        *,
        error_type: str | None = None,
    ) -> Orders:
        safe_message = message[:1000]
        Orders.objects.filter(pk=order.pk).update(
            memo_sync_status="failed",
            memo_sync_error=safe_message,
            memo_sync_error_type=error_type,
        )
        order.memo_sync_status = "failed"
        order.memo_sync_error = safe_message
        order.memo_sync_error_type = error_type
        return order

    @staticmethod
    def _log_operation_not_selectable(
        order: Orders,
        identity: AfterbuyOrderIdentity,
        error: AfterbuyApiError,
    ) -> None:
        logger.warning(
            "AFTERBUY_ORDER_MEMO_OPERATION_NOT_SELECTABLE database_order_id=%s "
            "afterbuy_profile=%s afterbuy_kid=%s marketplace=%s marketplace_account=%s "
            "internal_order_id=%s main_item_id=%s item_id_included=false "
            "updated_fields=OrderMemo call_name=UpdateSoldItems call_status=Error "
            "error_code=%s error_description=%s error_long_description=%s",
            order.id,
            identity.profile,
            _primary_kid_number(order),
            identity.marketplace or "unknown",
            identity.marketplace_account or "unknown",
            identity.order_id,
            identity.main_item_id or "unknown",
            error.code or "none",
            error.error_description or "none",
            error.error_long_description or "none",
        )


def _primary_kid_number(order: Orders) -> str:
    value = order.kid.kid_number
    if isinstance(value, list):
        return next((str(item).strip() for item in value if str(item).strip()), "")
    return str(value or "").strip()


def _memo_sync_error_message(error: Exception) -> str:
    if isinstance(error, AfterbuyApiError) and error.code == "33":
        return (
            "Afterbuy GetSoldItems resolved the internal OrderID, but UpdateSoldItems "
            "could not select this operation for OrderMemo update. ItemID was not sent. "
            "Clarification from Afterbuy support may be required for imported marketplace "
            "orders or XML API write permissions."
        )
    return str(error)


def _is_operation_not_selectable(error: Exception) -> bool:
    return isinstance(error, AfterbuyApiError) and error.code == "33"


def _is_retryable(error: Exception) -> bool:
    return isinstance(error, AfterbuyApiError) and error.retryable
