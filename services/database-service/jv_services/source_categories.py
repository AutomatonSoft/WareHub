import json
import os
from functools import lru_cache
from pathlib import Path

from .source_schema import table_exists, table_has_column
from .source_connection import mysql_connect


DEFAULT_CATEGORY_MAPPING_OVERRIDES_PATH = Path(__file__).with_name("category_mapping_overrides.json")


_CATEGORY_TOKEN_ALIASES = {
    "ankleide zimmer begehbar": "walk in dressing room",
    "bad": "bathroom",
    "badezimmer": "bathroom",
    "badezimmer moebel": "bathroom furniture",
    "badezimmer mobel": "bathroom furniture",
    "badewannen": "bathtubs",
    "barhocker": "bar stools",
    "buero": "office furniture",
    "buro": "office furniture",
    "dekoration": "home decor",
    "duschkabinen": "shower enclosures",
    "dusche": "shower",
    "duschtassen": "shower trays",
    "eckbadewanne": "corner bathtubs",
    "figuren 100cm": "figures 100cm",
    "figuren < 100cm": "figures under 100",
    "figuren skulpturen": "figures sculptures",
    "figures & sculptures": "figures sculptures",
    "figuren unter 100": "figures under 100",
    "flur diele": "corridor hallway furniture",
    "flur bad": "corridor bathroom",
    "freistehende badewanne": "freestanding bathtubs",
    "garderoben": "corridor bathroom",
    "garnituren 1 3er": "sofa sets 1 3",
    "garnituren 2 1er": "sofa sets 2 1",
    "garnituren 3 1 1er": "sofa sets 3 1 1",
    "garnituren 3 1er": "sofa sets 3 1",
    "garnituren 3 2": "sofa sets 3 2",
    "garnituren 3 2 2er": "sofa sets 3 2 2",
    "garnituren 3 2er": "sofa sets 3 2",
    "gastronomie hotellerie": "gastronomy hotel industry furniture",
    "hotel zimmer wohnen": "hotel living room",
    "kunst echtleder": "faux genuine leather",
    "kuche und essbereich": "kitchen dining area",
    "leder pflege": "leather care products",
    "schlafzimmer": "bedroom",
    "sonderangebote": "special offer",
    "special offers": "special offer",
    "special deals discover special offers now": "special offer",
    "besondere deals jetzt sonderangebote entdecken": "special offer",
    "spiegel": "mirror",
    "trapez badewanne": "trapezoidal bathtubs",
    "tv stand coffee table": "rtv coffee table",
    "wohnzimmer": "living room",
    "wohnzimmer mobel": "living room",
    "wohnzimmer moebel": "living room",
    "livning room": "living room",
    "schlafzimmer mobel": "bedroom",
    "schlafzimmer moebel": "bedroom",
    "schlafzimmer mobel sofort": "bedroom furniture",
    "schlafzimmer moebel sofort": "bedroom furniture",
    "bedroom furniture in stock jvfurniture co uk": "bedroom furniture",
    "mobel sofort lieferbar": "furniture on stock",
    "moebel sofort lieferbar": "furniture on stock",
    "furniture on stock london": "furniture on stock",
    "komplette schlafzimmer": "complete bedrooms",
    "complete bedroom": "complete bedrooms",
    "bedroom set": "complete bedrooms",
    "betten": "beds",
    "luxusbetten in modernem und klassischem design sind ab sofort lieferbar": "beds",
    "luxury beds in modern and classic designs are available immediately": "beds",
    "nachttische": "bedside tables",
    "bedside table": "bedside tables",
    "bedside tables drawers": "bedside tables",
    "kleiderschrank": "wardrobe",
    "clothes wardrobe for the bedroom": "wardrobe",
    "konsolen": "consoles",
    "console": "consoles",
    "corridor hallway": "corridor hallway furniture",
    "art gallery paintings": "paintings",
    "gemaelde": "paintings",
    "faux genuine leather": "faux genuine leather",
    "kitchen paintings": "kitchen dining area",
    "kitchen dining area": "kitchen dining area",
    "sofa sets 1 3er": "sofa sets 1 3",
    "sofa sets 2 1er": "sofa sets 2 1",
    "sofa sets 3 1 1er": "sofa sets 3 1 1",
    "sofa sets 3 1er": "sofa sets 3 1",
    "sofa sets 3 2 2er": "sofa sets 3 2 2",
    "sofa sets 3 2er": "sofa sets 3 2",
    "rtv couchtische": "rtv coffee table",
}


