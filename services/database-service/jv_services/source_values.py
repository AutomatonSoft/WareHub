import re
from datetime import date, datetime
from decimal import Decimal

from .source_config import JV_DELIVERY_LABEL_BY_UI_ID
from .source_schema import table_exists, table_has_column


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


def resolve_jv_lieferzeit_id(cur, jv_overrides: dict, default: int = 11) -> int:
    raw_value = jv_overrides.get("lieferzeitid")
    if raw_value is None:
        return default

    # What user selected in UI (static list id -> label).
    selected_id = to_int_or_default(raw_value, default)
    selected_label = JV_DELIVERY_LABEL_BY_UI_ID.get(selected_id)

    # Some clients can send label directly.
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


def fetch_jv_lieferzeit_options(cur) -> list[dict]:
    fallback = [
        {
            "id": delivery_id,
            "lieferzeitid": delivery_id,
            "label": label,
            "days": label,
            "is_default": delivery_id == 11,
        }
        for delivery_id, label in JV_DELIVERY_LABEL_BY_UI_ID.items()
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
        if not label_col:
            continue
        cur.execute(f"SELECT `{id_col}` AS id, `{label_col}` AS label FROM `{table_name}` ORDER BY `{id_col}` ASC")
        rows = []
        for row in cur.fetchall() or []:
            raw_id = row.get("id") if isinstance(row, dict) else row[0]
            raw_label = row.get("label") if isinstance(row, dict) else row[1]
            delivery_id = to_int_or_default(raw_id, -1)
            if delivery_id < 0:
                continue
            label = str(raw_label or "").strip() or str(delivery_id)
            rows.append(
                {
                    "id": delivery_id,
                    "lieferzeitid": delivery_id,
                    "label": label,
                    "days": label,
                    "is_default": delivery_id == 11,
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
        selected_id = to_int_or_default(delivery_id, -1)
        if selected_id < 0:
            return str(delivery_id or "").strip()
        for option in fetch_jv_lieferzeit_options(cur):
            if int(option.get("id") or -1) == selected_id:
                return str(option.get("label") or option.get("days") or "").strip()
        return JV_DELIVERY_LABEL_BY_UI_ID.get(selected_id, str(delivery_id or "").strip())
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
