import re
import logging
from decimal import Decimal
from datetime import datetime, timezone

from django.db.models import Count, Q

from hood_service.models import HoodApiResponseJV, HoodApiResponseXL
from catalog_core.models import ImportedProduct

from .kid_number_utils import primary_kid_number
from .ftp_upload import normalize_managed_public_photo_value
from .models import EanStatus, Kid, Orders
from .order_amounts import parse_order_amount

logger = logging.getLogger(__name__)
DEFAULT_EAN = ""
MARKETPLACE_STATUS_FIELDS = (
    "jv",
    "xl",
    "otto_jv",
    "otto_xl",
    "ebay_jv",
    "ebay_xl",
    "kaufland_jv",
    "kaufland_xl",
    "hood_jv",
    "hood_xl",
)


def _has_photo_value(value: object) -> bool:
    if isinstance(value, list):
        return any(str(item or "").strip() for item in value)
    return bool(str(value or "").strip())


def _has_main_ean(value: object) -> bool:
    normalized = str(value or "").strip()
    return bool(normalized) and normalized != "0000000000000"


def build_inventory_dashboard_summary() -> dict[str, object]:
    rows = Kid.objects.values(
        "place",
        "photo",
        "in_transit",
        "b_ware",
        "ean__main_ean",
        "product_attributes__price",
    )

    total_products = 0
    placed_products = 0
    without_photos = 0
    without_ean = 0
    without_price = 0
    ready_for_listing = 0
    in_transit_products = 0
    b_ware_products = 0

    for row in rows.iterator():
        total_products += 1
        has_place = bool(str(row["place"] or "").strip())
        has_photo = _has_photo_value(row["photo"])
        has_ean = _has_main_ean(row["ean__main_ean"])
        has_price = row["product_attributes__price"] is not None

        if has_place:
            placed_products += 1
        if not has_photo:
            without_photos += 1
        if not has_ean:
            without_ean += 1
        if not has_price:
            without_price += 1
        if has_photo and has_ean and has_price:
            ready_for_listing += 1
        if row["in_transit"]:
            in_transit_products += 1
        if row["b_ware"]:
            b_ware_products += 1

    readiness_percent = 0
    if total_products:
        readiness_percent = round((ready_for_listing / total_products) * 100)

    status_aggregate = EanStatus.objects.aggregate(
        **{
            f"{field_name}_true": Count("id", filter=Q(**{field_name: True}))
            for field_name in MARKETPLACE_STATUS_FIELDS
        },
        **{
            f"{field_name}_false": Count("id", filter=Q(**{field_name: False}))
            for field_name in MARKETPLACE_STATUS_FIELDS
        },
    )
    marketplace_statuses = {
        field_name: {
            "true_count": status_aggregate[f"{field_name}_true"],
            "false_count": status_aggregate[f"{field_name}_false"],
        }
        for field_name in MARKETPLACE_STATUS_FIELDS
    }

    paid_revenue = Decimal("0")
    paid_order_amounts = Orders.objects.filter(status="paid").values_list("full_amount", flat=True)
    for raw_amount in paid_order_amounts.iterator():
        amount = parse_order_amount(raw_amount)
        if amount is not None and amount > 0:
            paid_revenue += amount

    return {
        "total_products": total_products,
        "placed_products": placed_products,
        "unplaced_products": total_products - placed_products,
        "without_photos": without_photos,
        "without_ean": without_ean,
        "without_price": without_price,
        "ready_for_listing": ready_for_listing,
        "readiness_percent": readiness_percent,
        "in_transit_products": in_transit_products,
        "b_ware_products": b_ware_products,
        "paid_revenue": format(paid_revenue, "f"),
        "marketplace_statuses": marketplace_statuses,
    }


