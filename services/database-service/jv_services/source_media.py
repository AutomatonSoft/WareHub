from pathlib import PurePosixPath

from .models import ImportedProduct
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


def fetch_jv_media_from_shopmedia(cur, *, media_key: str, ean: str) -> tuple[str, list[dict]]:
    # Some JV schemas do not have shopartikel.image/bild, so main/additional
    # images must be reconstructed from shopmedia.
    if not table_exists(cur, "shopmedia"):
        return "", []
    if not media_key:
        return "", []

    cur.execute("SHOW COLUMNS FROM `shopmedia`")
    raw_cols = cur.fetchall() or []
    cols = {str(r[0] if not isinstance(r, dict) else r.get("Field") or "").lower() for r in raw_cols}
    if not {"key", "art", "typ", "dateiname", "endung"}.issubset(cols):
        return "", []

    sort_col = "sortierung" if "sortierung" in cols else "order" if "order" in cols else None
    sort_sql = f", `{sort_col}`" if sort_col else ""
    order_sql = f" ORDER BY `{sort_col}` ASC" if sort_col else ""
    cur.execute(
        f"""
        SELECT typ, dateiname, endung{sort_sql}
        FROM `shopmedia`
        WHERE art = 'artikel' AND `key` = %s
        {order_sql}
        """,
        (media_key,),
    )
    rows = cur.fetchall() or []

    main_row = next((r for r in rows if str(_row_get(r, "typ", 0) or "").lower() == "v"), None)
    if main_row is None:
        main_row = next(
            (r for r in rows if str(_row_get(r, "typ", 0) or "").lower() in {"g", "n", "flashzoomer"}),
            None,
        )

    def _build_path(row, *, is_main: bool) -> str:
        stem = str(_row_get(row, "dateiname", 1) or "").strip()
        ext = str(_row_get(row, "endung", 2) or "").strip().lower() or "jpg"
        if not stem:
            return ""
        if is_main:
            return f"cosmoshop/default/pix/a/v/{stem}.{ext}"
        ean_folder = "".join(ch for ch in str(ean or "") if ch.isdigit()) or "misc"
        return f"cosmoshop/default/pix/a/z/{ean_folder}/g/{stem}.{ext}"

    main_image = _build_path(main_row, is_main=True) if main_row else ""
    extra_rows: list[dict] = []
    for row in rows:
        typ = str(_row_get(row, "typ", 0) or "").strip().lower()
        if typ not in {"z", "zg"}:
            continue
        image_path = _build_path(row, is_main=False)
        if not image_path:
            continue
        raw_sort = _row_get(row, sort_col, 3) if sort_col else None
        try:
            sort_order = int(raw_sort) if raw_sort is not None else 0
        except Exception:
            sort_order = 0
        extra_rows.append({"image": image_path, "sort_order": sort_order})

    return main_image, extra_rows


def detect_jv_image_table(cur) -> tuple[str | None, str | None, str | None]:
    candidates = [
        ("shopartikelbilder", "artikelid", "bild", "sort"),
        ("shopartikelbilder", "artikelid", "image", "sort_order"),
        ("shopartikelbilder", "artikelid", "bild", "sort_order"),
        ("shopartikelbilder", "artikelid", "image", "sort"),
        ("shopartikelimages", "artikelid", "image", "sort_order"),
        ("shopartikelimages", "artikelid", "bild", "sort"),
    ]
    for table, artikel_col, image_col, sort_col in candidates:
        if not table_exists(cur, table):
            continue
        if not table_has_column(cur, table, artikel_col):
            continue
        if not table_has_column(cur, table, image_col):
            continue
        sort_name = sort_col if table_has_column(cur, table, sort_col) else None
        return table, image_col, sort_name
    return None, None, None


def sync_jv_images(cur, artikelid: int, product: ImportedProduct):
    table, image_col, sort_col = detect_jv_image_table(cur)
    if not table or not image_col:
        return
    cur.execute(f"DELETE FROM `{table}` WHERE artikelid = %s", (artikelid,))
    image_rows: list[tuple[str, int]] = []
    main_image = normalize_jv_db_image_path(product.image or "")
    if main_image:
        image_rows.append((main_image, 0))
    for img in product.images.all().order_by("sort_order", "id"):
        image_rows.append((normalize_jv_db_image_path(img.image or ""), int(getattr(img, "sort_order", 0) or 0)))

    for idx, (image_path, image_sort) in enumerate(image_rows, start=1):
        if not image_path:
            continue
        if sort_col:
            cols_sql = f"`artikelid`, `{image_col}`, `{sort_col}`"
            cur.execute(
                f"INSERT INTO `{table}` ({cols_sql}) VALUES (%s, %s, %s)",
                (artikelid, image_path, image_sort if image_sort > 0 else idx),
            )
        else:
            cols_sql = f"`artikelid`, `{image_col}`"
            cur.execute(
                f"INSERT INTO `{table}` ({cols_sql}) VALUES (%s, %s)",
                (artikelid, image_path),
            )