def normalize_jv_categories(rows):
    normalized = []
    seen = set()
    any_explicit_main = False
    priorities: list[int | None] = []
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
        explicit_main = None
        if raw.get("main_category") is not None:
            explicit_main = _as_category_bool(raw.get("main_category"))
            any_explicit_main = True
        try:
            prio = int(raw.get("priority")) if raw.get("priority") not in (None, "") else None
        except (TypeError, ValueError):
            prio = None
        normalized.append(
            {
                "category_id": rubid,
                "main_category": bool(explicit_main),
            }
        )
        priorities.append(prio)

    if not any_explicit_main and normalized:
        # cosmoshop encodes the Hauptrubrik as the row with the SMALLEST priority
        # value (main = 0). Derive the main flag from that, not from priority > 0.
        ranked = [(p if p is not None else 0, idx) for idx, p in enumerate(priorities)]
        _, main_idx = min(ranked, key=lambda pair: (pair[0], pair[1]))
        normalized[main_idx]["main_category"] = True

    if normalized and not any(bool(x.get("main_category")) for x in normalized):
        normalized[0]["main_category"] = True
    return normalized


def _as_category_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return False
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off", "none", "null"}:
            return False
    try:
        return bool(int(value))
    except (TypeError, ValueError):
        return bool(value)


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


