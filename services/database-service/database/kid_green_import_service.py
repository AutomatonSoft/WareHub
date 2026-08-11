from __future__ import annotations

import json
import logging
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Callable

import requests

from afterbuy_service.contracts import AfterbuyLookupResult
from afterbuy_service.sync import AfterbuyKidSyncService
from .models import Ean, EanStatus, Kid, Orders, ProductAttributes
from .workspace import workspace_atomic
from .place_rules import find_place_conflict, normalize_place, suggest_next_free_base_place
from orders_pars.service import (
    collapse_items_to_orders,
    parse_afterbuy_datetime,
    search_items_auktionsliste,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class KidGreenImportOptions:
    max_total: int = 500
    max_items_per_page: int = 20
    workers: int = 5
    timeout_retries: int = 2
    timeout_retry_delay: float = 1.5
    show_progress: bool = False

    @classmethod
    def from_raw(
        cls,
        *,
        max_total: object = 500,
        max_items_per_page: object = 20,
        workers: object = 5,
        timeout_retries: object = 2,
        timeout_retry_delay: object = 1.5,
        show_progress: bool = False,
    ) -> "KidGreenImportOptions":
        return cls(
            max_total=max(1, min(_to_int(max_total, default=500), 5000)),
            max_items_per_page=max(1, min(_to_int(max_items_per_page, default=20), 100)),
            workers=max(1, min(_to_int(workers, default=5), 32)),
            timeout_retries=max(0, min(_to_int(timeout_retries, default=2), 10)),
            timeout_retry_delay=max(0.0, min(_to_float(timeout_retry_delay, default=1.5), 60.0)),
            show_progress=bool(show_progress),
        )


@dataclass
class KidPayload:
    kid_number: str
    place: str
    photos: list[str]
    room: str | None
    store: bool
    b_ware: bool
    company: str | None
    ebay_xl: str | None
    jv: str | None
    otto_jv: str | None
    otto_xl: str | None
    quantity: int | None
    commentary: str


@dataclass
class FetchResult:
    kid_number: str
    items: list[dict]
    error: str | None = None


@dataclass(frozen=True)
class KidImportStats:
    created: int
    place_appended: int
    skipped: int
    total_payloads: int


@dataclass(frozen=True)
class OrderImportStats:
    created: int
    updated: int
    collapsed_positions: int
    skipped_without_order_id: int
    failed_kids_count: int


@dataclass(frozen=True)
class KidGreenImportItemResult:
    kid_number: str
    status: str
    fetched_items: int
    collapsed_items: int
    orders_created: int
    orders_updated: int
    skipped_without_order_id: int
    error: str | None = None


@dataclass(frozen=True)
class KidGreenImportResult:
    total_payloads: int
    unique_kids: int
    kid_stats: KidImportStats
    order_stats: OrderImportStats
    failed_kids: list[str]
    item_results: list[KidGreenImportItemResult] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "total_payloads": self.total_payloads,
            "unique_kids": self.unique_kids,
            "kid_stats": asdict(self.kid_stats),
            "order_stats": asdict(self.order_stats),
            "failed_kids": list(self.failed_kids),
            "item_results": [asdict(item) for item in self.item_results],
        }


class ProgressBar:
    def __init__(self, total: int, prefix: str) -> None:
        self.total = max(0, total)
        self.prefix = prefix
        self.current = 0
        self.width = 28
        self.lock = threading.Lock()

    def tick(self) -> None:
        with self.lock:
            self.current = min(self.total, self.current + 1)
            self._render()

    def finish(self) -> None:
        with self.lock:
            self.current = self.total
            self._render()
            sys.stdout.write("\n")
            sys.stdout.flush()

    def _render(self) -> None:
        if self.total == 0:
            line = f"\r{self.prefix} [----------------------------] 0/0 100%"
        else:
            ratio = self.current / self.total
            filled = int(ratio * self.width)
            bar = "#" * filled + "-" * (self.width - filled)
            percent = int(ratio * 100)
            line = f"\r{self.prefix} [{bar}] {self.current}/{self.total} {percent:3d}%"
        sys.stdout.write(line)
        sys.stdout.flush()