def split_jv_image_path(path: str) -> tuple[str, str]:
    p = PurePosixPath(str(path or "").strip().lstrip("/"))
    stem = p.stem
    ext = p.suffix.lower().lstrip(".") or "jpg"
    if not stem:
        stem = "image"
    return stem, ext


def normalize_jv_db_image_path(path: str) -> str:
    raw = str(path or "").strip()
    if not raw:
        return ""
    raw = raw.lstrip("/")
    marker = "cosmoshop/"
    idx = raw.find(marker)
    if idx >= 0:
        return raw[idx:]
    return raw


def _fetch_shopmedia_columns(cur) -> set[str]:
    cur.execute("SHOW COLUMNS FROM `shopmedia`")
    raw_cols = cur.fetchall() or []
    return {str(r[0] if not isinstance(r, dict) else r.get("Field") or "").lower() for r in raw_cols}


def _shopmedia_insert(cur, *, columns: set[str], key_value: str, typ: str, stem: str, ext: str, sort_value: int):
    values_by_column = {
        "key": key_value,
        "art": "artikel",
        "typ": typ,
        "dateiname": stem,
        "endung": ext,
        "sortierung": sort_value,
        "order": sort_value,
        "breite": 0,
        "hoehe": 0,
        "zuordnung": "|",
        "version": 1,
        "timestamp": "NOW()",
    }
    ordered_columns = [
        "key",
        "art",
        "typ",
        "dateiname",
        "endung",
        "sortierung",
        "order",
        "breite",
        "hoehe",
        "zuordnung",
        "version",
        "timestamp",
    ]
    insert_columns = [name for name in ordered_columns if name in columns]
    if not {"key", "art", "typ", "dateiname", "endung"}.issubset(insert_columns):
        return

    sql_columns: list[str] = []
    sql_values: list[str] = []
    params: list[object] = []
    for column in insert_columns:
        sql_columns.append(f"`{column}`")
        if column == "timestamp":
            sql_values.append("NOW()")
            continue
        sql_values.append("%s")
        params.append(values_by_column[column])

    cur.execute(
        f"INSERT INTO `shopmedia` ({', '.join(sql_columns)}) VALUES ({', '.join(sql_values)})",
        tuple(params),
    )


def _resolve_shopmedia_key(cur, *, artikelid: int | None) -> str:
    if not artikelid:
        return ""
    try:
        cur.execute("SELECT artikelnr, ean FROM `shopartikel` WHERE artikelid = %s LIMIT 1", (artikelid,))
        row = cur.fetchone() or {}
    except Exception:
        row = {}
    if isinstance(row, dict):
        artikel_value = row.get("artikelnr")
        ean_value = row.get("ean")
    elif isinstance(row, (list, tuple)):
        artikel_value = row[0] if len(row) > 0 else ""
        ean_value = row[1] if len(row) > 1 else ""
    else:
        artikel_value = ""
        ean_value = ""
    artikel_key = str(artikel_value or "").strip()
    if artikel_key:
        return artikel_key
    return str(ean_value or "").strip()


def sync_jv_shopmedia(cur, product: ImportedProduct, *, artikelid: int | None = None):
    if not table_exists(cur, "shopmedia"):
        return
    cols = _fetch_shopmedia_columns(cur)
    has_sort_column = "sortierung" in cols or "order" in cols
    if not has_sort_column or not {"key", "art", "typ", "dateiname", "endung"}.issubset(cols):
        return

    key_value = _resolve_shopmedia_key(cur, artikelid=artikelid)
    if not key_value:
        return

    cur.execute("DELETE FROM `shopmedia` WHERE `key`=%s AND art='artikel' AND typ IN ('v','n','g','flashzoomer','z','zg')", (key_value,))

    main_path = normalize_jv_db_image_path(product.image or "")
    if main_path:
        stem, ext = split_jv_image_path(main_path)
        for typ in ("v", "n", "g", "flashzoomer"):
            _shopmedia_insert(cur, columns=cols, key_value=key_value, typ=typ, stem=stem, ext=ext, sort_value=0)

    unique_gallery_paths: list[str] = []
    seen_gallery_paths: set[str] = set()
    for img in product.images.all().order_by("sort_order", "id"):
        path = normalize_jv_db_image_path(img.image or "")
        if not path:
            continue
        lowered = path.lower()
        if lowered in seen_gallery_paths:
            continue
        seen_gallery_paths.add(lowered)
        unique_gallery_paths.append(path)

    used_orders_by_typ = {"z": set(), "zg": set()}
    for idx, path in enumerate(unique_gallery_paths, start=1):
        stem, ext = split_jv_image_path(path)
        # Keep gallery order unique and deterministic to satisfy shopmedia unique keys.
        sort_val = idx
        for typ in ("z", "zg"):
            while sort_val in used_orders_by_typ[typ]:
                sort_val += 1
            used_orders_by_typ[typ].add(sort_val)
            _shopmedia_insert(cur, columns=cols, key_value=key_value, typ=typ, stem=stem, ext=ext, sort_value=sort_val)
