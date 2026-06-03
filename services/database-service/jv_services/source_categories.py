from .source_connection import mysql_connect
from .source_schema import table_exists, table_has_column
from .source_connection import mysql_connect


def normalize_jv_categories(rows):
    normalized = []
    seen = set()
    for item in rows or []:
        try:
            # Accept both source-style rows (rubid/priority) and local payload rows.
            raw = item or {}
            rubid_value = raw.get("rubid")
            if rubid_value in (None, ""):
                rubid_value = raw.get("category_id")
            rubid = int(rubid_value)
        except (TypeError, ValueError):
            continue
        if rubid in seen:
            continue
        seen.add(rubid)
        main_category = False
        if raw.get("main_category") is not None:
            main_category = bool(raw.get("main_category"))
        else:
            try:
                main_category = int(raw.get("priority") or 0) > 0
            except (TypeError, ValueError):
                main_category = False
        normalized.append(
            {
                "category_id": rubid,
                "main_category": main_category,
            }
        )
    if normalized and not any(bool(x.get("main_category")) for x in normalized):
        normalized[0]["main_category"] = True
    return normalized


def extract_main_category_id(rows) -> int | None:
    normalized = normalize_jv_categories(rows)
    if not normalized:
        return None
    for item in normalized:
        if bool(item.get("main_category")):
            try:
                return int(item.get("category_id"))
            except (TypeError, ValueError):
                pass
    try:
        return int(normalized[0].get("category_id"))
    except (TypeError, ValueError):
        return None


def _fetch_category_rubnum_by_id(cur, category_ids: list[int]) -> dict[int, str]:
    if not category_ids or not table_exists(cur, "shoprubriken"):
        return {}
    placeholders = ", ".join(["%s"] * len(category_ids))
    cur.execute(
        f"SELECT rubid, rubnum FROM `shoprubriken` WHERE rubid IN ({placeholders})",
        tuple(category_ids),
    )
    rows = cur.fetchall() or []
    result: dict[int, str] = {}
    for row in rows:
        try:
            rubid_raw = row.get("rubid") if isinstance(row, dict) else row[0]
            rubnum_raw = row.get("rubnum") if isinstance(row, dict) else row[1]
            rubid = int(rubid_raw)
        except (TypeError, ValueError, IndexError):
            continue
        rubnum = str(rubnum_raw or "").strip()
        if rubnum:
            result[rubid] = rubnum
    return result


def _fetch_category_id_by_unique_rubnum(cur, rubnums: list[str]) -> dict[str, int]:
    normalized_rubnums = [str(rubnum or "").strip() for rubnum in rubnums if str(rubnum or "").strip()]
    if not normalized_rubnums or not table_exists(cur, "shoprubriken"):
        return {}
    placeholders = ", ".join(["%s"] * len(normalized_rubnums))
    cur.execute(
        f"SELECT rubid, rubnum FROM `shoprubriken` WHERE rubnum IN ({placeholders})",
        tuple(normalized_rubnums),
    )
    grouped: dict[str, list[int]] = {}
    for row in cur.fetchall() or []:
        try:
            rubid_raw = row.get("rubid") if isinstance(row, dict) else row[0]
            rubnum_raw = row.get("rubnum") if isinstance(row, dict) else row[1]
            rubid = int(rubid_raw)
        except (TypeError, ValueError, IndexError):
            continue
        rubnum = str(rubnum_raw or "").strip()
        if rubnum:
            grouped.setdefault(rubnum, []).append(rubid)
    return {rubnum: ids[0] for rubnum, ids in grouped.items() if len(ids) == 1}


def map_jv_categories_between_sources(source_db_config: dict, target_db_config: dict, categories_rows):
    normalized = normalize_jv_categories(categories_rows)
    if not normalized:
        return [], {"mapped": 0, "missing": [], "ambiguous": False}

    source_conn = None
    target_conn = None
    source_cur = None
    target_cur = None
    try:
        source_conn = mysql_connect(source_db_config)
        target_conn = mysql_connect(target_db_config)
        source_cur = source_conn.cursor(dictionary=True)
        target_cur = target_conn.cursor(dictionary=True)

        source_ids = [int(item["category_id"]) for item in normalized]
        rubnum_by_source_id = _fetch_category_rubnum_by_id(source_cur, source_ids)
        rubnums = list(rubnum_by_source_id.values())
        target_id_by_rubnum = _fetch_category_id_by_unique_rubnum(target_cur, rubnums)

        mapped = []
        missing = []
        for item in normalized:
            source_id = int(item["category_id"])
            rubnum = rubnum_by_source_id.get(source_id)
            target_id = target_id_by_rubnum.get(rubnum or "")
            if target_id is None:
                missing.append({"source_category_id": source_id, "rubnum": rubnum or ""})
                continue
            mapped.append(
                {
                    "category_id": target_id,
                    "main_category": bool(item.get("main_category")),
                }
            )

        if mapped and not any(bool(item.get("main_category")) for item in mapped):
            mapped[0]["main_category"] = True
        return mapped, {"mapped": len(mapped), "missing": missing, "ambiguous": False}
    finally:
        try:
            if source_cur is not None:
                source_cur.close()
        finally:
            try:
                if target_cur is not None:
                    target_cur.close()
            finally:
                try:
                    if source_conn is not None:
                        source_conn.close()
                finally:
                    if target_conn is not None:
                        target_conn.close()


