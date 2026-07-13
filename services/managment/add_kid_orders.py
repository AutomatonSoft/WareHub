from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import re
import sys
import threading
import time
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_JSON_PATH = BASE_DIR / "kid_green.json"
DEFAULT_FAILED_KIDS_PATH = BASE_DIR / "failed_kids.txt"
PROJECT_DIR = BASE_DIR.parent / "database-service"
DJANGO_PROJECT_DIR = PROJECT_DIR / "database_service"
PROJECT_ROOT = PROJECT_DIR.parent
ROOT_ENV_PATH = PROJECT_ROOT / ".env"
VENV_PYTHON = PROJECT_DIR / ".venv" / "bin" / "python"


def ensure_project_python() -> None:
    if not VENV_PYTHON.exists():
        return

    current_python = Path(sys.executable)
    if current_python == VENV_PYTHON:
        return

    try:
        import requests  # noqa: F401
        import django  # noqa: F401
        return
    except ModuleNotFoundError:
        os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), *sys.argv])


ensure_project_python()

import requests

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))
if str(DJANGO_PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(DJANGO_PROJECT_DIR))

if ROOT_ENV_PATH.is_file():
    load_dotenv(ROOT_ENV_PATH, override=False)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "database_service.settings")
# Default DB target for this import script: local dev Postgres.
# Any explicitly exported env vars still override these defaults.
os.environ.setdefault("WAREHUB_LOCAL_DEV_ROOT_ENV_ACTIVE", "true")
os.environ.setdefault("POSTGRES_DB", "warehub")
os.environ.setdefault("POSTGRES_USER", "warehub")
os.environ.setdefault("POSTGRES_PASSWORD", "warehub")
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("POSTGRES_PORT", "8933")

import django  # noqa: E402

django.setup()

try:
    from database.models import Ean, Kid, Orders, ProductAttributes  # noqa: E402
except (ImportError, ModuleNotFoundError):
    from database import models as database_models  # noqa: E402

    Ean = database_models.Ean  # noqa: E402
    Kid = database_models.Kid  # noqa: E402
    Orders = database_models.Orders  # noqa: E402
    ProductAttributes = database_models.ProductAttributes  # noqa: E402

from django.db import transaction  # noqa: E402

from orders_pars.service import (
    collapse_items_to_orders,
    parse_afterbuy_datetime,
    search_items_auktionsliste,
)  # noqa: E402


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


def _ensure_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    return [text] if text else []


def load_kid_payloads(json_path: Path) -> dict[tuple[str, str], KidPayload]:
    if not json_path.exists():
        raise FileNotFoundError(f"JSON file not found: {json_path}")
    raw = json.loads(json_path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise RuntimeError("kid_green.json must contain a JSON array.")

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
            )
            continue

        payload = grouped[key]
        if photo and photo not in payload.photos:
            payload.photos.append(photo)
    return grouped


def load_kid_numbers_filter(file_path: Path) -> set[str]:
    if not file_path.exists():
        return set()

    raw = file_path.read_text(encoding="utf-8").strip()
    if not raw:
        return set()

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return {str(item).strip() for item in parsed if str(item).strip()}
    except json.JSONDecodeError:
        pass

    return {line.strip() for line in raw.splitlines() if line.strip()}


def save_failed_kids(file_path: Path, kid_numbers: list[str]) -> None:
    unique_failed = sorted(set(kid_numbers))
    file_path.parent.mkdir(parents=True, exist_ok=True)
    content = "\n".join(unique_failed)
    if content:
        content += "\n"
    file_path.write_text(content, encoding="utf-8")
    print(f"Failed kid list saved: {len(unique_failed)} -> {file_path}")


def _is_timeout_error(exc: Exception) -> bool:
    if isinstance(exc, requests.Timeout):
        return True
    if isinstance(exc, requests.RequestException):
        message = str(exc).lower()
        return "timed out" in message or "timeout" in message
    return False


def _normalized_place_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        raw_values = value
    else:
        raw_values = [value]

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


