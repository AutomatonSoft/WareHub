import re
from datetime import datetime

from .models import ImportedProduct
from .batch_defaults import DEFAULT_CURRENCY_BY_SITE_KEY
from .source_schema import (
    table_exists as _table_exists,
    table_has_column as _table_has_column,
)
from .source_media import (
    normalize_jv_db_image_path as _normalize_jv_db_image_path,
    sync_jv_images as _sync_jv_images,
    sync_jv_shopmedia as _sync_jv_shopmedia,
)
from .source_categories import (
    extract_main_category_id as _extract_main_category_id,
    sync_jv_rubrikartikel as _sync_jv_rubrikartikel,
)
from .source_metadata import (
    sync_jv_seo as _sync_jv_seo,
    sync_jv_supplier_liefernr as _sync_jv_supplier_liefernr,
)
from .source_values import (
    as_plain_value as _as_plain_value,
    extract_jv_content_overrides as _extract_jv_content_overrides,
    jv_suchfeld as _jv_suchfeld,
    jv_urlkey as _jv_urlkey,
    process_uvp as _process_uvp,
    resolve_jv_lieferzeit_id as _resolve_jv_lieferzeit_id,
    resolve_jv_seo_values as _resolve_jv_seo_values,
    to_float_or_default as _to_float_or_default,
    to_int_or_default as _to_int_or_default,
)


# JV-wide invariants enforced here so create and push share the same guarantee:
#  - manufacturer (hersteller) is always "JVMOEBEL";
#  - the manufacturer article number (Hersteller-Artikelnr., stored as the
#    supplier liefernr in shopartikellieferanteninfo) is always "JVM<EAN>".
# The plain article number (artikelnr / "Artikel-Nr.") stays user-controlled.
_JV_HERSTELLER = "JVMOEBEL"


def _jv_hersteller_artikelnr(product: ImportedProduct) -> str:
    ean = (product.ean or "").strip()
    return f"JVM{ean}" if ean else ""


def _currency_for_product(product: ImportedProduct) -> str:
    # The price row currency must match the shop currency, otherwise the storefront
    # (which filters prices by currency) finds no price and shows 0 until a manual
    # admin save fixes it. CH -> CHF, CO_UK -> GBP, DE/AT -> EUR.
    site_key = str(getattr(product, "site_key", "") or "").strip().upper()
    return DEFAULT_CURRENCY_BY_SITE_KEY.get(site_key, "EUR")


