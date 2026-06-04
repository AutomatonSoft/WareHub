import json
import os
import re
from datetime import date, datetime
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from .source_config import JV_DELIVERY_LABEL_BY_UI_ID, JV_DELIVERY_LABEL_BY_UI_ID_DE, JV_DELIVERY_LABEL_BY_UI_ID_EN, jv_delivery_label_by_ui_id
from .source_schema import table_exists, table_has_column

DEFAULT_JV_DELIVERY_MAPPING_OVERRIDES_PATH = Path(__file__).with_name("delivery_mapping_overrides.json")


def as_plain_value(value):
    if isinstance(value, Decimal):
        return str(value)
    return value


def as_oc_date(value):
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    return value or "0000-00-00"


def jv_urlkey(value: str) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9äöüß]+", "+", text)
    text = text.strip("+")
    return text[:255]


def jv_suchfeld(name_value: str, plain_value: str, ean_value: str) -> str:
    merged = " ".join([str(name_value or ""), str(plain_value or ""), str(ean_value or "")])
    merged = re.sub(r"<[^>]*>", " ", merged)
    merged = re.sub(r"\s+", " ", merged).strip()
    return merged[:65535]


def to_int_or_default(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def resolve_jv_delivery_ui_id(value, *, site_key: str | None = None, default: int | None = None) -> int | None:
    try:
        delivery_id = int(value)
    except (TypeError, ValueError):
        delivery_id = None
    if delivery_id is not None and delivery_id >= 0:
        return delivery_id

    text = str(value or "").strip()
    if not text:
        return default
    normalized_text = re.sub(r"\s+", " ", text).strip().lower()
    label_maps = [
        jv_delivery_label_by_ui_id(site_key),
        JV_DELIVERY_LABEL_BY_UI_ID_DE,
        JV_DELIVERY_LABEL_BY_UI_ID_EN,
    ]
    for label_map in label_maps:
        for candidate_id, label in label_map.items():
            normalized_label = re.sub(r"\s+", " ", str(label or "")).strip().lower()
            if normalized_label == normalized_text:
                return int(candidate_id)
    return default


def _source_delivery_label_from_row(row: dict, *, fallback_id: int) -> str:
    for key in ("label", "bezeichnung", "name", "lieferzeit", "text", "title", "days"):
        text = str((row or {}).get(key) or "").strip()
        if text:
            return text
    tage = (row or {}).get("tage")
    try:
        days = int(tage)
    except (TypeError, ValueError):
        days = None
    if days is not None:
        unit = "day" if days == 1 else "days"
        return f"Delivery time: {days} {unit}"
    return str(fallback_id)


@lru_cache(maxsize=4)
def _load_delivery_mapping_overrides(path_raw: str) -> dict:
    path = Path(path_raw) if path_raw else DEFAULT_JV_DELIVERY_MAPPING_OVERRIDES_PATH
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _delivery_override_target_id(*, source_site_key: str | None, target_site_key: str | None, source_delivery_id: int) -> int | None:
    source_key = str(source_site_key or "").strip().upper()
    target_key = str(target_site_key or "").strip().upper()
    if not source_key or not target_key:
        return None
    override_path = os.getenv("JV_DELIVERY_MAPPING_OVERRIDES_PATH", "").strip()
    payload = _load_delivery_mapping_overrides(override_path)
    raw_value = (
        payload.get(source_key, {})
        if isinstance(payload.get(source_key, {}), dict)
        else {}
    ).get(target_key, {})
    if not isinstance(raw_value, dict):
        return None
    target_id_raw = raw_value.get(str(source_delivery_id))
    try:
        target_id = int(target_id_raw)
    except (TypeError, ValueError):
        return None
    return target_id if target_id >= 0 else None


def resolve_jv_delivery_target_id_for_sites(*, source_site_key: str | None, target_site_key: str | None, source_delivery_id) -> int | None:
    normalized_source_id = resolve_jv_delivery_ui_id(source_delivery_id, site_key=source_site_key)
    if normalized_source_id is None:
        return None
    return _delivery_override_target_id(
        source_site_key=source_site_key,
        target_site_key=target_site_key,
        source_delivery_id=normalized_source_id,
    )


def resolve_jv_lieferzeit_id(cur, jv_overrides: dict, default: int = 11) -> int:
    raw_value = jv_overrides.get("lieferzeitid")
    if raw_value is None:
        return default

    source_site_key = str(jv_overrides.get("_delivery_mapping_source_site_key") or "").strip().upper()
    target_site_key = str(jv_overrides.get("_delivery_mapping_target_site_key") or "").strip().upper()
    site_key_for_resolution = target_site_key or source_site_key or None
    selected_id = resolve_jv_delivery_ui_id(raw_value, site_key=site_key_for_resolution, default=default) or default
    source_delivery_id = resolve_jv_delivery_ui_id(
        jv_overrides.get("_delivery_mapping_source_id"),
        site_key=source_site_key,
        default=selected_id,
    ) or selected_id
    mapped_target_id = _delivery_override_target_id(
        source_site_key=source_site_key,
        target_site_key=target_site_key,
        source_delivery_id=source_delivery_id,
    )

    if mapped_target_id is not None:
        selected_id = mapped_target_id

    # If we already have concrete site-aware id mapping context, do not fall back
    # to text labels. Source JV schemas often store only id/tage, not human labels.
    if source_site_key and target_site_key:
        return selected_id

    selected_label = JV_DELIVERY_LABEL_BY_UI_ID.get(selected_id)
    raw_text = str(raw_value or "").strip()
    if raw_text and not raw_text.isdigit():
        selected_label = raw_text

    # Try to resolve by label in source DB if table exists.
    table_candidates = ["shoplieferzeiten", "shoplieferzeit"]
    id_cols = ["lieferzeitid", "id"]
    label_cols = ["bezeichnung", "name", "lieferzeit", "text", "title", "days"]

    for table_name in table_candidates:
        if not table_exists(cur, table_name):
            continue

        id_col = next((c for c in id_cols if table_has_column(cur, table_name, c)), None)
        if not id_col:
            continue

        if selected_label:
            for label_col in label_cols:
                if not table_has_column(cur, table_name, label_col):
                    continue
                try:
                    cur.execute(
                        f"SELECT `{id_col}` FROM `{table_name}` WHERE `{label_col}` = %s LIMIT 1",
                        (selected_label,),
                    )
                    row = cur.fetchone()
                    if row:
                        if isinstance(row, dict):
                            return to_int_or_default(row.get(id_col), selected_id)
                        return to_int_or_default(row[0], selected_id)
                except Exception:
                    continue

        # Fallback: direct id if that id exists in source DB.
        try:
            cur.execute(
                f"SELECT `{id_col}` FROM `{table_name}` WHERE `{id_col}` = %s LIMIT 1",
                (selected_id,),
            )
            row = cur.fetchone()
            if row:
                if isinstance(row, dict):
                    return to_int_or_default(row.get(id_col), selected_id)
                return to_int_or_default(row[0], selected_id)
        except Exception:
            continue

    return selected_id


def fetch_jv_lieferzeit_options(cur, site_key: str | None = None) -> list[dict]:
    ui_label_map = jv_delivery_label_by_ui_id(site_key)
    fallback = [
        {
            "id": delivery_id,
            "lieferzeitid": delivery_id,
            "label": label,
            "days": label,
            "is_default": delivery_id == 11,
        }
        for delivery_id, label in ui_label_map.items()
    ]
    if cur is None:
        return fallback

    table_candidates = ["shoplieferzeiten", "shoplieferzeit"]
    id_cols = ["lieferzeitid", "id"]
    label_cols = ["bezeichnung", "name", "lieferzeit", "text", "title", "days"]

    for table_name in table_candidates:
        if not table_exists(cur, table_name):
            continue
        id_col = next((col for col in id_cols if table_has_column(cur, table_name, col)), None)
        if not id_col:
            continue
        label_col = next((col for col in label_cols if table_has_column(cur, table_name, col)), None)
        tage_col = "tage" if table_has_column(cur, table_name, "tage") else None
        default_col = "default" if table_has_column(cur, table_name, "default") else None
        select_cols = [f"`{id_col}` AS id"]
        if label_col:
            select_cols.append(f"`{label_col}` AS label")
        if tage_col:
            select_cols.append(f"`{tage_col}` AS tage")
        if default_col:
            select_cols.append(f"`{default_col}` AS is_default_db")
        cur.execute(f"SELECT {', '.join(select_cols)} FROM `{table_name}` ORDER BY `{id_col}` ASC")
        rows = []
        for row in cur.fetchall() or []:
            raw_id = row.get("id") if isinstance(row, dict) else row[0]
            delivery_id = to_int_or_default(raw_id, -1)
            if delivery_id < 0:
                continue
            if delivery_id not in ui_label_map:
                continue
            row_payload = row if isinstance(row, dict) else {"id": raw_id}
            source_label = _source_delivery_label_from_row(row_payload, fallback_id=delivery_id)
            ui_label = ui_label_map.get(delivery_id, source_label)
            label = ui_label or source_label
            is_default = bool(row_payload.get("is_default_db")) if isinstance(row_payload, dict) else False
            days_value = row_payload.get("tage") if isinstance(row_payload, dict) else None
            rows.append(
                {
                    "id": delivery_id,
                    "lieferzeitid": delivery_id,
                    "label": label,
                    "ui_label": ui_label,
                    "source_label": source_label,
                    "days": days_value if days_value is not None else label,
                    "is_default": is_default,
                }
            )
        if rows:
            return rows
    return fallback


def fetch_jv_lieferzeit_label_by_id(db_config: dict, delivery_id) -> str:
    from .source_connection import mysql_connect

    conn = None
    cur = None
    try:
        conn = mysql_connect(db_config)
        cur = conn.cursor(dictionary=True)
        site_key = str((db_config or {}).get("site_key") or "").strip().upper()
        ui_label_map = jv_delivery_label_by_ui_id(site_key)
        selected_id = to_int_or_default(delivery_id, -1)
        if selected_id < 0:
            return str(delivery_id or "").strip()
        for option in fetch_jv_lieferzeit_options(cur, site_key=site_key):
            if int(option.get("id") or -1) == selected_id:
                return str(option.get("label") or option.get("days") or "").strip()
        return ui_label_map.get(selected_id, str(delivery_id or "").strip())
    finally:
        try:
            if cur is not None:
                cur.close()
        finally:
            if conn is not None:
                conn.close()


def to_float_or_default(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _round_to_nearest_int_ending_with_9(value: float) -> int:
    base = int(round(value))
    lower = (base // 10) * 10 + 9
    if lower > base:
        lower -= 10
    upper = lower + 10
    if abs(base - lower) < abs(upper - base):
        return lower
    return upper


def process_uvp(price: float) -> int:
    if price > 5000:
        value = price * 1.10
    elif 2500 <= price <= 4999:
        value = price * 1.18
    elif 1000 <= price <= 2499:
        value = price * 1.25
    else:
        value = price * 1.35
    return _round_to_nearest_int_ending_with_9(value)


def extract_jv_content_overrides(jv_overrides: dict) -> dict:
    if not isinstance(jv_overrides, dict):
        return {}

    # Primary path: explicit DE row inside content_by_language.
    rows = jv_overrides.get("content_by_language")
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue
            lang = str(row.get("language_code") or "").strip().lower()
            if lang and lang != "de":
                continue
            normalized = dict(row)
            # Backward compatibility: accept legacy uppercase field names.
            if normalized.get("description") in (None, ""):
                normalized["description"] = (
                    normalized.get("bezeichnung_html")
                    or normalized.get("bezeichnung")
                    or normalized.get("BESCHREIBUNG")
                    or ""
                )
            if normalized.get("short_description_real") in (None, ""):
                normalized["short_description_real"] = (
                    normalized.get("kurzbeschreibung")
                    or normalized.get("KURZBESCHREIBUNG")
                    or normalized.get("short_description")
                    or ""
                )
            return normalized

    # Fallback: accept direct JV fields from payload (used by frontend/admin patch forms).
    direct = {}
    for key in (
        "name",
        "keywords",
        "description",
        "bezeichnung",
        "bezeichnung_html",
        "short_description",
        "short_description_real",
        "kurzbeschreibung",
        "BESCHREIBUNG",
        "KURZBESCHREIBUNG",
        "meta_title",
        "meta_description",
        "meta_keyword",
        "liefernr",
        "supplier_liefernr",
    ):
        if key in jv_overrides:
            direct[key] = jv_overrides.get(key)
    return direct


def resolve_jv_seo_values(product, content_overrides: dict) -> dict:
    first_desc = product.descriptions.order_by("id").first()
    name_value = str(content_overrides.get("name") or "").strip() or (getattr(first_desc, "name", "") or "").strip()
    keywords_value = str(content_overrides.get("keywords") or "").strip()
    return {
        "meta_title": str(content_overrides.get("meta_title") or "").strip()
        or (getattr(first_desc, "meta_title", "") or "").strip()
        or name_value,
        "meta_description": str(content_overrides.get("meta_description") or "").strip()
        or (getattr(first_desc, "meta_description", "") or "").strip(),
        "meta_keyword": str(content_overrides.get("meta_keyword") or "").strip()
        or (getattr(first_desc, "meta_keyword", "") or "").strip()
        or keywords_value,
    }