FINAL_FETCH_RETRY_WORKERS = 1


def _to_int(value: object, *, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _to_float(value: object, *, default: float) -> float:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return default


def _to_decimal_amount(value: str) -> Decimal | None:
    raw = (value or "").strip().upper().replace("EUR", "")
    if not raw:
        return None
    raw = raw.replace("\xa0", " ").replace(" ", "")
    raw = "".join(ch for ch in raw if ch.isdigit() or ch in {".", ",", "-"})
    if not raw:
        return None
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        return Decimal(raw)
    except InvalidOperation:
        return None


def _status_by_amounts(zahlungssumme: str, rechnungssumme: str) -> str:
    zahlung = _to_decimal_amount(zahlungssumme)
    rechnung = _to_decimal_amount(rechnungssumme)
    if zahlung is not None and rechnung is not None and zahlung == rechnung:
        return "paid"
    return "no_paid"


def _normalize_text(value: object) -> str:
    return str(value or "").strip()


def _normalize_optional_text(value: object) -> str | None:
    normalized = _normalize_text(value)
    return normalized or None


def _normalize_ean(value: object) -> str | None:
    normalized = _normalize_optional_text(value)
    if not normalized:
        return None
    if normalized.isdigit() and len(normalized) == 13:
        return normalized
    digit_groups = re.findall(r"\d{13}", normalized)
    if len(digit_groups) == 1 and digit_groups[0] == normalized:
        return digit_groups[0]
    return None


def _normalize_commentary(row: dict) -> str:
    commentary = _normalize_text(row.get("commentary"))
    if commentary:
        return commentary
    comment2 = _normalize_text(row.get("comment2"))
    if comment2:
        return comment2
    return ""


def _parse_quantity(value: object) -> int | None:
    raw = _normalize_text(value)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _parse_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    raw = _normalize_text(value).lower()
    return raw in {"1", "true", "yes", "on", "y"}


def _normalized_place_list(value: object) -> list[str]:
    if value is None:
        return []
    raw_values = value if isinstance(value, list) else [value]
    result: list[str] = []
    seen: set[str] = set()
    for item in raw_values:
        normalized = _normalize_text(item)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _find_kid_by_number_and_place(kid_number: str, place: str) -> Kid | None:
    candidates = Kid.objects.filter(kid_number__contains=[kid_number]).order_by("id")
    target_place = _normalize_text(place)
    for kid in candidates:
        if _normalize_text(kid.place) == target_place:
            return kid
    return None


def _build_ean_status_defaults(ean_row: Ean) -> dict[str, bool]:
    return {
        "jv": bool(ean_row.jv),
        "xl": bool(ean_row.xl),
        "otto_jv": bool(ean_row.otto_jv),
        "otto_xl": bool(ean_row.otto_xl),
        "kaufland_jv": bool(ean_row.kaufland_jv),
        "kaufland_xl": bool(ean_row.kaufland_xl),
        "hood_jv": bool(ean_row.hood_jv),
        "hood_xl": bool(ean_row.hood_xl),
        "ebay_jv": bool(ean_row.ebay_jv),
        "ebay_xl": bool(ean_row.ebay_xl),
    }


def load_kid_payloads_from_bytes(raw_bytes: bytes) -> dict[tuple[str, str], KidPayload]:
    try:
        raw = json.loads(raw_bytes.decode("utf-8"))
    except UnicodeDecodeError as exc:
        raise ValueError("kid_green.json must be UTF-8 encoded.") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON payload: {exc.msg}") from exc

    if not isinstance(raw, list):
        raise ValueError("kid_green.json must contain a JSON array.")

    grouped: dict[tuple[str, str], KidPayload] = {}
    for row in raw:
        if not isinstance(row, dict):
            continue
        kid_number = _normalize_text(row.get("kid"))
        if not kid_number:
            continue
        place = normalize_place(row.get("place") or row.get("stoyanka"))
        photo = _normalize_text(row.get("photo"))
        key = (kid_number, place)
        if key not in grouped:
            grouped[key] = KidPayload(
                kid_number=kid_number,
                place=place,
                photos=[photo] if photo else [],
                room=_normalize_optional_text(row.get("Kid.room")),
                store=_parse_bool(row.get("Kid.store")),
                b_ware=_parse_bool(row.get("Kid.b_ware")),
                company=_normalize_optional_text(row.get("company")),
                ebay_xl=_normalize_ean(row.get("Ean.ebay_xl")),
                jv=_normalize_ean(row.get("Ean.jv")),
                otto_jv=_normalize_ean(row.get("Ean.otto_jv")),
                otto_xl=_normalize_ean(row.get("Ean.otto_xl")),
                quantity=_parse_quantity(row.get("ProductAttributes.quantity")),
                commentary=_normalize_commentary(row),
            )
            continue

        payload = grouped[key]
        if photo and photo not in payload.photos:
            payload.photos.append(photo)
    return grouped


def upsert_kids(payloads: dict[tuple[str, str], KidPayload]) -> tuple[dict[str, list[Kid]], KidImportStats]:
    kid_map: dict[str, list[Kid]] = {}
    created = 0
    place_appended = 0
    skipped = 0

    for payload in payloads.values():
        kid_number = payload.kid_number
        target_place = payload.place or (suggest_next_free_base_place() or "")
        existing = _find_kid_by_number_and_place(kid_number, target_place)

        if existing is not None:
            kid = existing
            skipped += 1
        else:
            if find_place_conflict(target_place) is not None:
                skipped += 1
                continue
            with workspace_atomic():
                kid = Kid.objects.create(
                    kid_number=[kid_number],
                    place=target_place or "",
                    photo=payload.photos,
                    room=payload.room,
                    store=payload.store,
                    b_ware=payload.b_ware,
                    commentary=payload.commentary,
                    section=None,
                )
                ean_row = Ean.objects.create(
                    kid=kid,
                    jv=payload.jv,
                    otto_jv=payload.otto_jv,
                    otto_xl=payload.otto_xl,
                    ebay_xl=payload.ebay_xl,
                )
                EanStatus.objects.create(
                    ean=kid,
                    **_build_ean_status_defaults(ean_row),
                )
                ProductAttributes.objects.create(
                    kid=kid,
                    quantity=payload.quantity,
                    company=payload.company,
                    currency="EUR",
                )
            created += 1
        kid_map.setdefault(kid_number, []).append(kid)

    return kid_map, KidImportStats(
        created=created,
        place_appended=place_appended,
        skipped=skipped,
        total_payloads=len(payloads),
    )


def _is_timeout_error(exc: Exception) -> bool:
    if isinstance(exc, requests.Timeout):
        return True
    if isinstance(exc, requests.RequestException):
        message = str(exc).lower()
        return "timed out" in message or "timeout" in message
    return False


def fetch_orders_for_kid(
    *,
    kid_number: str,
    max_total: int,
    max_items_per_page: int,
    timeout_retries: int,
    timeout_retry_delay: float,
) -> FetchResult:
    max_attempts = max(1, timeout_retries + 1)

    for attempt in range(1, max_attempts + 1):
        try:
            items = search_items_auktionsliste(
                kundennummer=kid_number,
                max_total=max_total,
                max_items_per_page=max_items_per_page,
            )
            if not isinstance(items, list):
                return FetchResult(kid_number=kid_number, items=[], error="Parser returned non-list result")
            return FetchResult(kid_number=kid_number, items=items)
        except Exception as exc:  # noqa: BLE001
            if attempt < max_attempts and _is_timeout_error(exc):
                backoff = max(0.0, timeout_retry_delay) * (2 ** (attempt - 1))
                if backoff > 0:
                    time.sleep(backoff)
                continue
            return FetchResult(kid_number=kid_number, items=[], error=str(exc))

    return FetchResult(kid_number=kid_number, items=[], error="Unknown fetch error")


def fetch_afterbuy_orders_parallel(
    kid_numbers: list[str],
    *,
    max_total: int,
    max_items_per_page: int,
    workers: int,
    timeout_retries: int,
    timeout_retry_delay: float,
    show_progress: bool,
    on_result: Callable[[FetchResult, int, int], None] | None = None,
) -> list[FetchResult]:
    if not kid_numbers:
        return []

    safe_workers = max(1, workers)
    progress = ProgressBar(total=len(kid_numbers), prefix="Afterbuy fetch") if show_progress else None
    if progress is not None:
        progress._render()
    results: dict[str, FetchResult] = {}

    with ThreadPoolExecutor(max_workers=safe_workers) as executor:
        future_to_kid = {
            executor.submit(
                fetch_orders_for_kid,
                kid_number=kid_number,
                max_total=max_total,
                max_items_per_page=max_items_per_page,
                timeout_retries=timeout_retries,
                timeout_retry_delay=timeout_retry_delay,
            ): kid_number
            for kid_number in kid_numbers
        }
        for future in as_completed(future_to_kid):
            kid_number = future_to_kid[future]
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001
                result = FetchResult(kid_number=kid_number, items=[], error=str(exc))
            results[kid_number] = result
            if on_result is not None:
                on_result(result, len(results), len(kid_numbers))
            if progress is not None:
                progress.tick()

    if progress is not None:
        progress.finish()
    return [results[kid_number] for kid_number in kid_numbers]


def _upsert_orders_for_fetch_result(
    *,
    kid_map: dict[str, list[Kid]],
    result: FetchResult,
) -> tuple[bool, int, int, int, int, KidGreenImportItemResult]:
    if result.error:
        return (
            True,
            0,
            0,
            0,
            0,
            KidGreenImportItemResult(
                kid_number=result.kid_number,
                status="fetch_error",
                fetched_items=0,
                collapsed_items=0,
                orders_created=0,
                orders_updated=0,
                skipped_without_order_id=0,
                error=result.error,
            ),
        )

    kids = kid_map.get(result.kid_number) or []
    if not kids:
        return (
            True,
            0,
            0,
            0,
            0,
            KidGreenImportItemResult(
                kid_number=result.kid_number,
                status="missing_kid",
                fetched_items=len(result.items) if isinstance(result.items, list) else 0,
                collapsed_items=0,
                orders_created=0,
                orders_updated=0,
                skipped_without_order_id=0,
                error="Kid was not found after upsert.",
            ),
        )

    raw_items = result.items if isinstance(result.items, list) else []
    items, dropped_count = collapse_items_to_orders(raw_items)
    created = 0
    updated = 0
    skipped_without_order_id = 0

    for kid in kids:
        for item in items:
            order_id = str(item.get("order_id") or "").strip()
            if not order_id:
                skipped_without_order_id += 1
                continue

            verkaufsdatum = str(item.get("verkaufsdatum") or item.get("order_date") or "").strip()
            zahlungssumme = str(item.get("zahlungssumme") or "").strip()
            rechnungssumme = str(item.get("rechnungssumme") or "").strip()
            title = str(item.get("title") or "").strip()
            sku = str(item.get("sku") or "").strip() or None
            memo = str(item.get("memo") or "").strip() or None
            platform = str(item.get("platform") or "").strip() or None
            buyer = str(item.get("buyer") or "").strip() or None

            defaults = {
                "platform": platform,
                "buyer": buyer,
                "title": title,
                "sku": sku,
                "memo": memo,
                "order_date": parse_afterbuy_datetime(verkaufsdatum),
                "status": _status_by_amounts(zahlungssumme, rechnungssumme),
                "full_amount": rechnungssumme or None,
            }
            source_order_ids = [str(x).strip() for x in (item.get("source_order_ids") or []) if str(x).strip()]
            order_id_candidates = [order_id, *source_order_ids]
            seen_candidates: set[str] = set()
            order_id_candidates = [
                value
                for value in order_id_candidates
                if value and not (value in seen_candidates or seen_candidates.add(value))
            ]

            order = Orders.objects.filter(kid=kid, order_id__in=order_id_candidates).first()
            if order is None:
                Orders.objects.create(kid=kid, order_id=order_id, **defaults)
                created += 1
                continue

            fields_to_update: list[str] = []
            if order.order_id != order_id:
                order.order_id = order_id
                fields_to_update.append("order_id")
            for field, value in defaults.items():
                if getattr(order, field) != value:
                    setattr(order, field, value)
                    fields_to_update.append(field)
            if fields_to_update:
                order.save(update_fields=fields_to_update)
                updated += 1

    return (
        False,
        created,
        updated,
        skipped_without_order_id,
        dropped_count,
        KidGreenImportItemResult(
            kid_number=result.kid_number,
            status="ok",
            fetched_items=len(raw_items),
            collapsed_items=len(items),
            orders_created=created,
            orders_updated=updated,
            skipped_without_order_id=skipped_without_order_id,
        ),
    )


def upsert_orders_for_kids(
    kid_map: dict[str, list[Kid]],
    *,
    max_total: int,
    max_items_per_page: int,
    workers: int,
    timeout_retries: int,
    timeout_retry_delay: float,
    show_progress: bool,
    progress_callback: Callable[[dict], None] | None = None,
) -> tuple[list[str], OrderImportStats, list[KidGreenImportItemResult]]:
    created = 0
    updated = 0
    skipped_without_order_id = 0
    failed_kids: list[str] = []
    collapsed_positions_total = 0
    item_results: list[KidGreenImportItemResult] = []
    item_results_by_kid: dict[str, KidGreenImportItemResult] = {}
    processed_count = 0
    total_kid_numbers = len(kid_map)
    if total_kid_numbers == 0:
        return (
            [],
            OrderImportStats(
                created=0,
                updated=0,
                collapsed_positions=0,
                skipped_without_order_id=0,
                failed_kids_count=0,
            ),
            [],
        )

    safe_workers = max(1, workers)
    progress = ProgressBar(total=total_kid_numbers, prefix="Afterbuy fetch") if show_progress else None
    if progress is not None:
        progress._render()
    retry_candidates: list[str] = []

    with ThreadPoolExecutor(max_workers=safe_workers) as executor:
        future_to_kid = {
            executor.submit(
                fetch_orders_for_kid,
                kid_number=kid_number,
                max_total=max_total,
                max_items_per_page=max_items_per_page,
                timeout_retries=timeout_retries,
                timeout_retry_delay=timeout_retry_delay,
            ): kid_number
            for kid_number in kid_map.keys()
        }

        for future in as_completed(future_to_kid):
            kid_number = future_to_kid[future]
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001
                result = FetchResult(kid_number=kid_number, items=[], error=str(exc))

            processed_count += 1
            if progress_callback is not None:
                progress_callback(
                    {
                        "type": "afterbuy_fetched",
                        "kid_number": result.kid_number,
                        "completed": processed_count,
                        "total": total_kid_numbers,
                        "fetched_items": len(result.items) if isinstance(result.items, list) else 0,
                        "error": result.error,
                    }
                )

            failed, created_delta, updated_delta, skipped_delta, dropped_delta, item_result = _upsert_orders_for_fetch_result(
                kid_map=kid_map,
                result=result,
            )
            if failed:
                failed_kids.append(result.kid_number)
                if item_result.status == "fetch_error":
                    retry_candidates.append(result.kid_number)
            created += created_delta
            updated += updated_delta
            skipped_without_order_id += skipped_delta
            collapsed_positions_total += dropped_delta
            item_results.append(item_result)
            item_results_by_kid[result.kid_number] = item_result

            if progress_callback is not None:
                progress_callback({"type": "kid_processed", "completed": processed_count, "total": total_kid_numbers, **asdict(item_result)})
            if progress is not None:
                progress.tick()

    if progress is not None:
        progress.finish()

    unique_retry_candidates = list(dict.fromkeys(retry_candidates))
    if unique_retry_candidates:
        final_retry_timeout_retries = max(timeout_retries, 1)
        final_retry_workers = min(FINAL_FETCH_RETRY_WORKERS, len(unique_retry_candidates))
        retry_results = fetch_afterbuy_orders_parallel(
            unique_retry_candidates,
            max_total=max_total,
            max_items_per_page=max_items_per_page,
            workers=final_retry_workers,
            timeout_retries=final_retry_timeout_retries,
            timeout_retry_delay=timeout_retry_delay,
            show_progress=False,
        )
        for retry_result in retry_results:
            previous_item_result = item_results_by_kid.get(retry_result.kid_number)
            if previous_item_result is None or previous_item_result.status != "fetch_error":
                continue

            failed, created_delta, updated_delta, skipped_delta, dropped_delta, item_result = _upsert_orders_for_fetch_result(
                kid_map=kid_map,
                result=retry_result,
            )
            if failed:
                item_results_by_kid[retry_result.kid_number] = item_result
                continue

            created += created_delta
            updated += updated_delta
            skipped_without_order_id += skipped_delta
            collapsed_positions_total += dropped_delta
            item_results_by_kid[retry_result.kid_number] = item_result
            failed_kids = [kid_number for kid_number in failed_kids if kid_number != retry_result.kid_number]

    item_results = [
        item_results_by_kid[kid_number]
        for kid_number in kid_map.keys()
        if kid_number in item_results_by_kid
    ]

    unique_failed = list(dict.fromkeys(failed_kids))
    return (
        unique_failed,
        OrderImportStats(
            created=created,
            updated=updated,
            collapsed_positions=collapsed_positions_total,
            skipped_without_order_id=skipped_without_order_id,
            failed_kids_count=len(unique_failed),
        ),
        item_results,
    )


def upsert_afterbuy_api_orders_for_kids(
    kid_map: dict[str, list[Kid]],
    *,
    workers: int,
    progress_callback: Callable[[dict], None] | None = None,
) -> tuple[list[str], OrderImportStats, list[KidGreenImportItemResult]]:
    """Synchronise orders through the Afterbuy XML API without HTML scraping."""

    sync_service = AfterbuyKidSyncService()
    failed_kids: list[str] = []
    item_results: list[KidGreenImportItemResult] = []
    created = updated = 0
    lookup_results: dict[str, AfterbuyLookupResult | None] = {}
    lookup_errors: set[str] = set()
    total_kid_numbers = len(kid_map)
    fetched_count = 0

    safe_workers = max(1, min(workers, len(kid_map)))
    with ThreadPoolExecutor(max_workers=safe_workers) as executor:
        future_to_kid = {
            executor.submit(sync_service.lookup_kid, kid_number): kid_number
            for kid_number in kid_map
        }
        for future in as_completed(future_to_kid):
            kid_number = future_to_kid[future]
            error = ""
            try:
                lookup_results[kid_number] = future.result()
            except Exception as exc:  # noqa: BLE001
                logger.exception("AFTERBUY_API_LOOKUP_FAILED kid_number=%s", kid_number)
                lookup_errors.add(kid_number)
                error = str(exc)

            fetched_count += 1
            if progress_callback is not None:
                lookup_result = lookup_results.get(kid_number)
                progress_callback(
                    {
                        "type": "afterbuy_fetched",
                        "kid_number": kid_number,
                        "completed": fetched_count,
                        "total": total_kid_numbers,
                        "fetched_items": sum(len(order.items) for order in lookup_result.orders)
                        if lookup_result is not None
                        else 0,
                        "error": error or None,
                    }
                )

    processed_count = 0
    for kid_number, kids in kid_map.items():
        kid_created = kid_updated = synced_items = 0
        try:
            lookup_result = lookup_results.get(kid_number)
            if lookup_result is None:
                if kid_number in lookup_errors:
                    raise RuntimeError("afterbuy_api_lookup_failed")
                item_results.append(
                    KidGreenImportItemResult(
                        kid_number=kid_number,
                        status="not_found",
                        fetched_items=0,
                        collapsed_items=0,
                        orders_created=0,
                        orders_updated=0,
                        skipped_without_order_id=0,
                    )
                )
                continue
            for kid in kids:
                sync_stats = sync_service.sync_lookup_result(kid=kid, lookup_result=lookup_result)
                kid_created += sync_stats.orders_created
                kid_updated += sync_stats.orders_updated
                synced_items += sync_stats.items_created + sync_stats.items_updated

            item_results.append(
                KidGreenImportItemResult(
                    kid_number=kid_number,
                    status="ok" if kid_created or kid_updated or synced_items else "not_found",
                    fetched_items=synced_items,
                    collapsed_items=0,
                    orders_created=kid_created,
                    orders_updated=kid_updated,
                    skipped_without_order_id=0,
                )
            )
            created += kid_created
            updated += kid_updated
        except Exception:  # noqa: BLE001
            logger.exception("AFTERBUY_API_SYNC_FAILED kid_number=%s", kid_number)
            failed_kids.append(kid_number)
            item_results.append(
                KidGreenImportItemResult(
                    kid_number=kid_number,
                    status="sync_error",
                    fetched_items=0,
                    collapsed_items=0,
                    orders_created=0,
                    orders_updated=0,
                    skipped_without_order_id=0,
                    error="afterbuy_api_sync_failed",
                )
            )
        finally:
            processed_count += 1
            if progress_callback is not None:
                progress_callback(
                    {
                        "type": "kid_processed",
                        "completed": processed_count,
                        "total": total_kid_numbers,
                        **asdict(item_results[-1]),
                    }
                )

    return (
        failed_kids,
        OrderImportStats(
            created=created,
            updated=updated,
            collapsed_positions=0,
            skipped_without_order_id=0,
            failed_kids_count=len(failed_kids),
        ),
        item_results,
    )


def import_kid_green_json_bytes(
    raw_bytes: bytes,
    *,
    options: KidGreenImportOptions | None = None,
    progress_callback: Callable[[dict], None] | None = None,
) -> KidGreenImportResult:
    effective_options = options or KidGreenImportOptions()
    payloads = load_kid_payloads_from_bytes(raw_bytes)
    if not payloads:
        return KidGreenImportResult(
            total_payloads=0,
            unique_kids=0,
            kid_stats=KidImportStats(created=0, place_appended=0, skipped=0, total_payloads=0),
            order_stats=OrderImportStats(created=0, updated=0, collapsed_positions=0, skipped_without_order_id=0, failed_kids_count=0),
            failed_kids=[],
        )

    kid_map, kid_stats = upsert_kids(payloads)
    if progress_callback is not None:
        progress_callback(
            {
                "type": "start",
                "total_payloads": len(payloads),
                "unique_kids": len(kid_map),
            }
        )
    failed_kids, order_stats, item_results = upsert_afterbuy_api_orders_for_kids(
        kid_map,
        workers=effective_options.workers,
        progress_callback=progress_callback,
    )
    unique_kids = len({payload.kid_number for payload in payloads.values()})
    return KidGreenImportResult(
        total_payloads=len(payloads),
        unique_kids=unique_kids,
        kid_stats=kid_stats,
        order_stats=order_stats,
        failed_kids=failed_kids,
        item_results=item_results,
    )