def _critical_inventory_score(row: dict) -> tuple[int, int]:
    weights = (24, 18, 12, 7, 12, 8, 8, 10, 5, 4, 4, 4, 4, 9, 9, 3, 3, 3, 2, 2, 2, 2, 1, 8)
    missing = lambda key: not str(row.get(key) or "").strip() or str(row.get(key) or "").strip() == "-"
    order_date = row.get("order_date")
    days = None
    if isinstance(order_date, datetime):
        days = max(0, (datetime.now(timezone.utc) - order_date.astimezone(timezone.utc)).days)
    age = weights[23] if days is None else weights[0] if days >= 180 else weights[1] if days >= 120 else weights[2] if days >= 90 else weights[3] if days >= 45 else 0
    marketplace_groups = (("jv_ean", "xl_ean"), ("otto_jv_ean", "otto_xl_ean"), ("ebay_jv_ean", "ebay_xl_ean"), ("kaufland_jv_ean", "kaufland_xl_ean"), ("hood_jv_ean", "hood_xl_ean"))
    score = age
    for weight, key in zip(weights[4:8], ("place", "section", "photo", "main_ean"), strict=True):
        if missing(key): score += weight
    for weight, keys in zip(weights[8:13], marketplace_groups, strict=True):
        if all(missing(key) for key in keys): score += weight
    for weight, key in zip(weights[13:23], ("global_price", "quantity", "room", "type", "company", "color", "size", "material", "commentary", "kid_account"), strict=True):
        if missing(key) or (key == "quantity" and not row.get(key)):
            score += weight
    return min(100, max(1, round((score / 119) * 100))) if score else 0, days or 0


def build_critical_inventory_rows(limit: int = 10) -> dict[str, object]:
    rows = build_inventory_rows()
    critical_rows = [row for row in rows if _critical_inventory_score(row)[0] > 0]
    critical_rows.sort(key=lambda row: (-_critical_inventory_score(row)[0], -_critical_inventory_score(row)[1], str(row.get("kid_number") or "")))
    places = sorted({str(row.get("place") or "").strip() for row in rows if str(row.get("place") or "").strip()})
    return {"results": critical_rows[:limit], "available_places": places, "occupied_places": places}

def _norm_ean(value: object) -> str:
    normalized = str(value or "").strip()
    return normalized or DEFAULT_EAN

def split_order_ids(raw_order_id: str) -> list[str]:
    raw = str(raw_order_id or "").strip()
    if not raw:
        return []
    parts = [part.strip() for part in raw.split(",")]
    seen: set[str] = set()
    result: list[str] = []
    for part in parts:
        if not part or part in seen:
            continue
        seen.add(part)
        result.append(part)
    return result


EAN_PATTERN = re.compile(r"\b\d{8,14}\b")