def _normalize_category_token(value) -> str:
    text = str(value or "").strip().lower()
    replacements = {
        "ä": "ae",
        "ö": "oe",
        "ü": "ue",
        "ß": "ss",
        "+": " ",
        "-": " ",
        "_": " ",
        "/": " ",
        "|": " ",
        ".": " ",
        ":": " ",
        ";": " ",
        ",": " ",
        "(": " ",
        ")": " ",
        "&": " ",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    normalized = " ".join(text.split())
    return _CATEGORY_TOKEN_ALIASES.get(normalized, normalized)


def _normalize_category_slug_piece(value) -> str:
    token = _normalize_category_token(value)
    if not token:
        return ""
    compact = token.replace(" ", "")
    if compact.isdigit():
        return ""
    while compact and compact[-1].isdigit():
        compact = compact[:-1]
    if not compact:
        return ""
    if compact.endswith("n") and len(compact) > 8:
        compact = compact[:-1]
    slug_aliases = {
        "6ersetbarhocker": "barstools6set",
        "8ersetbarhocker": "barstools8set",
        "4ersetbarhocker": "barstools4set",
        "barhockereinzel": "barstools",
        "barhockereinzeln": "barstools",
        "badmoebel": "bathroom",
        "badmobel": "bathroom",
        "badewanne": "bathtubs",
        "badewannen": "bathtubs",
        "buero": "office",
        "buro": "office",
        "bueroschrank": "officecabinet",
        "drehstuehle": "swivelchairs",
        "dusche": "shower",
        "duschkabinen": "showerenclosures",
        "duschtassen": "showertrays",
        "eckbadewanne": "cornerbathtubs",
        "essbereich": "diningarea",
        "essgruppen": "diningsets",
        "figuren": "figures",
        "figurenskulpturen": "figuressculptures",
        "flur": "hallway",
        "freistehendebadewanne": "freestandingbathtubs",
        "garderoben": "corridorbathroom",
        "komplettbuero": "completeoffice",
        "kueche": "kitchen",
        "kuehe": "kitchen",
        "kuecheundessbereich": "kitchendiningarea",
        "ledersofa": "leathersofas",
        "rechteckigebadewanne": "rectangularbathtubs",
        "sitzgruppen": "sofasets",
        "spiegel": "mirror",
        "stoffsofa": "fabricsofas",
        "trapezbadewanne": "trapezoidalbathtubs",
        "wasserwand": "waterwall",
        "wohnzimmer": "livingroom",
    }
    return slug_aliases.get(compact, compact)


def _category_rubnum_leaf_token(row: dict) -> str:
    rubnum = str(row.get("rubnum") or "").strip()
    if not rubnum:
        return ""
    for part in reversed(rubnum.split(".")):
        token = _normalize_category_slug_piece(part)
        if token:
            return token
    return ""


def _category_rubnum_compact_path(row: dict) -> tuple[str, ...]:
    rubnum = str(row.get("rubnum") or "").strip()
    if not rubnum:
        return ()
    raw_parts = [part for part in rubnum.split(".") if str(part or "").strip()]
    merged_parts: list[str] = []
    numeric_buffer = ""
    for part in raw_parts:
        stripped = str(part or "").strip()
        if stripped.isdigit():
            numeric_buffer += stripped
            continue
        if numeric_buffer:
            stripped = numeric_buffer + stripped
            numeric_buffer = ""
        merged_parts.append(stripped)
    tokens = []
    for part in merged_parts:
        token = _normalize_category_slug_piece(part)
        if token:
            tokens.append(token)
    return tuple(tokens)


def _category_parent_id(row: dict) -> int:
    for key in ("parentid", "parent_id"):
        try:
            return int(row.get(key) or 0)
        except (TypeError, ValueError):
            continue
    return 0


def _category_content_tokens(row: dict, key: str) -> list[str]:
    tokens: list[str] = []
    value = row.get(key)
    if isinstance(value, (list, tuple, set)):
        values = value
    else:
        values = [value]
    for item in values:
        token = _normalize_category_token(item)
        if token and token not in tokens:
            tokens.append(token)
    return tokens


def _category_signatures(row: dict, rows_by_id: dict[int, dict]) -> list[tuple[str, tuple[str, ...]]]:
    path_rows = []
    current = row
    seen = set()
    while current:
        try:
            current_id = int(current.get("rubid") or 0)
        except (TypeError, ValueError):
            break
        if current_id <= 0 or current_id in seen:
            break
        seen.add(current_id)
        path_rows.append(current)
        parent_id = _category_parent_id(current)
        if parent_id <= 0:
            break
        current = rows_by_id.get(parent_id)
    path_rows.reverse()

    signatures: list[tuple[str, tuple[str, ...]]] = []
    compact_rubnum_path = _category_rubnum_compact_path(row)
    if compact_rubnum_path:
        signatures.append(("rubnum_compact_path", compact_rubnum_path))
    for kind, keys in (
        ("content_name_path", ("__content_names__",)),
        ("content_urlkey_path", ("__content_urlkeys__",)),
        ("rubnum_path", ("rubnum",)),
        ("urlkey_path", ("ruburlkey", "urlkey")),
        ("rubnum_leaf_path", ("__rubnum_leaf__",)),
    ):
        tokens = []
        for path_row in path_rows:
            token = ""
            if keys == ("__rubnum_leaf__",):
                token = _category_rubnum_leaf_token(path_row)
                if not token:
                    continue
            elif keys == ("__content_names__",):
                content_tokens = _category_content_tokens(path_row, "content_names")
                token = content_tokens[0] if len(content_tokens) == 1 else ""
            elif keys == ("__content_urlkeys__",):
                content_tokens = _category_content_tokens(path_row, "content_urlkeys")
                token = content_tokens[0] if len(content_tokens) == 1 else ""
            else:
                for key in keys:
                    token = _normalize_category_token(path_row.get(key))
                    if token:
                        break
            if not token:
                tokens = []
                break
            tokens.append(token)
        if tokens:
            signatures.append((kind, tuple(tokens)))
            if kind == "content_name_path" and len(tokens) >= 3 and tokens[0] == "furniture on stock":
                signatures.append(("content_name_stock_leaf_path", (tokens[0], tokens[-1])))
    return signatures


def _fetch_category_rows(cur) -> dict[int, dict]:
    if not table_exists(cur, "shoprubriken"):
        return {}
    columns = ["rubid"]
    for candidate in ("parentid", "parent_id", "rubnum", "rub_parent", "ruburlkey", "urlkey"):
        if table_has_column(cur, "shoprubriken", candidate):
            columns.append(candidate)
    cols_sql = ", ".join(f"`{col}`" for col in columns)
    cur.execute(f"SELECT {cols_sql} FROM `shoprubriken`")
    rows_by_id = {}
    for row in cur.fetchall() or []:
        try:
            rubid = int(row.get("rubid") if isinstance(row, dict) else row[0])
        except (TypeError, ValueError):
            continue
        if isinstance(row, dict):
            rows_by_id[rubid] = row
    if rows_by_id and table_exists(cur, "shoprubrikencontent"):
        cur.execute(
            """
            SELECT r.rubid, c.rubnam, c.urlkey
            FROM shoprubriken r
            JOIN shoprubrikencontent c
              ON (c.rubid = r.rubid OR c.rubnumref = r.rubnum)
            """
        )
        for content_row in cur.fetchall() or []:
            try:
                rubid = int(content_row.get("rubid"))
            except (TypeError, ValueError, AttributeError):
                continue
            row = rows_by_id.get(rubid)
            if row is None:
                continue
            for source_key, target_key in (("rubnam", "content_names"), ("urlkey", "content_urlkeys")):
                token = str(content_row.get(source_key) or "").strip()
                if not token:
                    continue
                values = row.setdefault(target_key, [])
                if token not in values:
                    values.append(token)
    return rows_by_id


def _build_unique_category_signature_map(rows_by_id: dict[int, dict]) -> dict[tuple[str, tuple[str, ...]], int]:
    grouped: dict[tuple[str, tuple[str, ...]], list[int]] = {}
    for rubid, row in rows_by_id.items():
        for signature in _category_signatures(row, rows_by_id):
            grouped.setdefault(signature, []).append(rubid)
    return {signature: ids[0] for signature, ids in grouped.items() if len(ids) == 1}


@lru_cache(maxsize=4)
def _load_category_mapping_overrides(path_raw: str) -> dict:
    path = Path(path_raw) if path_raw else DEFAULT_CATEGORY_MAPPING_OVERRIDES_PATH
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _category_override_target_id(*, source_site_key: str | None, target_site_key: str | None, source_category_id: int) -> int | None:
    source_key = str(source_site_key or "").strip().upper()
    target_key = str(target_site_key or "").strip().upper()
    if not source_key or not target_key:
        return None
    override_path = os.getenv("JV_CATEGORY_MAPPING_OVERRIDES_PATH", "").strip()
    payload = _load_category_mapping_overrides(override_path)
    raw_value = (
        payload.get(source_key, {})
        if isinstance(payload.get(source_key, {}), dict)
        else {}
    ).get(target_key, {})
    if not isinstance(raw_value, dict):
        return None
    target_id_raw = raw_value.get(str(source_category_id))
    try:
        target_id = int(target_id_raw)
    except (TypeError, ValueError):
        return None
    return target_id if target_id > 0 else None


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


def map_jv_categories_between_sources(
    source_db_config: dict,
    target_db_config: dict,
    categories_rows,
    *,
    source_site_key: str | None = None,
    target_site_key: str | None = None,
):
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
        source_rows_by_id = _fetch_category_rows(source_cur)
        target_rows_by_id = _fetch_category_rows(target_cur)
        target_id_by_signature = _build_unique_category_signature_map(target_rows_by_id)
        rubnum_by_source_id = _fetch_category_rubnum_by_id(source_cur, source_ids)

        mapped = []
        missing = []
        mapped_source_main = False
        override_count = 0
        for item in normalized:
            source_id = int(item["category_id"])
            source_row = source_rows_by_id.get(source_id)
            target_id = _category_override_target_id(
                source_site_key=source_site_key,
                target_site_key=target_site_key,
                source_category_id=source_id,
            )
            if target_id is not None and target_id not in target_rows_by_id:
                target_id = None
            matched_by = "override" if target_id is not None else ""
            if target_id is not None:
                override_count += 1
            if source_row is not None:
                if target_id is None:
                    for signature in _category_signatures(source_row, source_rows_by_id):
                        target_id = target_id_by_signature.get(signature)
                        if target_id is not None:
                            matched_by = signature[0]
                            break
            rubnum = rubnum_by_source_id.get(source_id)
            if target_id is None:
                missing.append({"source_category_id": source_id, "rubnum": rubnum or ""})
                continue
            is_main = _as_category_bool(item.get("main_category"))
            if is_main:
                mapped_source_main = True
            mapped.append(
                {
                    "category_id": target_id,
                    "main_category": is_main,
                    "matched_by": matched_by,
                }
            )

        clean_mapped = [
            {
                "category_id": item["category_id"],
                "main_category": _as_category_bool(item.get("main_category")),
            }
            for item in mapped
        ]
        return clean_mapped, {
            "mapped": len(clean_mapped),
            "missing": missing,
            "main_mapped": mapped_source_main,
            "override_count": override_count,
            "matched_by": [item.get("matched_by") for item in mapped],
        }
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
        if _as_category_bool(item.get("main_category")) and not main_assigned:
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
            main_in_valid = any(_as_category_bool(item.get("main_category")) for item in categories_for_table)
            if categories_for_table and not main_in_valid:
                categories_for_table[0]["main_category"] = True

        # cosmoshop renders the Hauptrubrik as the row with the SMALLEST priority
        # value (main = 0, the rest 1, 2, 3 ...). Put the main rubric first so it
        # gets priority 0 below; everything else keeps its relative order.
        categories_for_table.sort(key=lambda item: 0 if _as_category_bool(item.get("main_category")) else 1)

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
                # main (sorted first) -> priority 0; others -> 1, 2, 3 ...
                row_values.append(idx - 1)
            cur.execute(
                f"INSERT INTO `{table_name}` ({cols_sql}) VALUES ({vals_sql})",
                tuple(row_values),
            )
