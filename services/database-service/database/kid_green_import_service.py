from __future__ import annotations

import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation

import requests
from django.db import transaction

from .models import Ean, Kid, Orders, ProductAttributes
from orders_pars.service import (
    collapse_items_to_orders,
    parse_afterbuy_datetime,
    search_items_auktionsliste,
)


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
    listing_status: str | None


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
class KidGreenImportResult:
    total_payloads: int
    unique_kids: int
    kid_stats: KidImportStats
    order_stats: OrderImportStats
    failed_kids: list[str]

    def to_dict(self) -> dict:
        return {
            "total_payloads": self.total_payloads,
            "unique_kids": self.unique_kids,
            "kid_stats": asdict(self.kid_stats),
            "order_stats": asdict(self.order_stats),
            "failed_kids": list(self.failed_kids),
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


def _find_kid_by_number(kid_number: str) -> Kid | None:
    return Kid.objects.filter(kid_number__contains=[kid_number]).order_by("id").first()


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
        place = _normalize_text(row.get("place") or row.get("stoyanka"))
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
                listing_status=_normalize_optional_text(row.get("listing_status")),
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
        target_place = payload.place
        existing = _find_kid_by_number(kid_number)

        if existing is not None:
            kid = existing
            current_places = _normalized_place_list(kid.place)
            if target_place and target_place not in current_places:
                current_places.append(target_place)
                kid.place = current_places
                kid.save(update_fields=["place"])
                place_appended += 1
            else:
                skipped += 1
        else:
            with transaction.atomic():
                kid = Kid.objects.create(
                    kid_number=[kid_number],
                    place=[target_place] if target_place else [],
                    photo=payload.photos,
                    room=payload.room,
                    store=payload.store,
                    b_ware=payload.b_ware,
                    listing_status=payload.listing_status or "unlisted",
                    commentary=payload.commentary,
                )
                Ean.objects.create(
                    kid=kid,
                    jv=payload.jv,
                    otto_jv=payload.otto_jv,
                    otto_xl=payload.otto_xl,
                    ebay_xl=payload.ebay_xl,
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
            if progress is not None:
                progress.tick()

    if progress is not None:
        progress.finish()
    return [results[kid_number] for kid_number in kid_numbers]


def upsert_orders_for_kids(
    kid_map: dict[str, list[Kid]],
    *,
    max_total: int,
    max_items_per_page: int,
    workers: int,
    timeout_retries: int,
    timeout_retry_delay: float,
    show_progress: bool,
) -> tuple[list[str], OrderImportStats]:
    created = 0
    updated = 0
    skipped_without_order_id = 0
    failed_kids: list[str] = []
    collapsed_positions_total = 0

    fetch_results = fetch_afterbuy_orders_parallel(
        list(kid_map.keys()),
        max_total=max_total,
        max_items_per_page=max_items_per_page,
        workers=workers,
        timeout_retries=timeout_retries,
        timeout_retry_delay=timeout_retry_delay,
        show_progress=show_progress,
    )

    for result in fetch_results:
        if result.error:
            failed_kids.append(result.kid_number)
            continue

        kids = kid_map.get(result.kid_number) or []
        if not kids:
            failed_kids.append(result.kid_number)
            continue

        raw_items = result.items if isinstance(result.items, list) else []
        items, dropped_count = collapse_items_to_orders(raw_items)
        collapsed_positions_total += dropped_count

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
                    "date": parse_afterbuy_datetime(verkaufsdatum),
                    "status": _status_by_amounts(zahlungssumme, rechnungssumme),
                    "payment_status": rechnungssumme or None,
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

    unique_failed = list(dict.fromkeys(failed_kids))
    return unique_failed, OrderImportStats(
        created=created,
        updated=updated,
        collapsed_positions=collapsed_positions_total,
        skipped_without_order_id=skipped_without_order_id,
        failed_kids_count=len(unique_failed),
    )


def import_kid_green_json_bytes(raw_bytes: bytes, *, options: KidGreenImportOptions | None = None) -> KidGreenImportResult:
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
    failed_kids, order_stats = upsert_orders_for_kids(
        kid_map,
        max_total=effective_options.max_total,
        max_items_per_page=effective_options.max_items_per_page,
        workers=effective_options.workers,
        timeout_retries=effective_options.timeout_retries,
        timeout_retry_delay=effective_options.timeout_retry_delay,
        show_progress=effective_options.show_progress,
    )
    unique_kids = len({payload.kid_number for payload in payloads.values()})
    return KidGreenImportResult(
        total_payloads=len(payloads),
        unique_kids=unique_kids,
        kid_stats=kid_stats,
        order_stats=order_stats,
        failed_kids=failed_kids,
    )