def _create_product_in_jv_source(cur, product: ImportedProduct) -> int:
    if not _table_exists(cur, "shopartikel"):
        raise RuntimeError("source JV table shopartikel not found")

    now = datetime.utcnow()
    jv_overrides = getattr(product, "_jv_fields", {}) if isinstance(getattr(product, "_jv_fields", {}), dict) else {}
    lieferzeit_value = _resolve_jv_lieferzeit_id(cur, jv_overrides, default=11)
    base_price = _to_float_or_default(_as_plain_value(product.price), 0.0)
    uvp_value = _process_uvp(base_price)
    normalized_main_image = _normalize_jv_db_image_path(product.image or "")
    artikel_defaults = {
        "artikelnr": (product.source_model or "").strip() or (product.ean or "").strip(),
        "is_sofort": _to_int_or_default(jv_overrides.get("is_sofort"), 1),
        "auto": 0,
        # The storefront price calculation skips rows where `subsequent` is NULL
        # (the column default), showing 0 until a manual admin save sets it to 0.
        # New JV products must carry subsequent=0 so the price renders immediately.
        "subsequent": 0,
        "inaktiv": 0 if bool(product.status) else 1,
        "mwstid": _to_int_or_default(jv_overrides.get("mwstid"), 3),
        "lieferzeitid": lieferzeit_value,
        "lieferzeit": lieferzeit_value,
        "lieferzeit_id": lieferzeit_value,
        "einheitid": _to_int_or_default(jv_overrides.get("einheitid"), 6),
        "grundeinheit": _to_int_or_default(jv_overrides.get("grundeinheit"), 6),
        "vpe": _to_int_or_default(jv_overrides.get("vpe"), 1),
        # "Menge" in the Grundpreis block ("Menge und Einheit") maps to shopartikel.inhalt,
        # which defaults to 0 in the DB. New products must carry a content quantity of 1
        # (matching the main product), otherwise the storefront shows "Menge 0".
        "inhalt": _to_int_or_default(jv_overrides.get("vpe"), 1),
        "type": 0,
        "erfasst": now,
        "geaendert": now,
        "user": (product.update_user or "system_import"),
        "ean": (product.ean or "").strip(),
        "hersteller": _JV_HERSTELLER,
        "uvp": uvp_value,
        "jfsku": (product.source_sku or "").strip(),
        "jtl_dimensions_length": 0,
        "jtl_dimensions_width": 0,
        "jtl_dimensions_height": 0,
        "bild": normalized_main_image,
        "image": normalized_main_image,
    }
    main_category_id = _extract_main_category_id(list(product.categories.all().values("category_id", "main_category")))
    if main_category_id is not None:
        artikel_defaults["rubid"] = main_category_id
        artikel_defaults["rubrikid"] = main_category_id
        artikel_defaults["hauptrubid"] = main_category_id
        artikel_defaults["hauptrubrik"] = main_category_id

    existing_columns = [name for name in artikel_defaults if _table_has_column(cur, "shopartikel", name)]
    if not existing_columns:
        raise RuntimeError("shopartikel has no expected columns")

    cols_sql = ", ".join(f"`{name}`" for name in existing_columns)
    vals_sql = ", ".join(["%s"] * len(existing_columns))
    vals = [artikel_defaults[name] for name in existing_columns]
    cur.execute(f"INSERT INTO `shopartikel` ({cols_sql}) VALUES ({vals_sql})", tuple(vals))
    artikelid = int(cur.lastrowid or 0)
    if artikelid <= 0:
        raise RuntimeError("failed to obtain inserted JV artikelid")

    if _table_exists(cur, "shopartikelpreise"):
        price_defaults = {
            "artikelid": artikelid,
            "staffel": 1,
            "preis": _as_plain_value(product.price) if product.price is not None else 0,
            "prozent": 0,
            "basis": str(jv_overrides.get("preisbasis") or "brutto"),
            "filter": str(jv_overrides.get("preisfilter") or "default"),
            "waehrung": _currency_for_product(product),
            "auto": 0,
            "second_price": 0,
        }
        price_cols = [name for name in price_defaults if _table_has_column(cur, "shopartikelpreise", name)]
        if "artikelid" in price_cols and "staffel" in price_cols:
            cur.execute("DELETE FROM `shopartikelpreise` WHERE artikelid = %s AND staffel = 1", (artikelid,))
            cols_sql = ", ".join(f"`{name}`" for name in price_cols)
            vals_sql = ", ".join(["%s"] * len(price_cols))
            vals = [price_defaults[name] for name in price_cols]
            cur.execute(f"INSERT INTO `shopartikelpreise` ({cols_sql}) VALUES ({vals_sql})", tuple(vals))

    if _table_exists(cur, "shopartikelcontent"):
        content_overrides = _extract_jv_content_overrides(jv_overrides)
        first_desc = product.descriptions.order_by("id").first()
        name_value = str(content_overrides.get("name") or "").strip() or (getattr(first_desc, "name", "") or "").strip() or (product.source_model or "").strip() or (product.ean or "").strip()
        html_value = (
            str(
                content_overrides.get("description")
                or content_overrides.get("bezeichnung_html")
                or content_overrides.get("BESCHREIBUNG")
                or ""
            ).strip()
            or (getattr(first_desc, "description", "") or "").strip()
        )
        short_value = str(content_overrides.get("short_description") or "").strip()
        short_real_value = str(
            content_overrides.get("short_description_real")
            or content_overrides.get("kurzbeschreibung")
            or content_overrides.get("KURZBESCHREIBUNG")
            or ""
        ).strip()
        plain_override_value = str(content_overrides.get("bezeichnung") or "").strip()
        plain_value = plain_override_value or short_value or re.sub(r"<[^>]*>", " ", html_value)
        plain_value = re.sub(r"\s+", " ", plain_value).strip()
        suchfeld_value = _jv_suchfeld(name_value, plain_value, (product.ean or "").strip())
        urlkey_value = str(jv_overrides.get("urlkey") or "").strip() or _jv_urlkey(name_value)
        keywords_value = str(content_overrides.get("keywords") or "").strip()
        content_defaults = {
            "artikelid": artikelid,
            "sprache": "de",
            "name": name_value,
            "bezeichnung": plain_value,
            "bezeichnung_html": html_value,
            "bezeichnung_plain": plain_value,
            "kurzbeschreibung": short_real_value,
            "kurzbezeichnung": short_real_value,
            "bezeichnung_kurz": short_real_value,
            "teaser": short_real_value,
            "keywords": keywords_value,
            "suchfeld": suchfeld_value,
            "urlkey": urlkey_value,
        }
        content_cols = [name for name in content_defaults if _table_has_column(cur, "shopartikelcontent", name)]
        if "artikelid" in content_cols and "sprache" in content_cols:
            cur.execute("DELETE FROM `shopartikelcontent` WHERE artikelid = %s AND sprache = 'de'", (artikelid,))
            cols_sql = ", ".join(f"`{name}`" for name in content_cols)
            vals_sql = ", ".join(["%s"] * len(content_cols))
            vals = [content_defaults[name] for name in content_cols]
            cur.execute(f"INSERT INTO `shopartikelcontent` ({cols_sql}) VALUES ({vals_sql})", tuple(vals))
        seo_values = _resolve_jv_seo_values(product, content_overrides)
        _sync_jv_seo(cur, artikelid, language_code="de", **seo_values)

    # Hersteller-Artikelnr.: always store "JVM<EAN>" as the supplier liefernr.
    hersteller_artikelnr = _jv_hersteller_artikelnr(product)
    if hersteller_artikelnr:
        _sync_jv_supplier_liefernr(cur, artikelid, hersteller_artikelnr)

    _sync_jv_rubrikartikel(cur, artikelid, list(product.categories.all().values("category_id", "main_category")))
    _sync_jv_images(cur, artikelid, product)
    _sync_jv_shopmedia(cur, product, artikelid=artikelid)

    return artikelid