def extract_eans_from_text(value: str) -> list[str]:
    text = str(value or "")
    if not text:
        return []
    seen: set[str] = set()
    result: list[str] = []
    for match in EAN_PATTERN.findall(text):
        normalized = match.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def extract_order_eans(order: Orders, additional_items: list[dict]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []

    def push_many(values: list[str]) -> None:
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            result.append(value)

    push_many(extract_eans_from_text(order.sku or ""))
    for entry in additional_items:
        if not isinstance(entry, dict):
            continue
        push_many(extract_eans_from_text(str(entry.get("sku") or "")))
    return result


def build_external_ean_links(eans: set[str]) -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    catalog_map: dict[str, list[dict]] = {ean: [] for ean in eans}
    hood_map: dict[str, list[dict]] = {ean: [] for ean in eans}
    if not eans:
        return catalog_map, hood_map

    try:
        products = (
            ImportedProduct.objects.filter(ean__in=eans)
            .order_by("ean", "site", "-updated_at")
            .values("id", "ean", "site", "source_product_id", "source_sku", "price", "quantity", "status")
        )
        for product in products:
            ean = str(product.get("ean") or "").strip()
            if not ean:
                continue
            catalog_map.setdefault(ean, []).append(
                {
                    "id": product.get("id"),
                    "site": product.get("site"),
                    "source_product_id": product.get("source_product_id"),
                    "source_sku": product.get("source_sku") or "",
                    "price": str(product.get("price")) if product.get("price") is not None else None,
                    "quantity": product.get("quantity"),
                    "status": bool(product.get("status")),
                }
            )
    except Exception:
        logger.warning("INVENTORY_CATALOG_LINKS_FAILED code=inventory_catalog_links_failed", exc_info=True)

    try:
        jv_rows = (
            HoodApiResponseJV.objects.filter(ean__in=eans)
            .order_by("ean", "-updated_at")
            .values("id", "ean", "account", "status", "success", "updated_at")
        )
        xl_rows = (
            HoodApiResponseXL.objects.filter(ean__in=eans)
            .order_by("ean", "-updated_at")
            .values("id", "ean", "account", "status", "success", "updated_at")
        )
        seen_hood: set[tuple[str, str]] = set()
        for row in list(jv_rows) + list(xl_rows):
            ean = str(row.get("ean") or "").strip()
            account = str(row.get("account") or "").strip().upper()
            if not ean:
                continue
            key = (ean, account)
            if key in seen_hood:
                continue
            seen_hood.add(key)
            hood_map.setdefault(ean, []).append(
                {
                    "id": row.get("id"),
                    "account": account,
                    "status": row.get("status") or "",
                    "success": bool(row.get("success")),
                    "updated_at": row.get("updated_at"),
                }
            )
    except Exception:
        logger.warning("INVENTORY_HOOD_LINKS_FAILED code=inventory_hood_links_failed", exc_info=True)

    return catalog_map, hood_map


def _append_unique_text(target: list[str], seen: set[str], value: object) -> None:
    normalized = str(value or "").strip()
    if not normalized or normalized in seen:
        return
    seen.add(normalized)
    target.append(normalized)


def _join_unique_text(values: list[str], empty: str = "-") -> str:
    return " | ".join(values) if values else empty


def build_inventory_rows() -> list[dict]:
    orders = list(Orders.objects.select_related("kid").all().order_by("id"))
    kids = list(Kid.objects.select_related("ean", "status", "product_attributes").order_by("id"))
    orders_by_kid_id: dict[int, list[dict]] = {}
    all_eans: set[str] = set()
    rows: list[dict] = []

    for order in orders:
        additional_items = order.additional_items if isinstance(order.additional_items, list) else []
        sku_eans = extract_order_eans(order, additional_items)
        for ean in sku_eans:
            all_eans.add(ean)

        additional_order_ids = []
        for entry in additional_items:
            if not isinstance(entry, dict):
                continue
            entry_order_id = str(entry.get("order_id") or "").strip()
            if entry_order_id:
                additional_order_ids.append(entry_order_id)
        parent_order_id = str(order.order_id or "").strip()
        if not additional_order_ids:
            fallback_ids = split_order_ids(order.order_id)
            if fallback_ids:
                parent_order_id = fallback_ids[0]
                additional_order_ids = fallback_ids[1:]

        orders_by_kid_id.setdefault(order.kid_id, []).append(
            {
                "order": order,
                "additional_items": additional_items,
                "additional_order_ids": additional_order_ids,
                "sku_eans": sku_eans,
                "parent_order_id": parent_order_id,
            }
        )

    catalog_map, hood_map = build_external_ean_links(all_eans)

    for kid in kids:
        ean_row = getattr(kid, "ean", None)
        status_row = getattr(kid, "status", None)
        attrs = getattr(kid, "product_attributes", None)
        primary_kid = primary_kid_number(kid.kid_number)
        main_ean = _norm_ean(getattr(ean_row, "main_ean", None))
        cosmoshop_ean = _norm_ean(getattr(ean_row, "jv", None))
        opencart_ean = _norm_ean(getattr(ean_row, "xl", None))
        otto_jv_ean = _norm_ean(getattr(ean_row, "otto_jv", None))
        otto_xl_ean = _norm_ean(getattr(ean_row, "otto_xl", None))
        ebay_jv_ean = _norm_ean(getattr(ean_row, "ebay_jv", None))
        ebay_xl_ean = _norm_ean(getattr(ean_row, "ebay_xl", None))
        kaufland_jv_ean = _norm_ean(getattr(ean_row, "kaufland_jv", None))
        kaufland_xl_ean = _norm_ean(getattr(ean_row, "kaufland_xl", None))
        hood_jv_ean = _norm_ean(getattr(ean_row, "hood_jv", None))
        hood_xl_ean = _norm_ean(getattr(ean_row, "hood_xl", None))
        order_entries = orders_by_kid_id.get(kid.id) or []

        order_db_id = None
        parent_order_ids: list[str] = []
        parent_order_id_seen: set[str] = set()
        additional_order_ids: list[str] = []
        additional_order_id_seen: set[str] = set()
        additional_items: list[dict] = []
        sku_eans: list[str] = []
        sku_eans_seen: set[str] = set()
        platforms: list[str] = []
        platforms_seen: set[str] = set()
        buyers: list[str] = []
        buyers_seen: set[str] = set()
        titles: list[str] = []
        titles_seen: set[str] = set()
        memos: list[str] = []
        memos_seen: set[str] = set()
        skus: list[str] = []
        skus_seen: set[str] = set()
        full_amounts: list[str] = []
        full_amounts_seen: set[str] = set()
        statuses: list[str] = []
        statuses_seen: set[str] = set()
        latest_date = None

        for entry in order_entries:
            order = entry["order"]
            if order_db_id is None:
                order_db_id = order.id
            if latest_date is None or (order.order_date is not None and order.order_date > latest_date):
                latest_date = order.order_date

            _append_unique_text(parent_order_ids, parent_order_id_seen, entry["parent_order_id"])
            for additional_order_id in entry["additional_order_ids"]:
                _append_unique_text(additional_order_ids, additional_order_id_seen, additional_order_id)
            for additional_item in entry["additional_items"]:
                if isinstance(additional_item, dict):
                    additional_items.append(additional_item)
            for sku_ean in entry["sku_eans"]:
                _append_unique_text(sku_eans, sku_eans_seen, sku_ean)

            _append_unique_text(platforms, platforms_seen, order.platform)
            _append_unique_text(buyers, buyers_seen, order.buyer)
            _append_unique_text(titles, titles_seen, order.title)
            _append_unique_text(memos, memos_seen, order.memo)
            _append_unique_text(skus, skus_seen, order.sku)
            _append_unique_text(full_amounts, full_amounts_seen, order.full_amount)
            _append_unique_text(statuses, statuses_seen, order.status)

        secondary_parent_order_ids = [value for value in parent_order_ids[1:] if value not in additional_order_id_seen]
        combined_additional_order_ids = [*secondary_parent_order_ids, *additional_order_ids]

        rows.append(
            {
                "id": f"KID-{kid.id}",
                "entity": "kid",
                "kid_id": kid.id,
                "kid_number": primary_kid,
                "kid_account": kid.account or "-",
                "place": kid.place,
                "section": kid.section,
                "b_ware": bool(kid.b_ware),
                "in_transit": bool(kid.in_transit),
                "store": bool(kid.store),
                "photo": normalize_managed_public_photo_value(kid.photo),
                "photo_count": len(kid.photo or []) if isinstance(kid.photo, list) else 0,
                "order_db_id": order_db_id,
                "order_id": parent_order_ids[0] if parent_order_ids else "-",
                "parent_order_id": parent_order_ids[0] if parent_order_ids else "-",
                "additional_order_ids": combined_additional_order_ids,
                "additional_order_ids_text": ", ".join(combined_additional_order_ids) if combined_additional_order_ids else "-",
                "additional_items": additional_items,
                "sku_eans": sku_eans,
                "ean": main_ean,
                "main_ean": main_ean,
                "database_ean": main_ean,
                "jv_ean": cosmoshop_ean,
                "xl_ean": opencart_ean,
                "otto_jv_ean": otto_jv_ean,
                "otto_xl_ean": otto_xl_ean,
                "ebay_jv_ean": ebay_jv_ean,
                "ebay_xl_ean": ebay_xl_ean,
                "kaufland_jv_ean": kaufland_jv_ean,
                "kaufland_xl_ean": kaufland_xl_ean,
                "hood_jv_ean": hood_jv_ean,
                "hood_xl_ean": hood_xl_ean,
                "ean_status": {
                    field_name: getattr(status_row, field_name, False)
                    for field_name in MARKETPLACE_STATUS_FIELDS
                },
                "linked_products_by_ean": {
                    "catalog": {ean: catalog_map.get(ean, []) for ean in sku_eans},
                    "hood_service": {ean: hood_map.get(ean, []) for ean in sku_eans},
                },
                "platform": _join_unique_text(platforms),
                "buyer": _join_unique_text(buyers),
                "quantity": getattr(attrs, "quantity", None),
                "company": getattr(attrs, "company", None),
                "room": kid.room,
                "type": kid.furniture_type,
                "commentary": kid.commentary,
                "title": _join_unique_text(titles, empty=primary_kid or "Kid without orders"),
                "memo": _join_unique_text(memos, empty=(kid.commentary or "-")),
                "sku": _join_unique_text(skus),
                "full_amount": _join_unique_text(full_amounts),
                "global_price": _join_unique_text(full_amounts),
                "color": getattr(attrs, "color", None),
                "size": getattr(attrs, "size", None),
                "material": getattr(attrs, "material", None),
                "price": str(attrs.price) if getattr(attrs, "price", None) is not None else None,
                "price_currency": getattr(attrs, "currency", None),
                "status": _join_unique_text(statuses, empty="no_paid"),
                "order_date": latest_date or (kid.updated_at.isoformat() if getattr(kid, "updated_at", None) else None),
            }
        )

    return rows


def build_kid_ean_summary(kid_id: int) -> dict:
    rows = build_inventory_rows()
    kid_rows = [row for row in rows if int(row.get("kid_id") or 0) == int(kid_id)]

    sku_eans: list[str] = []
    seen: set[str] = set()
    linked_xljv: dict[str, list[dict]] = {}
    linked_hood: dict[str, list[dict]] = {}
    order_ids_seen: set[str] = set()
    order_ids: list[str] = []

    for row in kid_rows:
        order_id = str(row.get("order_id") or "").strip()
        if order_id and order_id not in order_ids_seen:
            order_ids_seen.add(order_id)
            order_ids.append(order_id)

        for ean in row.get("sku_eans") or []:
            normalized = str(ean or "").strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            sku_eans.append(normalized)

            linked = row.get("linked_products_by_ean") or {}
            xljv_map = linked.get("xljv_services") or {}
            hood_map = linked.get("hood_service") or {}
            linked_xljv[normalized] = list(xljv_map.get(normalized) or [])
            linked_hood[normalized] = list(hood_map.get(normalized) or [])

    xljv_sites: set[str] = set()
    xljv_source_product_ids: set[str] = set()
    hood_accounts: set[str] = set()
    xljv_total = 0
    hood_total = 0
    kid_snapshot = {
        "place": "",
        "room": "",
        "furniture_type": "",
        "store": False,
        "main_ean": "",
        "database_ean": "",
        "main_photo": None,
        "photo_count": 0,
        "last_update": None,
    }

    for linked_items in linked_xljv.values():
        xljv_total += len(linked_items)
        for item in linked_items:
            site = str(item.get("site") or "").strip().upper()
            if site:
                xljv_sites.add(site)
            source_product_id = str(item.get("source_product_id") or "").strip()
            if source_product_id:
                xljv_source_product_ids.add(source_product_id)

    for linked_items in linked_hood.values():
        hood_total += len(linked_items)
        for item in linked_items:
            account = str(item.get("account") or "").strip().upper()
            if account:
                hood_accounts.add(account)

    if kid_rows:
        base_row = kid_rows[0]
        photo_value = base_row.get("photo")
        main_photo = None
        photo_count = 0
        if isinstance(photo_value, list):
            photo_count = len(photo_value)
            for entry in photo_value:
                if isinstance(entry, str) and entry.strip():
                    main_photo = entry.strip()
                    break
                if isinstance(entry, dict):
                    candidate = str(entry.get("url") or entry.get("src") or "").strip()
                    if candidate:
                        main_photo = candidate
                        break

        last_dates = [row.get("order_date") for row in kid_rows if row.get("order_date")]
        kid_snapshot = {
            "place": str(base_row.get("place") or "").strip(),
            "room": str(base_row.get("room") or "").strip(),
            "furniture_type": str(base_row.get("type") or "").strip(),
            "store": bool(base_row.get("store")),
            "main_ean": _norm_ean(base_row.get("main_ean") or base_row.get("database_ean") or base_row.get("ean")),
            "database_ean": _norm_ean(base_row.get("database_ean") or base_row.get("main_ean") or base_row.get("ean")),
            "main_photo": main_photo,
            "photo_count": photo_count,
            "last_update": max(last_dates) if last_dates else None,
        }

    inventory_flags = {
        "missing_place": not bool(kid_snapshot.get("place")),
        "missing_room": not bool(kid_snapshot.get("room")),
        "missing_photo": int(kid_snapshot.get("photo_count") or 0) == 0,
    }

    return {
        "kid_id": int(kid_id),
        "order_ids": order_ids,
        "order_count": len(order_ids),
        "sku_eans": sku_eans,
        "sku_ean_count": len(sku_eans),
        "has_ean": bool(sku_eans),
        "linked_products_by_ean": {
            "xljv_services": linked_xljv,
            "hood_service": linked_hood,
        },
        "listing_summary": {
            "xljv_services": {
                "total": xljv_total,
                "sites": sorted(xljv_sites),
                "source_product_ids": sorted(xljv_source_product_ids),
            },
            "hood_service": {
                "total": hood_total,
                "accounts": sorted(hood_accounts),
            },
        },
        "kid_snapshot": kid_snapshot,
        "marketplace_identity_preview": [
            {
                "ean": ean,
                "xljv_count": len(linked_xljv.get(ean) or []),
                "hood_count": len(linked_hood.get(ean) or []),
            }
            for ean in sku_eans
        ],
        "inventory_flags": inventory_flags,
    }
