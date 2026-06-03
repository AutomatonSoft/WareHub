from __future__ import annotations

import logging
import os
import re

import mysql.connector

from xl_services.source_push import (
    create_product_in_source as _create_product_in_source,
    push_product_to_source as _push_product_to_source,
)
from .source_config import (
    normalize_locale_code as _normalize_locale_code,
    source_db_config_for_xl,
    xl_site_catalog,
)
from .source_db import table_exists as _table_exists, table_has_column as _table_has_column

logger = logging.getLogger(__name__)

XL_SOURCE_DB_CONNECT_TIMEOUT = int(os.getenv("XL_SOURCE_DB_CONNECT_TIMEOUT", "5"))


def _connect_source_db(db_config: dict):
    return mysql.connector.connect(
        host=db_config["host"],
        user=db_config["user"],
        password=db_config["password"],
        database=db_config["database"],
        port=db_config["port"],
        connection_timeout=XL_SOURCE_DB_CONNECT_TIMEOUT,
    )

def _fetch_oc_snapshot_by_product_id(cur, *, product_id: int, prefix: str):
    t_product = f"`{prefix}product`"
    t_product_description = f"`{prefix}product_description`"
    t_product_to_category = f"`{prefix}product_to_category`"
    raw_product_to_category = f"{prefix}product_to_category"
    t_product_to_store = f"`{prefix}product_to_store`"
    t_product_image = f"`{prefix}product_image`"
    t_product_special = f"`{prefix}product_special`"
    t_url_alias = f"`{prefix}url_alias`"

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

    cur.execute(f"SELECT store_id FROM {t_product_to_store} WHERE product_id = %s ORDER BY store_id", (product_id,))
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
    seo_url = ""
    if _table_exists(cur, f"{prefix}url_alias"):
        cur.execute(f"SELECT keyword FROM {t_url_alias} WHERE query = %s LIMIT 1", (f"product_id={product_id}",))
        row = cur.fetchone() or {}
        seo_url = (row.get("keyword") or "").strip()

    return {
        "product": product,
        "descriptions": descriptions,
        "categories": categories,
        "stores": stores,
        "images": images,
        "specials": specials,
        "seo_url": seo_url,
    }


def fetch_xl_product_snapshot_by_ean(db_config: dict, ean: str):
    conn = _connect_source_db(db_config)
    cur = conn.cursor(dictionary=True)
    try:
        prefix = db_config.get("table_prefix", "oc_")
        if not _table_exists(cur, f"{prefix}product"):
            return None
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


def fetch_xl_product_snapshot_by_product_id(db_config: dict, product_id: int):
    conn = _connect_source_db(db_config)
    cur = conn.cursor(dictionary=True)
    try:
        prefix = db_config.get("table_prefix", "oc_")
        if not _table_exists(cur, f"{prefix}product"):
            return None
        return _fetch_oc_snapshot_by_product_id(cur, product_id=int(product_id), prefix=prefix)
    finally:
        cur.close()
        conn.close()


def fetch_xl_product_brief_by_ean(db_config: dict, ean: str):
    conn = _connect_source_db(db_config)
    cur = conn.cursor(dictionary=True)
    try:
        prefix = db_config.get("table_prefix", "oc_")
        if not _table_exists(cur, f"{prefix}product"):
            return None
        t_product = f"`{prefix}product`"
        t_product_description = f"`{prefix}product_description`"
        t_setting = f"`{prefix}setting`"
        t_currency = f"`{prefix}currency`"
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
        except Exception:
            logger.warning("XL currency config query failed", exc_info=True)
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
                logger.warning("XL currency fallback query failed", exc_info=True)
        row["currency_code"] = currency_code
        return row
    finally:
        cur.close()
        conn.close()


def fetch_xl_language_id_by_locale(db_config: dict):
    conn = _connect_source_db(db_config)
    cur = conn.cursor(dictionary=True)
    try:
        prefix = db_config.get("table_prefix", "oc_")
        if not _table_exists(cur, f"{prefix}language"):
            return {}
        t_language = f"`{prefix}language`"
        has_status = _table_has_column(cur, f"{prefix}language", "status")
        where_sql = "WHERE status = 1" if has_status else ""
        cur.execute(
            f"""
            SELECT language_id, code, locale, name
            FROM {t_language}
            {where_sql}
            ORDER BY language_id ASC
            """
        )
        rows = cur.fetchall() or []
        mapping: dict[str, int] = {}
        for row in rows:
            try:
                lang_id_int = int(row.get("language_id"))
            except (TypeError, ValueError):
                continue
            candidates = [
                _normalize_locale_code(row.get("code")),
                _normalize_locale_code(row.get("locale")),
                _normalize_locale_code(row.get("name")),
            ]
            for locale in candidates:
                if locale and locale not in mapping:
                    mapping[locale] = lang_id_int
        return mapping
    finally:
        cur.close()
        conn.close()


def push_xl_product_to_source(db_config: dict, product, *, changed_scalar_fields: set[str], changed_relations: set[str]):
    return _push_product_to_source(
        db_config,
        product,
        changed_scalar_fields=changed_scalar_fields,
        changed_relations=changed_relations,
    )


def create_xl_product_in_source(db_config: dict, product):
    return _create_product_in_source(db_config, product)
