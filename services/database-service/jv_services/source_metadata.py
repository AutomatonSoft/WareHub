from .source_schema import table_exists, table_has_column


def _row_get(row, key: str, index: int, default=""):
    if isinstance(row, dict):
        return row.get(key, default)
    if isinstance(row, (list, tuple)):
        try:
            return row[index]
        except IndexError:
            return default
    return default


def fetch_jv_seo_by_product_id(cur, product_id: int) -> dict[str, dict]:
    if not table_exists(cur, "shopseo"):
        return {}
    required = ("typ", "id", "sprache", "page_title", "meta_description", "meta_keywords")
    if any(not table_has_column(cur, "shopseo", col) for col in required):
        return {}
    cur.execute(
        """
        SELECT sprache, page_title, meta_description, meta_keywords
        FROM shopseo
        WHERE typ = 'a' AND id = %s
        ORDER BY sprache ASC
        """,
        (product_id,),
    )
    result = {}
    for row in cur.fetchall() or []:
        lang = str(_row_get(row, "sprache", 0) or "").strip().lower()
        if not lang:
            continue
        result[lang] = {
            "meta_title": _row_get(row, "page_title", 1) or "",
            "meta_description": _row_get(row, "meta_description", 2) or "",
            "meta_keyword": _row_get(row, "meta_keywords", 3) or "",
        }
    return result


def fetch_jv_supplier_liefernr(cur, product_id: int) -> str:
    if not table_exists(cur, "shopartikellieferanteninfo"):
        return ""
    if not table_has_column(cur, "shopartikellieferanteninfo", "artikelid"):
        return ""
    if not table_has_column(cur, "shopartikellieferanteninfo", "liefernr"):
        return ""
    cur.execute(
        """
        SELECT liefernr
        FROM shopartikellieferanteninfo
        WHERE artikelid = %s
        ORDER BY lieferanteninfoid ASC
        LIMIT 1
        """,
        (product_id,),
    )
    row = cur.fetchone() or {}
    return str(row.get("liefernr") or "").strip() if isinstance(row, dict) else ""


def sync_jv_supplier_liefernr(cur, product_id: int, liefernr: str) -> None:
    if not table_exists(cur, "shopartikellieferanteninfo"):
        return
    if not table_has_column(cur, "shopartikellieferanteninfo", "artikelid"):
        return
    if not table_has_column(cur, "shopartikellieferanteninfo", "liefernr"):
        return
    value = str(liefernr or "").strip()
    has_pk = table_has_column(cur, "shopartikellieferanteninfo", "lieferanteninfoid")
    if has_pk:
        cur.execute(
            """
            SELECT lieferanteninfoid
            FROM shopartikellieferanteninfo
            WHERE artikelid = %s
            ORDER BY lieferanteninfoid ASC
            LIMIT 1
            """,
            (product_id,),
        )
        row = cur.fetchone()
        if row:
            row_id = row.get("lieferanteninfoid") if isinstance(row, dict) else row[0]
            cur.execute(
                "UPDATE shopartikellieferanteninfo SET liefernr = %s WHERE lieferanteninfoid = %s",
                (value, row_id),
            )
            return
    cur.execute(
        "SELECT artikelid FROM shopartikellieferanteninfo WHERE artikelid = %s LIMIT 1",
        (product_id,),
    )
    if cur.fetchone():
        cur.execute(
            "UPDATE shopartikellieferanteninfo SET liefernr = %s WHERE artikelid = %s",
            (value, product_id),
        )
        return
    defaults = {
        "artikelid": product_id,
        "lieferantid": 0,
        "liefernr": value,
        "preis_ek": 0,
        "abverkauf": 0,
        "lieferzeit": 0,
    }
    cols = [name for name in defaults if table_has_column(cur, "shopartikellieferanteninfo", name)]
    if "artikelid" in cols and "liefernr" in cols:
        cur.execute(
            f"INSERT INTO shopartikellieferanteninfo ({', '.join(f'`{c}`' for c in cols)}) VALUES ({', '.join(['%s'] * len(cols))})",
            tuple(defaults[c] for c in cols),
        )


def sync_jv_seo(cur, product_id: int, *, language_code: str, meta_title: str, meta_description: str, meta_keyword: str) -> None:
    if not table_exists(cur, "shopseo"):
        return
    required = ("typ", "id", "sprache", "page_title", "meta_description", "meta_keywords")
    if any(not table_has_column(cur, "shopseo", col) for col in required):
        return
    lang = str(language_code or "de").strip().lower() or "de"
    cur.execute(
        """
        INSERT INTO shopseo (typ, id, sprache, page_title, meta_description, meta_keywords)
        VALUES ('a', %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            page_title = VALUES(page_title),
            meta_description = VALUES(meta_description),
            meta_keywords = VALUES(meta_keywords)
        """,
        (
            product_id,
            lang,
            str(meta_title or "").strip(),
            str(meta_description or "").strip(),
            str(meta_keyword or "").strip(),
        ),
    )