def sync_jv_rubrikartikel(cur, artikelid: int, categories_rows):
    if artikelid <= 0:
        return
    normalized = normalize_jv_categories(categories_rows)
    # Keep exactly one main category.
    main_assigned = False
    for idx, item in enumerate(normalized):
        if item.get("main_category") and not main_assigned:
            normalized[idx]["main_category"] = True
            main_assigned = True
        else:
            normalized[idx]["main_category"] = False
    if normalized and not main_assigned:
        normalized[0]["main_category"] = True

    # Some JV installs use different relation tables/column names.
    relation_candidates = [
        ("shoprubrikartikel", "artikelid", "rubid", "priority", "ordnum", "rubnum"),
        ("shopartikelrubrik", "artikelid", "rubid", "priority", "ordnum", "rubnum"),
        ("shopartikel_rubrik", "artikelid", "rubid", "priority", "ordnum", "rubnum"),
        ("shopartikel2rubrik", "artikelid", "rubid", "priority", "ordnum", "rubnum"),
    ]

    rubids = [int(x["category_id"]) for x in normalized]
    rubnum_by_id = {}
    if rubids and table_exists(cur, "shoprubriken"):
        placeholders = ", ".join(["%s"] * len(rubids))
        cur.execute(
            f"SELECT rubid, rubnum FROM `shoprubriken` WHERE rubid IN ({placeholders})",
            tuple(rubids),
        )
        for row in cur.fetchall() or []:
            try:
                if isinstance(row, dict):
                    rid_raw = row.get("rubid")
                    rubnum_raw = row.get("rubnum")
                else:
                    rid_raw = row[0] if len(row) > 0 else None
                    rubnum_raw = row[1] if len(row) > 1 else None
                rid = int(rid_raw)
            except (TypeError, ValueError):
                continue
            rubnum_by_id[rid] = rubnum_raw

    for table_name, artikel_col, rubid_col, priority_col, ordnum_col, rubnum_col in relation_candidates:
        if not table_exists(cur, table_name):
            continue
        if not (table_has_column(cur, table_name, artikel_col) and table_has_column(cur, table_name, rubid_col)):
            continue

        has_priority = table_has_column(cur, table_name, priority_col)
        has_ordnum = table_has_column(cur, table_name, ordnum_col)
        has_rubnum = table_has_column(cur, table_name, rubnum_col)
        categories_for_table = list(normalized)
        if has_rubnum:
            categories_for_table = [
                item for item in categories_for_table
                if str(rubnum_by_id.get(int(item["category_id"])) or "").strip()
            ]
            main_in_valid = any(bool(item.get("main_category")) for item in categories_for_table)
            if categories_for_table and not main_in_valid:
                categories_for_table[0]["main_category"] = True

        cur.execute(f"DELETE FROM `{table_name}` WHERE `{artikel_col}` = %s", (artikelid,))
        if not categories_for_table:
            continue

        insert_cols = [artikel_col, rubid_col]
        if has_rubnum:
            insert_cols.append(rubnum_col)
        if has_ordnum:
            insert_cols.append(ordnum_col)
        if has_priority:
            insert_cols.append(priority_col)
        cols_sql = ", ".join(f"`{col}`" for col in insert_cols)
        vals_sql = ", ".join(["%s"] * len(insert_cols))

        for idx, item in enumerate(categories_for_table, start=1):
            rubid = int(item["category_id"])
            row_values = [artikelid, rubid]
            if has_rubnum:
                row_values.append((rubnum_by_id.get(rubid) or "").strip())
            if has_ordnum:
                row_values.append(idx)
            if has_priority:
                row_values.append(1 if bool(item.get("main_category")) else 0)
            cur.execute(
                f"INSERT INTO `{table_name}` ({cols_sql}) VALUES ({vals_sql})",
                tuple(row_values),
            )
