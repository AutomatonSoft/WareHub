import logging
import json
import os
import re
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path

from .source_config import JV_LANGUAGE_ID_BY_CODE
from .source_connection import mysql_connect as _mysql_connect
from .source_schema import (
    table_exists as _table_exists,
    table_has_column as _table_has_column,
)
from .source_media import fetch_jv_media_from_shopmedia as _fetch_jv_media_from_shopmedia
from .source_categories import normalize_jv_categories as _normalize_jv_categories
from .source_metadata import (
    fetch_jv_seo_by_product_id as _fetch_jv_seo_by_product_id,
    fetch_jv_supplier_liefernr as _fetch_jv_supplier_liefernr,
)
from .source_values import as_plain_value as _as_plain_value

logger = logging.getLogger(__name__)

DEFAULT_JV_CATEGORY_MAIN_OVERRIDES_PATH = Path(__file__).with_name("category_main_overrides.json")


def _json_safe_datetime(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _first_present_value(*values):
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and value == "":
            continue
        return value
    return None


@lru_cache(maxsize=8)
def _load_jv_category_main_overrides(path_raw: str) -> dict:
    path = Path(path_raw)
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.exception("JV_CATEGORY_MAIN_OVERRIDES_READ_FAILED path=%s", path)
        return {}
    return payload if isinstance(payload, dict) else {}


def _apply_jv_category_main_override(categories: list[dict], *, site_key: str | None, ean: str | None) -> list[dict]:
    normalized_site_key = str(site_key or "").strip().upper()
    normalized_ean = "".join(ch for ch in str(ean or "") if ch.isdigit())
    if not categories or not normalized_site_key or not normalized_ean:
        return categories

    override_path = os.getenv("JV_CATEGORY_MAIN_OVERRIDES_PATH") or str(DEFAULT_JV_CATEGORY_MAIN_OVERRIDES_PATH)
    overrides = _load_jv_category_main_overrides(override_path)
    site_overrides = overrides.get(normalized_site_key) if isinstance(overrides, dict) else None
    if not isinstance(site_overrides, dict):
        return categories
    main_category_id_raw = site_overrides.get(normalized_ean)
    if main_category_id_raw in (None, ""):
        return categories
    try:
        main_category_id = int(main_category_id_raw)
    except (TypeError, ValueError):
        return categories
    if not any(int(item.get("category_id")) == main_category_id for item in categories if item.get("category_id") is not None):
        return categories
    return [
        {
            **item,
            "main_category": int(item.get("category_id")) == main_category_id,
        }
        for item in categories
    ]


def _fetch_jv_product_brief_by_ean(cur, ean: str):
    normalized_ean = "".join(ch for ch in (ean or "") if ch.isdigit())
    cur.execute(
        """
        SELECT
            a.artikelid AS product_id,
            a.ean AS ean,
            a.artikelnr AS model,
            a.jfsku AS sku,
            p.preis AS price,
            p.waehrung AS currency_code,
            c.name AS title
        FROM shopartikel a
        LEFT JOIN shopartikelpreise p
            ON p.artikelid = a.artikelid
           AND p.staffel = 1
        LEFT JOIN shopartikelcontent c
            ON c.artikelid = a.artikelid
           AND c.sprache = 'de'
        WHERE a.ean = %s
           OR TRIM(a.ean) = TRIM(%s)
           OR REPLACE(REPLACE(TRIM(a.ean), ' ', ''), '-', '') = %s
           OR a.artikelnr = %s
           OR TRIM(a.artikelnr) = TRIM(%s)
           OR REPLACE(REPLACE(TRIM(a.artikelnr), ' ', ''), '-', '') = %s
        ORDER BY a.artikelid DESC
        LIMIT 1
        """,
        (ean, ean, normalized_ean, ean, ean, normalized_ean),
    )
    return cur.fetchone()


def _fetch_jv_product_snapshot_by_ean(cur, ean: str, *, site_key: str | None = None):
    normalized_ean = "".join(ch for ch in (ean or "") if ch.isdigit())
    has_shopartikelpreise = _table_exists(cur, "shopartikelpreise")
    has_staffel = _table_has_column(cur, "shopartikelpreise", "staffel") if has_shopartikelpreise else False
    has_preis = _table_has_column(cur, "shopartikelpreise", "preis") if has_shopartikelpreise else False
    has_waehrung = _table_has_column(cur, "shopartikelpreise", "waehrung") if has_shopartikelpreise else False
    has_jfsku = _table_has_column(cur, "shopartikel", "jfsku")
    has_inaktiv = _table_has_column(cur, "shopartikel", "inaktiv")
    has_geaendert = _table_has_column(cur, "shopartikel", "geaendert")

    sku_sql = "a.jfsku AS sku" if has_jfsku else "NULL AS sku"
    inaktiv_sql = "a.inaktiv AS inaktiv" if has_inaktiv else "0 AS inaktiv"
    geaendert_sql = "a.geaendert AS date_modified" if has_geaendert else "NULL AS date_modified"
    price_sql = "p.preis AS price" if (has_shopartikelpreise and has_preis) else "NULL AS price"
    currency_sql = "p.waehrung AS currency_code" if (has_shopartikelpreise and has_waehrung) else "NULL AS currency_code"
    join_price_sql = (
        "LEFT JOIN shopartikelpreise p ON p.artikelid = a.artikelid AND p.staffel = 1"
        if has_shopartikelpreise and has_staffel
        else "LEFT JOIN shopartikelpreise p ON p.artikelid = a.artikelid"
        if has_shopartikelpreise
        else ""
    )

    base_params = (ean, ean, normalized_ean, ean, ean, normalized_ean)
    query_with_currency = f"""
        SELECT
            a.artikelid AS product_id,
            a.ean AS ean,
            a.artikelnr AS model,
            {sku_sql},
            {inaktiv_sql},
            {geaendert_sql},
            {price_sql},
            {currency_sql}
        FROM shopartikel a
        {join_price_sql}
        WHERE a.ean = %s
           OR TRIM(a.ean) = TRIM(%s)
           OR REPLACE(REPLACE(TRIM(a.ean), ' ', ''), '-', '') = %s
           OR a.artikelnr = %s
           OR TRIM(a.artikelnr) = TRIM(%s)
           OR REPLACE(REPLACE(TRIM(a.artikelnr), ' ', ''), '-', '') = %s
        ORDER BY a.artikelid DESC
        LIMIT 1
    """
    query_without_currency = f"""
        SELECT
            a.artikelid AS product_id,
            a.ean AS ean,
            a.artikelnr AS model,
            {sku_sql},
            {inaktiv_sql},
            {geaendert_sql},
            {price_sql},
            NULL AS currency_code
        FROM shopartikel a
        {join_price_sql}
        WHERE a.ean = %s
           OR TRIM(a.ean) = TRIM(%s)
           OR REPLACE(REPLACE(TRIM(a.ean), ' ', ''), '-', '') = %s
           OR a.artikelnr = %s
           OR TRIM(a.artikelnr) = TRIM(%s)
           OR REPLACE(REPLACE(TRIM(a.artikelnr), ' ', ''), '-', '') = %s
        ORDER BY a.artikelid DESC
        LIMIT 1
    """
    try:
        cur.execute(query_with_currency, base_params)
    except mysql.connector.Error:
        logger.warning(
            "JV_JV_QUERY_WITH_CURRENCY_FAILED code=jv_jv_query_with_currency_failed",
            exc_info=True,
        )
        cur.execute(query_without_currency, base_params)
    row = cur.fetchone()
    if not row:
        return None

    product_id = row["product_id"]
    has_bezeichnung = _table_has_column(cur, "shopartikelcontent", "bezeichnung")
    has_bezeichnung_html = _table_has_column(cur, "shopartikelcontent", "bezeichnung_html")
    has_keywords = _table_has_column(cur, "shopartikelcontent", "keywords")
    has_urlkey = _table_has_column(cur, "shopartikelcontent", "urlkey")
    has_kurzbeschreibung = _table_has_column(cur, "shopartikelcontent", "kurzbeschreibung")
    has_kurzbezeichnung = _table_has_column(cur, "shopartikelcontent", "kurzbezeichnung")
    has_bezeichnung_kurz = _table_has_column(cur, "shopartikelcontent", "bezeichnung_kurz")
    has_teaser = _table_has_column(cur, "shopartikelcontent", "teaser")
    bezeichnung_sql = "bezeichnung" if has_bezeichnung else "''"
    description_sql = "bezeichnung_html" if has_bezeichnung_html else bezeichnung_sql
    keywords_sql = "keywords" if has_keywords else "''"
    urlkey_sql = "urlkey" if has_urlkey else "''"
    kurzbeschreibung_sql = "kurzbeschreibung" if has_kurzbeschreibung else "''"
    kurzbezeichnung_sql = "kurzbezeichnung" if has_kurzbezeichnung else "''"
    bezeichnung_kurz_sql = "bezeichnung_kurz" if has_bezeichnung_kurz else "''"
    teaser_sql = "teaser" if has_teaser else "''"
    cur.execute(
        f"""
        SELECT
            sprache,
            name,
            {bezeichnung_sql} AS bezeichnung,
            {description_sql} AS bezeichnung_html,
            {keywords_sql} AS keywords,
            {urlkey_sql} AS urlkey,
            {kurzbeschreibung_sql} AS kurzbeschreibung,
            {kurzbezeichnung_sql} AS kurzbezeichnung,
            {bezeichnung_kurz_sql} AS bezeichnung_kurz,
            {teaser_sql} AS teaser
        FROM shopartikelcontent
        WHERE artikelid = %s
        ORDER BY sprache ASC
        """,
        (product_id,),
    )
    content_rows = cur.fetchall() or []
    seo_by_language = _fetch_jv_seo_by_product_id(cur, product_id)
    descriptions = []
    jv_content_rows = []
    for item in content_rows:
        lang = str(item.get("sprache") or "").strip().lower()
        language_id = JV_LANGUAGE_ID_BY_CODE.get(lang, 1)
        seo_row = seo_by_language.get(lang, {})
        description_value = item.get("bezeichnung_html") or item.get("bezeichnung") or ""
        short_value = (
            item.get("kurzbeschreibung")
            or item.get("kurzbezeichnung")
            or item.get("bezeichnung_kurz")
            or item.get("teaser")
            or ""
        )
        jv_content_rows.append(
            {
                "language_code": lang,
                "name": item.get("name") or "",
                "keywords": item.get("keywords") or "",
                "description": description_value,
                "bezeichnung": item.get("bezeichnung") or "",
                "meta_title": seo_row.get("meta_title") or "",
                "meta_description": seo_row.get("meta_description") or "",
                "meta_keyword": seo_row.get("meta_keyword") or "",
                "short_description_real": short_value,
                "kurzbeschreibung": short_value,
            }
        )
        descriptions.append(
            {
                "language_id": language_id,
                "name": item.get("name") or "",
                "description": description_value,
                "tag": "",
                "meta_title": seo_row.get("meta_title") or item.get("name") or "",
                "meta_description": seo_row.get("meta_description") or "",
                "meta_keyword": seo_row.get("meta_keyword") or item.get("keywords") or "",
            }
        )

    # Additional JV admin/source fields used by edit form.
    jv_admin_fields: dict = {}
    artikel_cols = []
    for col in ("is_sofort", "mwstid", "lieferzeitid", "lieferzeit", "lieferzeit_id", "einheitid", "grundeinheit", "vpe", "uvp"):
        if _table_has_column(cur, "shopartikel", col):
            artikel_cols.append(col)
    if artikel_cols:
        cols_sql = ", ".join(f"`{c}`" for c in artikel_cols)
        cur.execute(f"SELECT {cols_sql} FROM `shopartikel` WHERE artikelid = %s LIMIT 1", (product_id,))
        artikel_row = cur.fetchone() or {}
        if isinstance(artikel_row, dict):
            jv_admin_fields.update(artikel_row)

    supplier_liefernr = _fetch_jv_supplier_liefernr(cur, product_id)
    if supplier_liefernr:
        jv_admin_fields["liefernr"] = supplier_liefernr

    if _table_exists(cur, "shopartikelpreise"):
        has_staffel_price = _table_has_column(cur, "shopartikelpreise", "staffel")
        has_basis = _table_has_column(cur, "shopartikelpreise", "basis")
        has_filter = _table_has_column(cur, "shopartikelpreise", "filter")
        price_cols = []
        if has_basis:
            price_cols.append("basis")
        if has_filter:
            price_cols.append("filter")
        if price_cols:
            cols_sql = ", ".join(f"`{c}`" for c in price_cols)
            if has_staffel_price:
                cur.execute(
                    f"SELECT {cols_sql} FROM `shopartikelpreise` WHERE artikelid = %s AND staffel = 1 LIMIT 1",
                    (product_id,),
                )
            else:
                cur.execute(
                    f"SELECT {cols_sql} FROM `shopartikelpreise` WHERE artikelid = %s LIMIT 1",
                    (product_id,),
                )
            price_row = cur.fetchone() or {}
            if isinstance(price_row, dict):
                jv_admin_fields.update(price_row)

    de_content = next((x for x in jv_content_rows if str(x.get("language_code") or "").lower() == "de"), None) or (jv_content_rows[0] if jv_content_rows else None)
    if de_content:
        if de_content.get("short_description_real") not in (None, ""):
            jv_admin_fields["short_description_real"] = de_content.get("short_description_real")
        if de_content.get("description") not in (None, ""):
            jv_admin_fields["description"] = de_content.get("description")
    if content_rows:
        de_full = next((x for x in content_rows if str((x or {}).get("sprache") or "").strip().lower() == "de"), content_rows[0])
        if isinstance(de_full, dict) and de_full.get("urlkey") not in (None, ""):
            jv_admin_fields["urlkey"] = de_full.get("urlkey")

    categories = []
    if _table_exists(cur, "shoprubrikartikel"):
        has_rubid = _table_has_column(cur, "shoprubrikartikel", "rubid")
        has_priority = _table_has_column(cur, "shoprubrikartikel", "priority")
        if has_rubid:
            priority_sql = "priority" if has_priority else "0 AS priority"
            cur.execute(
                f"""
                SELECT rubid, {priority_sql}
                FROM shoprubrikartikel
                WHERE artikelid = %s
                ORDER BY priority DESC, ordnum ASC
                """,
                (product_id,),
            )
            categories = _normalize_jv_categories(cur.fetchall() or [])
            categories = _apply_jv_category_main_override(categories, site_key=site_key, ean=row.get("ean") or ean)

    media_key = str(row.get("model") or "").strip() or str(row.get("ean") or "").strip()
    main_image, extra_images = _fetch_jv_media_from_shopmedia(
        cur,
        media_key=media_key,
        ean=str(row.get("ean") or ""),
    )

    product = {
        "product_id": row["product_id"],
        "ean": row.get("ean"),
        "model": row.get("model"),
        "sku": row.get("sku"),
        "price": row.get("price"),
        "quantity": None,
        "status": 0 if int(row.get("inaktiv") or 0) == 1 else 1,
        "manufacturer_id": None,
        "stock_status_id": None,
        "tax_class_id": None,
        "image": main_image,
        "date_available": None,
        "date_modified": row.get("date_modified"),
    }
    return {
        "product": product,
        "descriptions": descriptions,
        "categories": categories,
        "stores": [],
        "images": extra_images,
        "specials": [],
        "jv_fields": {
            "artikelid": row.get("product_id"),
            "artikelnr": row.get("model"),
            "jfsku": row.get("sku"),
            "ean": row.get("ean"),
            "inaktiv": int(row.get("inaktiv") or 0),
            "geaendert": _json_safe_datetime(row.get("date_modified")),
            "currency_code": row.get("currency_code"),
            "languages": sorted({str((item or {}).get("language_code") or "").strip() for item in jv_content_rows if str((item or {}).get("language_code") or "").strip()}),
            "content_by_language": jv_content_rows,
            "is_sofort": jv_admin_fields.get("is_sofort"),
            "mwstid": jv_admin_fields.get("mwstid"),
            "lieferzeitid": _first_present_value(
                jv_admin_fields.get("lieferzeitid"),
                jv_admin_fields.get("lieferzeit"),
                jv_admin_fields.get("lieferzeit_id"),
            ),
            "einheitid": jv_admin_fields.get("einheitid"),
            "grundeinheit": jv_admin_fields.get("grundeinheit"),
            "vpe": jv_admin_fields.get("vpe"),
            "uvp": _as_plain_value(jv_admin_fields.get("uvp")),
            "preisbasis": jv_admin_fields.get("basis"),
            "preisfilter": jv_admin_fields.get("filter"),
            "urlkey": jv_admin_fields.get("urlkey"),
            "short_description_real": jv_admin_fields.get("short_description_real"),
            "liefernr": jv_admin_fields.get("liefernr"),
            "supplier_liefernr": jv_admin_fields.get("liefernr"),
        },
    }


def _fetch_jv_product_snapshot_by_artikelnr(cur, artikelnr: str, *, site_key: str | None = None):
    normalized_artikelnr = re.sub(r"[\s-]+", "", str(artikelnr or "").strip())
    has_shopartikelpreise = _table_exists(cur, "shopartikelpreise")
    has_staffel = _table_has_column(cur, "shopartikelpreise", "staffel") if has_shopartikelpreise else False
    has_preis = _table_has_column(cur, "shopartikelpreise", "preis") if has_shopartikelpreise else False
    has_waehrung = _table_has_column(cur, "shopartikelpreise", "waehrung") if has_shopartikelpreise else False
    has_jfsku = _table_has_column(cur, "shopartikel", "jfsku")
    has_inaktiv = _table_has_column(cur, "shopartikel", "inaktiv")
    has_geaendert = _table_has_column(cur, "shopartikel", "geaendert")

    sku_sql = "a.jfsku AS sku" if has_jfsku else "NULL AS sku"
    inaktiv_sql = "a.inaktiv AS inaktiv" if has_inaktiv else "0 AS inaktiv"
    geaendert_sql = "a.geaendert AS date_modified" if has_geaendert else "NULL AS date_modified"
    price_sql = "p.preis AS price" if (has_shopartikelpreise and has_preis) else "NULL AS price"
    currency_sql = "p.waehrung AS currency_code" if (has_shopartikelpreise and has_waehrung) else "NULL AS currency_code"
    join_price_sql = (
        "LEFT JOIN shopartikelpreise p ON p.artikelid = a.artikelid AND p.staffel = 1"
        if has_shopartikelpreise and has_staffel
        else "LEFT JOIN shopartikelpreise p ON p.artikelid = a.artikelid"
        if has_shopartikelpreise
        else ""
    )

    query_with_currency = f"""
        SELECT
            a.artikelid AS product_id,
            a.ean AS ean,
            a.artikelnr AS model,
            {sku_sql},
            {inaktiv_sql},
            {geaendert_sql},
            {price_sql},
            {currency_sql}
        FROM shopartikel a
        {join_price_sql}
        WHERE a.artikelnr = %s
           OR TRIM(a.artikelnr) = TRIM(%s)
           OR REPLACE(REPLACE(TRIM(a.artikelnr), ' ', ''), '-', '') = %s
        ORDER BY a.artikelid DESC
        LIMIT 1
    """
    query_without_currency = f"""
        SELECT
            a.artikelid AS product_id,
            a.ean AS ean,
            a.artikelnr AS model,
            {sku_sql},
            {inaktiv_sql},
            {geaendert_sql},
            {price_sql},
            NULL AS currency_code
        FROM shopartikel a
        {join_price_sql}
        WHERE a.artikelnr = %s
           OR TRIM(a.artikelnr) = TRIM(%s)
           OR REPLACE(REPLACE(TRIM(a.artikelnr), ' ', ''), '-', '') = %s
        ORDER BY a.artikelid DESC
        LIMIT 1
    """
    try:
        cur.execute(query_with_currency, (artikelnr, artikelnr, normalized_artikelnr))
    except mysql.connector.Error:
        logger.warning(
            "JV_JV_QUERY_BY_ARTIKELNR_WITH_CURRENCY_FAILED code=jv_jv_query_by_artikelnr_with_currency_failed",
            exc_info=True,
        )
        cur.execute(query_without_currency, (artikelnr, artikelnr, normalized_artikelnr))
    row = cur.fetchone()
    if not row:
        return None

    return _fetch_jv_product_snapshot_by_product_id(cur, int(row["product_id"]), site_key=site_key)


def _fetch_jv_product_snapshot_by_product_id(cur, source_product_id: int, *, site_key: str | None = None):
    has_shopartikelpreise = _table_exists(cur, "shopartikelpreise")
    has_staffel = _table_has_column(cur, "shopartikelpreise", "staffel") if has_shopartikelpreise else False
    has_preis = _table_has_column(cur, "shopartikelpreise", "preis") if has_shopartikelpreise else False
    has_waehrung = _table_has_column(cur, "shopartikelpreise", "waehrung") if has_shopartikelpreise else False
    has_jfsku = _table_has_column(cur, "shopartikel", "jfsku")
    has_inaktiv = _table_has_column(cur, "shopartikel", "inaktiv")
    has_geaendert = _table_has_column(cur, "shopartikel", "geaendert")

    sku_sql = "a.jfsku AS sku" if has_jfsku else "NULL AS sku"
    inaktiv_sql = "a.inaktiv AS inaktiv" if has_inaktiv else "0 AS inaktiv"
    geaendert_sql = "a.geaendert AS date_modified" if has_geaendert else "NULL AS date_modified"
    price_sql = "p.preis AS price" if (has_shopartikelpreise and has_preis) else "NULL AS price"
    currency_sql = "p.waehrung AS currency_code" if (has_shopartikelpreise and has_waehrung) else "NULL AS currency_code"
    join_price_sql = (
        "LEFT JOIN shopartikelpreise p ON p.artikelid = a.artikelid AND p.staffel = 1"
        if has_shopartikelpreise and has_staffel
        else "LEFT JOIN shopartikelpreise p ON p.artikelid = a.artikelid"
        if has_shopartikelpreise
        else ""
    )

    query_with_currency = f"""
        SELECT
            a.artikelid AS product_id,
            a.ean AS ean,
            a.artikelnr AS model,
            {sku_sql},
            {inaktiv_sql},
            {geaendert_sql},
            {price_sql},
            {currency_sql}
        FROM shopartikel a
        {join_price_sql}
        WHERE a.artikelid = %s
        LIMIT 1
    """
    query_without_currency = f"""
        SELECT
            a.artikelid AS product_id,
            a.ean AS ean,
            a.artikelnr AS model,
            {sku_sql},
            {inaktiv_sql},
            {geaendert_sql},
            {price_sql},
            NULL AS currency_code
        FROM shopartikel a
        {join_price_sql}
        WHERE a.artikelid = %s
        LIMIT 1
    """
    try:
        cur.execute(query_with_currency, (source_product_id,))
    except mysql.connector.Error:
        logger.warning(
            "JV_JV_QUERY_BY_ID_WITH_CURRENCY_FAILED code=jv_jv_query_by_id_with_currency_failed",
            exc_info=True,
        )
        cur.execute(query_without_currency, (source_product_id,))
    row = cur.fetchone()
    if not row:
        return None

    product_id = row["product_id"]
    has_bezeichnung = _table_has_column(cur, "shopartikelcontent", "bezeichnung")
    has_bezeichnung_html = _table_has_column(cur, "shopartikelcontent", "bezeichnung_html")
    has_keywords = _table_has_column(cur, "shopartikelcontent", "keywords")
    has_urlkey = _table_has_column(cur, "shopartikelcontent", "urlkey")
    has_kurzbeschreibung = _table_has_column(cur, "shopartikelcontent", "kurzbeschreibung")
    has_kurzbezeichnung = _table_has_column(cur, "shopartikelcontent", "kurzbezeichnung")
    has_bezeichnung_kurz = _table_has_column(cur, "shopartikelcontent", "bezeichnung_kurz")
    has_teaser = _table_has_column(cur, "shopartikelcontent", "teaser")
    bezeichnung_sql = "bezeichnung" if has_bezeichnung else "''"
    description_sql = "bezeichnung_html" if has_bezeichnung_html else bezeichnung_sql
    keywords_sql = "keywords" if has_keywords else "''"
    urlkey_sql = "urlkey" if has_urlkey else "''"
    kurzbeschreibung_sql = "kurzbeschreibung" if has_kurzbeschreibung else "''"
    kurzbezeichnung_sql = "kurzbezeichnung" if has_kurzbezeichnung else "''"
    bezeichnung_kurz_sql = "bezeichnung_kurz" if has_bezeichnung_kurz else "''"
    teaser_sql = "teaser" if has_teaser else "''"
    cur.execute(
        f"""
        SELECT
            sprache,
            name,
            {bezeichnung_sql} AS bezeichnung,
            {description_sql} AS bezeichnung_html,
            {keywords_sql} AS keywords,
            {urlkey_sql} AS urlkey,
            {kurzbeschreibung_sql} AS kurzbeschreibung,
            {kurzbezeichnung_sql} AS kurzbezeichnung,
            {bezeichnung_kurz_sql} AS bezeichnung_kurz,
            {teaser_sql} AS teaser
        FROM shopartikelcontent
        WHERE artikelid = %s
        ORDER BY sprache ASC
        """,
        (product_id,),
    )
    content_rows = cur.fetchall() or []
    seo_by_language = _fetch_jv_seo_by_product_id(cur, product_id)
    descriptions = []
    jv_content_rows = []
    for item in content_rows:
        lang = str(item.get("sprache") or "").strip().lower()
        language_id = JV_LANGUAGE_ID_BY_CODE.get(lang, 1)
        seo_row = seo_by_language.get(lang, {})
        description_value = item.get("bezeichnung_html") or item.get("bezeichnung") or ""
        short_value = (
            item.get("kurzbeschreibung")
            or item.get("kurzbezeichnung")
            or item.get("bezeichnung_kurz")
            or item.get("teaser")
            or ""
        )
        jv_content_rows.append(
            {
                "language_code": lang,
                "name": item.get("name") or "",
                "keywords": item.get("keywords") or "",
                "description": description_value,
                "bezeichnung": item.get("bezeichnung") or "",
                "meta_title": seo_row.get("meta_title") or "",
                "meta_description": seo_row.get("meta_description") or "",
                "meta_keyword": seo_row.get("meta_keyword") or "",
                "short_description_real": short_value,
                "kurzbeschreibung": short_value,
            }
        )
        descriptions.append(
            {
                "language_id": language_id,
                "name": item.get("name") or "",
                "description": description_value,
                "tag": "",
                "meta_title": seo_row.get("meta_title") or item.get("name") or "",
                "meta_description": seo_row.get("meta_description") or "",
                "meta_keyword": seo_row.get("meta_keyword") or item.get("keywords") or "",
            }
        )

    jv_admin_fields: dict = {}
    artikel_cols = []
    for col in ("is_sofort", "mwstid", "lieferzeitid", "lieferzeit", "lieferzeit_id", "einheitid", "grundeinheit", "vpe", "uvp"):
        if _table_has_column(cur, "shopartikel", col):
            artikel_cols.append(col)
    if artikel_cols:
        cols_sql = ", ".join(f"`{c}`" for c in artikel_cols)
        cur.execute(f"SELECT {cols_sql} FROM `shopartikel` WHERE artikelid = %s LIMIT 1", (product_id,))
        artikel_row = cur.fetchone() or {}
        if isinstance(artikel_row, dict):
            jv_admin_fields.update(artikel_row)

    supplier_liefernr = _fetch_jv_supplier_liefernr(cur, product_id)
    if supplier_liefernr:
        jv_admin_fields["liefernr"] = supplier_liefernr

    if _table_exists(cur, "shopartikelpreise"):
        has_staffel_price = _table_has_column(cur, "shopartikelpreise", "staffel")
        has_basis = _table_has_column(cur, "shopartikelpreise", "basis")
        has_filter = _table_has_column(cur, "shopartikelpreise", "filter")
        price_cols = []
        if has_basis:
            price_cols.append("basis")
        if has_filter:
            price_cols.append("filter")
        if price_cols:
            cols_sql = ", ".join(f"`{c}`" for c in price_cols)
            if has_staffel_price:
                cur.execute(
                    f"SELECT {cols_sql} FROM `shopartikelpreise` WHERE artikelid = %s AND staffel = 1 LIMIT 1",
                    (product_id,),
                )
            else:
                cur.execute(
                    f"SELECT {cols_sql} FROM `shopartikelpreise` WHERE artikelid = %s LIMIT 1",
                    (product_id,),
                )
            price_row = cur.fetchone() or {}
            if isinstance(price_row, dict):
                jv_admin_fields.update(price_row)

    de_content = next((x for x in jv_content_rows if str(x.get("language_code") or "").lower() == "de"), None) or (jv_content_rows[0] if jv_content_rows else None)
    if de_content:
        if de_content.get("short_description_real") not in (None, ""):
            jv_admin_fields["short_description_real"] = de_content.get("short_description_real")
        if de_content.get("description") not in (None, ""):
            jv_admin_fields["description"] = de_content.get("description")
    if content_rows:
        de_full = next((x for x in content_rows if str((x or {}).get("sprache") or "").strip().lower() == "de"), content_rows[0])
        if isinstance(de_full, dict) and de_full.get("urlkey") not in (None, ""):
            jv_admin_fields["urlkey"] = de_full.get("urlkey")

    categories = []
    if _table_exists(cur, "shoprubrikartikel"):
        has_rubid = _table_has_column(cur, "shoprubrikartikel", "rubid")
        has_priority = _table_has_column(cur, "shoprubrikartikel", "priority")
        if has_rubid:
            priority_sql = "priority" if has_priority else "0 AS priority"
            cur.execute(
                f"""
                SELECT rubid, {priority_sql}
                FROM shoprubrikartikel
                WHERE artikelid = %s
                ORDER BY priority DESC, ordnum ASC
                """,
                (product_id,),
            )
            categories = _normalize_jv_categories(cur.fetchall() or [])
            categories = _apply_jv_category_main_override(
                categories,
                site_key=site_key,
                ean=row.get("ean"),
            )

    media_key = str(row.get("model") or "").strip() or str(row.get("ean") or "").strip()
    main_image, extra_images = _fetch_jv_media_from_shopmedia(
        cur,
        media_key=media_key,
        ean=str(row.get("ean") or ""),
    )

    product = {
        "product_id": row["product_id"],
        "ean": row.get("ean"),
        "model": row.get("model"),
        "sku": row.get("sku"),
        "price": row.get("price"),
        "quantity": None,
        "status": 0 if int(row.get("inaktiv") or 0) == 1 else 1,
        "manufacturer_id": None,
        "stock_status_id": None,
        "tax_class_id": None,
        "image": main_image,
        "date_available": None,
        "date_modified": row.get("date_modified"),
    }
    return {
        "product": product,
        "descriptions": descriptions,
        "categories": categories,
        "stores": [],
        "images": extra_images,
        "specials": [],
        "jv_fields": {
            "artikelid": row.get("product_id"),
            "artikelnr": row.get("model"),
            "jfsku": row.get("sku"),
            "ean": row.get("ean"),
            "inaktiv": int(row.get("inaktiv") or 0),
            "geaendert": _json_safe_datetime(row.get("date_modified")),
            "currency_code": row.get("currency_code"),
            "languages": sorted({str((item or {}).get("language_code") or "").strip() for item in jv_content_rows if str((item or {}).get("language_code") or "").strip()}),
            "content_by_language": jv_content_rows,
            "is_sofort": jv_admin_fields.get("is_sofort"),
            "mwstid": jv_admin_fields.get("mwstid"),
            "lieferzeitid": _first_present_value(
                jv_admin_fields.get("lieferzeitid"),
                jv_admin_fields.get("lieferzeit"),
                jv_admin_fields.get("lieferzeit_id"),
            ),
            "einheitid": jv_admin_fields.get("einheitid"),
            "grundeinheit": jv_admin_fields.get("grundeinheit"),
            "vpe": jv_admin_fields.get("vpe"),
            "uvp": _as_plain_value(jv_admin_fields.get("uvp")),
            "preisbasis": jv_admin_fields.get("basis"),
            "preisfilter": jv_admin_fields.get("filter"),
            "urlkey": jv_admin_fields.get("urlkey"),
            "short_description_real": jv_admin_fields.get("short_description_real"),
            "liefernr": jv_admin_fields.get("liefernr"),
            "supplier_liefernr": jv_admin_fields.get("liefernr"),
        },
    }


def _fetch_oc_snapshot_by_product_id(cur, *, product_id: int, prefix: str):
    t_product = f"`{prefix}product`"
    t_product_description = f"`{prefix}product_description`"
    t_product_to_category = f"`{prefix}product_to_category`"
    raw_product_to_category = f"{prefix}product_to_category"
    t_product_to_store = f"`{prefix}product_to_store`"
    t_product_image = f"`{prefix}product_image`"
    t_product_special = f"`{prefix}product_special`"

    cur.execute(f"SELECT * FROM {t_product} WHERE product_id = %s LIMIT 1", (product_id,))
    product = cur.fetchone()
    if not product:
        return None

    cur.execute(
        f"""
        SELECT language_id, name, description, tag, meta_title, meta_description, meta_keyword
        FROM {t_product_description}
        WHERE product_id = %s
        ORDER BY language_id
        """,
        (product_id,),
    )
    descriptions = cur.fetchall() or []

    has_main_category = _table_has_column(cur, raw_product_to_category, "main_category")
    categories_sql = (
        f"SELECT category_id, main_category FROM {t_product_to_category} WHERE product_id = %s ORDER BY category_id"
        if has_main_category
        else f"SELECT category_id, 0 AS main_category FROM {t_product_to_category} WHERE product_id = %s ORDER BY category_id"
    )
    cur.execute(categories_sql, (product_id,))
    categories = cur.fetchall() or []

    cur.execute(
        f"SELECT store_id FROM {t_product_to_store} WHERE product_id = %s ORDER BY store_id",
        (product_id,),
    )
    stores = cur.fetchall() or []

    cur.execute(
        f"SELECT image, sort_order FROM {t_product_image} WHERE product_id = %s ORDER BY sort_order, product_image_id",
        (product_id,),
    )
    images = cur.fetchall() or []

    cur.execute(
        f"""
        SELECT customer_group_id, priority, price, date_start, date_end
        FROM {t_product_special}
        WHERE product_id = %s
        ORDER BY priority, product_special_id
        """,
        (product_id,),
    )
    specials = cur.fetchall() or []

    return {
        "product": product,
        "descriptions": descriptions,
        "categories": categories,
        "stores": stores,
        "images": images,
        "specials": specials,
    }


def fetch_source_product_snapshot_by_ean(config: dict, ean: str):
    conn = _mysql_connect(config)
    cur = conn.cursor(dictionary=True)
    try:
        prefix = config.get("table_prefix", "oc_")
        if not _table_exists(cur, f"{prefix}product") and _table_exists(cur, "shopartikel"):
            return _fetch_jv_product_snapshot_by_ean(cur, ean, site_key=config.get("site_key"))

        normalized_ean = "".join(ch for ch in (ean or "") if ch.isdigit())
        cur.execute(
            f"""
            SELECT *
            FROM `{prefix}product`
            WHERE ean = %s
               OR TRIM(ean) = TRIM(%s)
               OR REPLACE(REPLACE(TRIM(ean), ' ', ''), '-', '') = %s
               OR model = %s
               OR TRIM(model) = TRIM(%s)
               OR REPLACE(REPLACE(TRIM(model), ' ', ''), '-', '') = %s
            ORDER BY product_id DESC
            LIMIT 1
            """,
            (ean, ean, normalized_ean, ean, ean, normalized_ean),
        )
        product = cur.fetchone()
        if not product:
            return None

        return _fetch_oc_snapshot_by_product_id(cur, product_id=int(product["product_id"]), prefix=prefix)
    finally:
        cur.close()
        conn.close()


def fetch_source_product_snapshot_by_artikelnr(config: dict, artikelnr: str):
    conn = _mysql_connect(config)
    cur = conn.cursor(dictionary=True)
    try:
        prefix = config.get("table_prefix", "oc_")
        if not _table_exists(cur, f"{prefix}product") and _table_exists(cur, "shopartikel"):
            return _fetch_jv_product_snapshot_by_artikelnr(cur, artikelnr, site_key=config.get("site_key"))

        normalized_artikelnr = re.sub(r"[\s-]+", "", str(artikelnr or "").strip())
        cur.execute(
            f"""
            SELECT *
            FROM `{prefix}product`
            WHERE model = %s
               OR TRIM(model) = TRIM(%s)
               OR REPLACE(REPLACE(TRIM(model), ' ', ''), '-', '') = %s
            ORDER BY product_id DESC
            LIMIT 1
            """,
            (artikelnr, artikelnr, normalized_artikelnr),
        )
        product = cur.fetchone()
        if not product:
            return None

        return _fetch_oc_snapshot_by_product_id(cur, product_id=int(product["product_id"]), prefix=prefix)
    finally:
        cur.close()
        conn.close()


def fetch_source_product_snapshot_by_product_id(config: dict, source_product_id: int):
    conn = _mysql_connect(config)
    cur = conn.cursor(dictionary=True)
    try:
        prefix = config.get("table_prefix", "oc_")
        if not _table_exists(cur, f"{prefix}product") and _table_exists(cur, "shopartikel"):
            return _fetch_jv_product_snapshot_by_product_id(
                cur,
                int(source_product_id),
                site_key=config.get("site_key"),
            )
        return _fetch_oc_snapshot_by_product_id(cur, product_id=int(source_product_id), prefix=prefix)
    finally:
        cur.close()
        conn.close()


def fetch_source_product_brief_by_ean(config: dict, ean: str):
    conn = _mysql_connect(config)
    cur = conn.cursor(dictionary=True)
    try:
        prefix = config.get("table_prefix", "oc_")
        t_product = f"`{prefix}product`"
        t_product_description = f"`{prefix}product_description`"
        t_setting = f"`{prefix}setting`"
        t_currency = f"`{prefix}currency`"

        if not _table_exists(cur, f"{prefix}product") and _table_exists(cur, "shopartikel"):
            return _fetch_jv_product_brief_by_ean(cur, ean)

        normalized_ean = "".join(ch for ch in (ean or "") if ch.isdigit())
        cur.execute(
            f"""
            SELECT
                p.product_id,
                p.ean,
                p.model,
                p.price,
                (
                  SELECT pd1.name
                  FROM {t_product_description} pd1
                  WHERE pd1.product_id = p.product_id
                  ORDER BY CASE WHEN pd1.language_id = 1 THEN 0 ELSE 1 END, pd1.language_id
                  LIMIT 1
                ) AS title
            FROM {t_product} p
            WHERE p.ean = %s
               OR TRIM(p.ean) = TRIM(%s)
               OR REPLACE(REPLACE(TRIM(p.ean), ' ', ''), '-', '') = %s
               OR p.model = %s
               OR TRIM(p.model) = TRIM(%s)
               OR REPLACE(REPLACE(TRIM(p.model), ' ', ''), '-', '') = %s
            ORDER BY p.product_id DESC
            LIMIT 1
            """,
            (ean, ean, normalized_ean, ean, ean, normalized_ean),
        )
        row = cur.fetchone()
        if not row:
            return None

        currency_code = None
        try:
            cur.execute(
                f"""
                SELECT value
                FROM {t_setting}
                WHERE `key` = 'config_currency'
                ORDER BY store_id ASC
                LIMIT 1
                """
            )
            setting_row = cur.fetchone() or {}
            raw_currency = (setting_row.get("value") or "").strip()
            if re.match(r"^[A-Za-z]{3}$", raw_currency):
                currency_code = raw_currency.upper()
            else:
                match = re.search(r"([A-Za-z]{3})", raw_currency)
                currency_code = match.group(1).upper() if match else None
        except Exception:
            logger.warning(
                "JV_CURRENCY_CONFIG_QUERY_FAILED code=jv_currency_config_query_failed",
                exc_info=True,
            )
            currency_code = None

        if not currency_code:
            try:
                cur.execute(
                    f"""
                    SELECT code
                    FROM {t_currency}
                    WHERE value = 1
                    ORDER BY status DESC, code ASC
                    LIMIT 1
                    """
                )
                row_base = cur.fetchone() or {}
                code = (row_base.get("code") or "").strip()
                if re.match(r"^[A-Za-z]{3}$", code):
                    currency_code = code.upper()
            except Exception:
                logger.warning(
                    "JV_CURRENCY_BASE_QUERY_FAILED code=jv_currency_base_query_failed",
                    exc_info=True,
                )
                currency_code = None

        if not currency_code:
            try:
                cur.execute(
                    f"""
                    SELECT code
                    FROM {t_currency}
                    WHERE status = 1
                    ORDER BY code ASC
                    LIMIT 1
                    """
                )
                row_enabled = cur.fetchone() or {}
                code = (row_enabled.get("code") or "").strip()
                if re.match(r"^[A-Za-z]{3}$", code):
                    currency_code = code.upper()
            except Exception:
                logger.warning(
                    "JV_CURRENCY_ENABLED_QUERY_FAILED code=jv_currency_enabled_query_failed",
                    exc_info=True,
                )
                currency_code = None

        row["currency_code"] = currency_code
        return row
    finally:
        cur.close()
        conn.close()
