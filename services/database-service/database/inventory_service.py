import re
import logging

from hood_service.models import HoodApiResponseJV, HoodApiResponseXL
from catalog_core.models import ImportedProduct

from .kid_number_utils import primary_kid_number
from .models import Ean, Kid, Orders, ProductAttributes

logger = logging.getLogger(__name__)
DEFAULT_EAN = ""

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


def build_inventory_rows() -> list[dict]:
    orders = list(Orders.objects.select_related("kid").all().order_by("id"))
    kids = list(Kid.objects.all().order_by("id"))
    eans_by_kid_id = {
        row["kid_id"]: row
        for row in Ean.objects.all().values(
            "kid_id",
            "main_ean",
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
    }
    attributes_by_kid_id = {
        row["kid_id"]: row
        for row in ProductAttributes.objects.all().values(
            "kid_id",
            "quantity",
            "company",
            "color",
            "size",
            "material",
            "price",
            "currency",
        )
    }
    order_meta: list[tuple[Orders, list[dict], list[str], list[str]]] = []
    all_eans: set[str] = set()
    rows: list[dict] = []
    kid_ids_with_orders: set[int] = set()

    for order in orders:
        kid_ids_with_orders.add(order.kid_id)
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
        order_meta.append((order, additional_items, additional_order_ids, sku_eans))

    catalog_map, hood_map = build_external_ean_links(all_eans)

    for order, additional_items, additional_order_ids, sku_eans in order_meta:
        kid = order.kid
        attrs = attributes_by_kid_id.get(kid.id) or {}
        ean_row = eans_by_kid_id.get(kid.id) or {}
        primary_kid = primary_kid_number(kid.kid_number)
        main_ean = _norm_ean(ean_row.get("main_ean"))
        cosmoshop_ean = _norm_ean(ean_row.get("jv"))
        opencart_ean = _norm_ean(ean_row.get("xl"))
        otto_jv_ean = _norm_ean(ean_row.get("otto_jv"))
        otto_xl_ean = _norm_ean(ean_row.get("otto_xl"))
        ebay_jv_ean = _norm_ean(ean_row.get("ebay_jv"))
        ebay_xl_ean = _norm_ean(ean_row.get("ebay_xl"))
        kaufland_jv_ean = _norm_ean(ean_row.get("kaufland_jv"))
        kaufland_xl_ean = _norm_ean(ean_row.get("kaufland_xl"))
        hood_jv_ean = _norm_ean(ean_row.get("hood_jv"))
        hood_xl_ean = _norm_ean(ean_row.get("hood_xl"))
        mapped_ean = main_ean
        parent_order_id = str(order.order_id or "").strip()
        if not additional_order_ids:
            fallback_ids = split_order_ids(order.order_id)
            if fallback_ids:
                parent_order_id = fallback_ids[0]
                additional_order_ids = fallback_ids[1:]

        rows.append(
            {
                "id": f"ORD-{order.id}",
                "entity": "order",
                "kid_id": kid.id,
                "kid_number": primary_kid,
                "kid_account": kid.account or "-",
                "place": kid.place,
                "store": bool(kid.store),
                "photo": kid.photo,
                "photo_count": len(kid.photo or []) if isinstance(kid.photo, list) else 0,
                "order_db_id": order.id,
                "order_id": parent_order_id or "-",
                "parent_order_id": parent_order_id or "-",
                "additional_order_ids": additional_order_ids,
                "additional_order_ids_text": ", ".join(additional_order_ids) if additional_order_ids else "-",
                "additional_items": additional_items,
                "sku_eans": sku_eans,
                "ean": mapped_ean,
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
                "linked_products_by_ean": {
                    "catalog": {ean: catalog_map.get(ean, []) for ean in sku_eans},
                    "hood_service": {ean: hood_map.get(ean, []) for ean in sku_eans},
                },
                "platform": order.platform or "-",
                "buyer": order.buyer or "-",
                "quantity": attrs.get("quantity"),
                "company": attrs.get("company"),
                "room": kid.room,
                "type": kid.furniture_type,
                "commentary": kid.commentary,
                "listing_status": kid.listing_status or "unlisted",
                "title": order.title or "-",
                "memo": order.memo or "-",
                "sku": order.sku or "-",
                "payment_status": order.payment_status or "-",
                "global_price": order.payment_status or "-",
                "color": attrs.get("color"),
                "size": attrs.get("size"),
                "material": attrs.get("material"),
                "price": str(attrs.get("price")) if attrs.get("price") is not None else None,
                "price_currency": attrs.get("currency"),
                "status": order.status or "no_paid",
                "date": order.date,
            }
        )

    for kid in kids:
        if kid.id in kid_ids_with_orders:
            continue

        attrs = attributes_by_kid_id.get(kid.id) or {}
        ean_row = eans_by_kid_id.get(kid.id) or {}
        primary_kid = primary_kid_number(kid.kid_number)
        main_ean = _norm_ean(ean_row.get("main_ean"))
        cosmoshop_ean = _norm_ean(ean_row.get("jv"))
        opencart_ean = _norm_ean(ean_row.get("xl"))
        otto_jv_ean = _norm_ean(ean_row.get("otto_jv"))
        otto_xl_ean = _norm_ean(ean_row.get("otto_xl"))
        ebay_jv_ean = _norm_ean(ean_row.get("ebay_jv"))
        ebay_xl_ean = _norm_ean(ean_row.get("ebay_xl"))
        kaufland_jv_ean = _norm_ean(ean_row.get("kaufland_jv"))
        kaufland_xl_ean = _norm_ean(ean_row.get("kaufland_xl"))
        hood_jv_ean = _norm_ean(ean_row.get("hood_jv"))
        hood_xl_ean = _norm_ean(ean_row.get("hood_xl"))

        rows.append(
            {
                "id": f"KID-{kid.id}",
                "entity": "kid",
                "kid_id": kid.id,
                "kid_number": primary_kid,
                "kid_account": kid.account or "-",
                "place": kid.place,
                "store": bool(kid.store),
                "photo": kid.photo,
                "photo_count": len(kid.photo or []) if isinstance(kid.photo, list) else 0,
                "order_db_id": None,
                "order_id": "-",
                "parent_order_id": "-",
                "additional_order_ids": [],
                "additional_order_ids_text": "-",
                "additional_items": [],
                "sku_eans": [],
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
                "linked_products_by_ean": {
                    "catalog": {},
                    "hood_service": {},
                },
                "platform": "-",
                "buyer": "-",
                "quantity": attrs.get("quantity"),
                "company": attrs.get("company"),
                "room": kid.room,
                "type": kid.furniture_type,
                "commentary": kid.commentary,
                "listing_status": kid.listing_status or "unlisted",
                "title": primary_kid or "Kid without orders",
                "memo": kid.commentary or "-",
                "sku": "-",
                "payment_status": "-",
                "global_price": "-",
                "color": attrs.get("color"),
                "size": attrs.get("size"),
                "material": attrs.get("material"),
                "price": str(attrs.get("price")) if attrs.get("price") is not None else None,
                "price_currency": attrs.get("currency"),
                "status": "no_paid",
                "date": kid.updated_at.isoformat() if getattr(kid, "updated_at", None) else None,
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
        "listing_status": "unlisted",
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

        last_dates = [row.get("date") for row in kid_rows if row.get("date")]
        kid_snapshot = {
            "place": str(base_row.get("place") or "").strip(),
            "room": str(base_row.get("room") or "").strip(),
            "furniture_type": str(base_row.get("type") or "").strip(),
            "listing_status": str(base_row.get("listing_status") or "unlisted").strip(),
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
        "listed": str(kid_snapshot.get("listing_status") or "").lower() == "listed",
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