def upsert_kids(payloads: dict[tuple[str, str], KidPayload]) -> dict[str, list[Kid]]:
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

    print(
        f"Kid: created={created}, place_appended={place_appended}, "
        f"skipped={skipped}, total_payloads={len(payloads)}"
    )
    return kid_map


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
) -> list[FetchResult]:
    if not kid_numbers:
        return []

    safe_workers = max(1, workers)
    progress = ProgressBar(total=len(kid_numbers), prefix="Afterbuy fetch")
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
            progress.tick()

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
) -> list[str]:
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
    )

    for result in fetch_results:
        if result.error:
            failed_kids.append(result.kid_number)
            print(f"[WARN] kid={result.kid_number}: parser error: {result.error}")
            continue

        kids = kid_map.get(result.kid_number) or []
        if not kids:
            failed_kids.append(result.kid_number)
            print(f"[WARN] kid={result.kid_number}: not found in kid_map")
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
                    order = Orders.objects.create(kid=kid, order_id=order_id, **defaults)
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
    print(
        "Orders: "
        f"created={created}, updated={updated}, "
        f"collapsed_positions={collapsed_positions_total}, "
        f"skipped_without_order_id={skipped_without_order_id}, failed_kids={len(unique_failed)}"
    )
    return unique_failed

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Import Kid from kid_green.json and fill Orders via Afterbuy parser "
            "(search_items_auktionsliste)."
        )
    )
    parser.add_argument(
        "--json",
        dest="json_path",
        default=str(DEFAULT_JSON_PATH),
        help=f"Path to kid_green.json (default: {DEFAULT_JSON_PATH})",
    )
    parser.add_argument("--max-total", type=int, default=500, help="Afterbuy max_total filter (default: 500)")
    parser.add_argument(
        "--max-items-per-page",
        type=int,
        default=20,
        help="Afterbuy max_items_per_page filter (default: 20)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=5,
        help="Parallel worker count for Afterbuy fetch (default: 5)",
    )
    parser.add_argument(
        "--timeout-retries",
        type=int,
        default=2,
        help="Retries for timeout errors per kid (default: 2)",
    )
    parser.add_argument(
        "--timeout-retry-delay",
        type=float,
        default=1.5,
        help="Initial retry delay in seconds for timeout errors (default: 1.5)",
    )
    parser.add_argument(
        "--failed-kids-file",
        default=str(DEFAULT_FAILED_KIDS_PATH),
        help=f"Path to failed kid list file (default: {DEFAULT_FAILED_KIDS_PATH})",
    )
    parser.add_argument(
        "--only-failed",
        action="store_true",
        help="Process only kid numbers from --failed-kids-file",
    )
    args = parser.parse_args()

    json_path = Path(args.json_path).resolve()
    failed_kids_file = Path(args.failed_kids_file).resolve()
    max_total = max(1, min(args.max_total, 5000))
    max_items_per_page = max(1, min(args.max_items_per_page, 100))
    workers = max(1, min(args.workers, 32))
    timeout_retries = max(0, min(args.timeout_retries, 10))
    timeout_retry_delay = max(0.0, min(args.timeout_retry_delay, 60.0))

    payloads = load_kid_payloads(json_path)
    if args.only_failed:
        only_failed = load_kid_numbers_filter(failed_kids_file)
        payloads = {key: payload for key, payload in payloads.items() if payload.kid_number in only_failed}
        print(f"Filtered by failed list: {len(payloads)} from {failed_kids_file}")

    if not payloads:
        print("No kid payloads to process. Done.")
        return

    unique_kids = len({payload.kid_number for payload in payloads.values()})
    print(f"Loaded kid payloads: {len(payloads)} (unique_kids={unique_kids}) from {json_path}")
    print(
        "Afterbuy fetch mode: "
        f"workers={workers}, max_total={max_total}, max_items_per_page={max_items_per_page}, "
        f"timeout_retries={timeout_retries}, timeout_retry_delay={timeout_retry_delay}"
    )

    kid_map = upsert_kids(payloads)
    failed_kids = upsert_orders_for_kids(
        kid_map,
        max_total=max_total,
        max_items_per_page=max_items_per_page,
        workers=workers,
        timeout_retries=timeout_retries,
        timeout_retry_delay=timeout_retry_delay,
    )
    save_failed_kids(failed_kids_file, failed_kids)
    print("Done.")


if __name__ == "__main__":
    main()