def _push_product_to_jv_source(
    cur,
    product: ImportedProduct,
    *,
    changed_scalar_fields: set[str],
    changed_relations: set[str],
):
    if not _table_exists(cur, "shopartikel"):
        raise RuntimeError("source JV table shopartikel not found")

    artikelid = int(product.source_product_id or 0)
    if artikelid <= 0:
        raise RuntimeError("invalid JV source_product_id")

    cur.execute("SELECT artikelid FROM `shopartikel` WHERE artikelid = %s LIMIT 1", (artikelid,))
    if cur.fetchone() is None:
        raise RuntimeError(f"JV article not found for artikelid={artikelid}")

    jv_overrides = getattr(product, "_jv_fields", {}) if isinstance(getattr(product, "_jv_fields", {}), dict) else {}
    lieferzeit_value = _resolve_jv_lieferzeit_id(cur, jv_overrides, default=11)
    normalized_main_image = _normalize_jv_db_image_path(product.image or "")
    update_map = {
        "source_model": ("artikelnr", (product.source_model or "").strip()),
        "source_sku": ("jfsku", (product.source_sku or "").strip()),
        "source_ean_field": ("ean", (product.ean or "").strip()),
        "status": ("inaktiv", 0 if bool(product.status) else 1),
        "image": ("bild", normalized_main_image),
    }
    update_pairs = []
    for key in changed_scalar_fields:
        if key in update_map:
            col, val = update_map[key]
            if _table_has_column(cur, "shopartikel", col):
                update_pairs.append((col, val))

    # JV invariant: manufacturer is always JVMOEBEL (the plain artikelnr /
    # "Artikel-Nr." stays user-controlled; the Hersteller-Artikelnr. is enforced
    # below via the supplier liefernr).
    if _table_has_column(cur, "shopartikel", "hersteller"):
        update_pairs.append(("hersteller", _JV_HERSTELLER))
    # Ensure the storefront-price guard column is never left NULL on re-pushes of
    # products that were created before this was set (see create path for details).
    if _table_has_column(cur, "shopartikel", "subsequent"):
        update_pairs.append(("subsequent", 0))
    if _table_has_column(cur, "shopartikel", "geaendert"):
        update_pairs.append(("geaendert", datetime.utcnow()))
    if "image" in changed_scalar_fields and _table_has_column(cur, "shopartikel", "image"):
        update_pairs.append(("image", normalized_main_image))
    if ("categories" in changed_relations) and _table_exists(cur, "shopartikel"):
        main_category_id = _extract_main_category_id(list(product.categories.all().values("category_id", "main_category")))
        if main_category_id is not None:
            for col_name in ("rubid", "rubrikid", "hauptrubid", "hauptrubrik"):
                if _table_has_column(cur, "shopartikel", col_name):
                    update_pairs.append((col_name, main_category_id))
    for override_key, col_name, default in [
        ("is_sofort", "is_sofort", None),
        ("mwstid", "mwstid", None),
        ("lieferzeitid", "lieferzeitid", None),
        ("lieferzeitid", "lieferzeit", None),
        ("lieferzeitid", "lieferzeit_id", None),
        ("einheitid", "einheitid", None),
        ("grundeinheit", "grundeinheit", None),
        ("vpe", "vpe", None),
    ]:
        if jv_overrides.get(override_key) is not None and _table_has_column(cur, "shopartikel", col_name):
            value = jv_overrides.get(override_key)
            if override_key == "lieferzeitid":
                update_pairs.append((col_name, lieferzeit_value))
                continue
            if default is None:
                update_pairs.append((col_name, _to_int_or_default(value, 0)))
            else:
                update_pairs.append((col_name, _to_int_or_default(value, default)))
    if _table_has_column(cur, "shopartikel", "uvp") and "price" in changed_scalar_fields:
        update_pairs.append(("uvp", _process_uvp(_to_float_or_default(_as_plain_value(product.price), 0.0))))
    if update_pairs:
        set_sql = ", ".join(f"`{col}` = %s" for col, _ in update_pairs)
        values = [val for _, val in update_pairs]
        cur.execute(f"UPDATE `shopartikel` SET {set_sql} WHERE artikelid = %s", (*values, artikelid))

    price_controls_changed = any(
        jv_overrides.get(key) is not None for key in ("preisbasis", "preisfilter")
    )
    if ("price" in changed_scalar_fields or price_controls_changed) and _table_exists(cur, "shopartikelpreise"):
        defaults = {
            "artikelid": artikelid,
            "staffel": 1,
            "preis": _as_plain_value(product.price) if product.price is not None else 0,
            "prozent": 0,
            "basis": str(jv_overrides.get("preisbasis") or "brutto"),
            "filter": str(jv_overrides.get("preisfilter") or "default"),
            "waehrung": _currency_for_product(product),
            "auto": 0,
            "second_price": 0,
        }
        cols = [name for name in defaults if _table_has_column(cur, "shopartikelpreise", name)]
        if "artikelid" in cols and "staffel" in cols:
            cur.execute("DELETE FROM `shopartikelpreise` WHERE artikelid = %s AND staffel = 1", (artikelid,))
            cols_sql = ", ".join(f"`{name}`" for name in cols)
            vals_sql = ", ".join(["%s"] * len(cols))
            vals = [defaults[name] for name in cols]
            cur.execute(f"INSERT INTO `shopartikelpreise` ({cols_sql}) VALUES ({vals_sql})", tuple(vals))

    content_overrides = _extract_jv_content_overrides(jv_overrides)
    content_fields_changed = any(
        content_overrides.get(key) not in (None, "")
        for key in (
            "name",
            "keywords",
            "description",
            "bezeichnung_html",
            "short_description",
            "short_description_real",
            "meta_title",
            "meta_description",
            "meta_keyword",
        )
    ) or (jv_overrides.get("urlkey") not in (None, ""))
    if ("descriptions" in changed_relations or content_fields_changed) and _table_exists(cur, "shopartikelcontent"):
        first_desc = product.descriptions.order_by("id").first()
        name_value = str(content_overrides.get("name") or "").strip() or (getattr(first_desc, "name", "") or "").strip() or (product.source_model or "").strip() or (product.ean or "").strip()
        html_value = (
            str(
                content_overrides.get("description")
                or content_overrides.get("bezeichnung_html")
                or content_overrides.get("BESCHREIBUNG")
                or ""
            ).strip()
            or (getattr(first_desc, "description", "") or "").strip()
        )
        short_value = str(content_overrides.get("short_description") or "").strip()
        short_real_value = str(
            content_overrides.get("short_description_real")
            or content_overrides.get("kurzbeschreibung")
            or content_overrides.get("KURZBESCHREIBUNG")
            or ""
        ).strip()
        plain_override_value = str(content_overrides.get("bezeichnung") or "").strip()
        plain_value = plain_override_value or short_value or re.sub(r"<[^>]*>", " ", html_value)
        plain_value = re.sub(r"\s+", " ", plain_value).strip()
        suchfeld_value = _jv_suchfeld(name_value, plain_value, (product.ean or "").strip())
        urlkey_value = str(jv_overrides.get("urlkey") or "").strip() or _jv_urlkey(name_value)
        keywords_value = str(content_overrides.get("keywords") or "").strip()
        defaults = {
            "artikelid": artikelid,
            "sprache": "de",
            "name": name_value,
            "bezeichnung": plain_value,
            "bezeichnung_html": html_value,
            "bezeichnung_plain": plain_value,
            "kurzbeschreibung": short_real_value,
            "kurzbezeichnung": short_real_value,
            "bezeichnung_kurz": short_real_value,
            "teaser": short_real_value,
            "keywords": keywords_value,
            "suchfeld": suchfeld_value,
            "urlkey": urlkey_value,
        }
        cols = [name for name in defaults if _table_has_column(cur, "shopartikelcontent", name)]
        if "artikelid" in cols and "sprache" in cols:
            cur.execute("DELETE FROM `shopartikelcontent` WHERE artikelid = %s AND sprache = 'de'", (artikelid,))
            cols_sql = ", ".join(f"`{name}`" for name in cols)
            vals_sql = ", ".join(["%s"] * len(cols))
            vals = [defaults[name] for name in cols]
            cur.execute(f"INSERT INTO `shopartikelcontent` ({cols_sql}) VALUES ({vals_sql})", tuple(vals))

    if ("descriptions" in changed_relations or content_fields_changed) and _table_exists(cur, "shopseo"):
        seo_values = _resolve_jv_seo_values(product, content_overrides)
        _sync_jv_seo(cur, artikelid, language_code="de", **seo_values)

    # Hersteller-Artikelnr.: always store "JVM<EAN>" as the supplier liefernr.
    hersteller_artikelnr = _jv_hersteller_artikelnr(product)
    if hersteller_artikelnr:
        _sync_jv_supplier_liefernr(cur, artikelid, hersteller_artikelnr)

    if "images" in changed_relations or "image" in changed_scalar_fields:
        _sync_jv_images(cur, artikelid, product)
        _sync_jv_shopmedia(cur, product, artikelid=artikelid)

    if "categories" in changed_relations:
        _sync_jv_rubrikartikel(cur, artikelid, list(product.categories.all().values("category_id", "main_category")))
