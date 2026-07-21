import logging
from datetime import datetime
from decimal import Decimal
from pathlib import PurePosixPath

import mysql.connector

from .fields import XL_RELATION_FIELDS, XL_SOURCE_PUSH_SCALAR_FIELDS
from .models import ImportedProduct
from .source_config import (
    source_db_config_for_site,
    source_env_prefixes,
    xl_site_catalog,
)
from .source_db import table_exists as _table_exists, table_has_column as _table_has_column

logger = logging.getLogger(__name__)


def _as_plain_value(value):
    if isinstance(value, Decimal):
        return str(value)
    return value


def _as_oc_date(value):
    # Some source DBs have NOT NULL DATE and may reject NULL/zero-date depending on SQL mode.
    # Use a safe non-null sentinel date.
    return value or "1970-01-01"



def push_product_to_source(
    config: dict,
    product: ImportedProduct,
    *,
    changed_scalar_fields: set[str] | None = None,
    changed_relations: set[str] | None = None,
):
    conn = mysql.connector.connect(
        host=config["host"],
        user=config["user"],
        password=config["password"],
        database=config["database"],
        port=config["port"],
        use_pure=True,
    )
    cur = conn.cursor()
    try:
        conn.start_transaction()

        prefix = config.get("table_prefix", "oc_")
        if not _table_exists(cur, f"{prefix}product"):
            raise RuntimeError("source product table not found")

        t_product = f"`{prefix}product`"
        t_product_description = f"`{prefix}product_description`"
        t_product_to_category = f"`{prefix}product_to_category`"
        raw_product_to_category = f"{prefix}product_to_category"
        t_product_to_store = f"`{prefix}product_to_store`"
        t_product_image = f"`{prefix}product_image`"
        t_product_special = f"`{prefix}product_special`"
        t_url_alias = f"`{prefix}url_alias`"

        # Full push by default (backward-compatible). For PATCH flows we can pass
        # changed_scalar_fields / changed_relations to update only edited parts.
        if changed_scalar_fields is None:
            changed_scalar_fields = set(XL_SOURCE_PUSH_SCALAR_FIELDS)
        if changed_relations is None:
            changed_relations = set(XL_RELATION_FIELDS)

        field_map = {
            "source_model": ("model", product.source_model or ""),
            "source_sku": ("sku", product.source_sku or ""),
            # Keep source EAN field behavior that existed before patch-mode.
            "source_ean_field": ("ean", product.ean or ""),
            "price": ("price", _as_plain_value(product.price)),
            "quantity": ("quantity", product.quantity if product.quantity is not None else 0),
            "status": ("status", 1 if product.status else 0),
            "manufacturer_id": ("manufacturer_id", product.manufacturer_id),
            "stock_status_id": ("stock_status_id", product.stock_status_id),
            "tax_class_id": ("tax_class_id", product.tax_class_id),
            "shipping": ("shipping", 1 if getattr(product, "shipping", True) else 0),
            "subtract": ("subtract", 1 if getattr(product, "subtract", True) else 0),
            "minimum": ("minimum", product.minimum if product.minimum is not None else 1),
            "points": ("points", product.points if product.points is not None else 0),
            "sort_order": ("sort_order", product.sort_order if product.sort_order is not None else 0),
            "image": ("image", product.image or ""),
            "date_available": ("date_available", product.date_available),
        }
        update_pairs = [field_map[key] for key in field_map if key in changed_scalar_fields]
        if update_pairs:
            set_sql = ",\n                ".join(f"{col} = %s" for col, _ in update_pairs)
            values = [val for _, val in update_pairs]
            cur.execute(
                f"""
                UPDATE {t_product}
                SET
                    {set_sql},
                    date_modified = NOW()
                WHERE product_id = %s
                """,
                (*values, product.source_product_id),
            )

        if "seo_url" in changed_scalar_fields and _table_exists(cur, f"{prefix}url_alias"):
            keyword = (getattr(product, "seo_url", "") or "").strip()
            query = f"product_id={product.source_product_id}"
            cur.execute(f"DELETE FROM {t_url_alias} WHERE query = %s", (query,))
            if keyword:
                cur.execute(
                    f"INSERT INTO {t_url_alias} (query, keyword) VALUES (%s, %s)",
                    (query, keyword),
                )

        if "descriptions" in changed_relations:
            descriptions = list(product.descriptions.all().order_by("language_id", "id"))
            for desc in descriptions:
                cur.execute(
                    f"""
                    INSERT INTO {t_product_description}
                        (product_id, language_id, name, description, tag, meta_title, meta_description, meta_keyword)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        description = VALUES(description),
                        tag = VALUES(tag),
                        meta_title = VALUES(meta_title),
                        meta_description = VALUES(meta_description),
                        meta_keyword = VALUES(meta_keyword)
                    """,
                    (
                        product.source_product_id,
                        desc.language_id,
                        desc.name or "",
                        desc.description or "",
                        desc.tag or "",
                        desc.meta_title or "",
                        desc.meta_description or "",
                        desc.meta_keyword or "",
                    ),
                )

        if "categories" in changed_relations:
            has_main_category = _table_has_column(cur, raw_product_to_category, "main_category")
            for cat in product.categories.all().order_by("category_id", "id"):
                main_value = 1 if bool(getattr(cat, "main_category", False)) else 0
                if has_main_category:
                    cur.execute(
                        f"""
                        INSERT INTO {t_product_to_category} (product_id, category_id, main_category)
                        VALUES (%s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                            main_category = VALUES(main_category)
                        """,
                        (product.source_product_id, cat.category_id, main_value),
                    )
                else:
                    cur.execute(
                        f"INSERT IGNORE INTO {t_product_to_category} (product_id, category_id) VALUES (%s, %s)",
                        (product.source_product_id, cat.category_id),
                    )

        if "stores" in changed_relations:
            stores = list(product.stores.all().order_by("store_id", "id"))
            store_ids = [int(store.store_id) for store in stores] or [0]
            for store_id in store_ids:
                cur.execute(
                    f"INSERT IGNORE INTO {t_product_to_store} (product_id, store_id) VALUES (%s, %s)",
                    (product.source_product_id, store_id),
                )

        if "images" in changed_relations:
            cur.execute(
                f"DELETE FROM {t_product_image} WHERE product_id = %s",
                (product.source_product_id,),
            )
            for img in product.images.all().order_by("sort_order", "id"):
                image_path = img.image or ""
                if not image_path:
                    continue
                sort_order = img.sort_order or 0
                cur.execute(
                    f"""
                    INSERT INTO {t_product_image} (product_id, image, sort_order)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        sort_order = VALUES(sort_order)
                    """,
                    (product.source_product_id, image_path, sort_order),
                )

        if "specials" in changed_relations:
            for sp in product.specials.all().order_by("priority", "id"):
                cur.execute(
                    f"""
                    INSERT INTO {t_product_special}
                        (product_id, customer_group_id, priority, price, date_start, date_end)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        price = VALUES(price),
                        date_start = VALUES(date_start),
                        date_end = VALUES(date_end)
                    """,
                    (
                        product.source_product_id,
                        sp.customer_group_id,
                        sp.priority,
                        _as_plain_value(sp.price),
                        _as_oc_date(sp.date_start),
                        _as_oc_date(sp.date_end),
                    ),
                )

        conn.commit()
    except Exception:
        logger.exception("XL_SOURCE_PUSH_TRANSACTION_FAILED code=xl_source_push_transaction_failed")
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def create_product_in_source(config: dict, product: ImportedProduct) -> int:
    conn = mysql.connector.connect(
        host=config["host"],
        user=config["user"],
        password=config["password"],
        database=config["database"],
        port=config["port"],
        use_pure=True,
    )
    cur = conn.cursor()
    try:
        conn.start_transaction()
        prefix = config.get("table_prefix", "oc_")
        raw_product = f"{prefix}product"
        t_product = f"`{raw_product}`"
        raw_product_to_store = f"{prefix}product_to_store"
        t_product_to_store = f"`{raw_product_to_store}`"

        if not _table_exists(cur, raw_product):
            raise RuntimeError("source product table not found")

        defaults = {
            "model": product.source_model or "",
            "sku": product.source_sku or "",
            "upc": "",
            "ean": product.ean or "",
            "jan": "",
            "isbn": "",
            "mpn": "",
            "location": "",
            "quantity": product.quantity if product.quantity is not None else 0,
            "stock_status_id": product.stock_status_id if product.stock_status_id is not None else 0,
            "image": product.image or "",
            "manufacturer_id": product.manufacturer_id if product.manufacturer_id is not None else 0,
            "shipping": 1,
            "price": _as_plain_value(product.price) if product.price is not None else "0.0000",
            "points": 0,
            "tax_class_id": product.tax_class_id if product.tax_class_id is not None else 0,
            "date_available": _as_oc_date(product.date_available),
            "weight": "0.00000000",
            "weight_class_id": 0,
            "length": "0.00000000",
            "width": "0.00000000",
            "height": "0.00000000",
            "length_class_id": 0,
            "subtract": 0,
            "minimum": 1,
            "sort_order": 0,
            "status": 1 if product.status else 0,
            "viewed": 0,
            "date_added": datetime.utcnow(),
            "date_modified": datetime.utcnow(),
        }

        existing_columns = []
        for column in defaults:
            if _table_has_column(cur, raw_product, column):
                existing_columns.append(column)

        if not existing_columns:
            raise RuntimeError("source product table has no expected columns")

        columns_sql = ", ".join(f"`{column}`" for column in existing_columns)
        values_sql = ", ".join(["%s"] * len(existing_columns))
        values = [defaults[column] for column in existing_columns]
        cur.execute(
            f"INSERT INTO {t_product} ({columns_sql}) VALUES ({values_sql})",
            tuple(values),
        )
        new_product_id = int(cur.lastrowid or 0)
        if new_product_id <= 0:
            raise RuntimeError("failed to obtain inserted source product_id")

        if _table_exists(cur, raw_product_to_store):
            stores = list(product.stores.all().order_by("store_id", "id"))
            store_ids = [int(store.store_id) for store in stores] or [0]
            for store_id in store_ids:
                cur.execute(
                    f"INSERT IGNORE INTO {t_product_to_store} (product_id, store_id) VALUES (%s, %s)",
                    (new_product_id, store_id),
                )

        conn.commit()
        return new_product_id
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
