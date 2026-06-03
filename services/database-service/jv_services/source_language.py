import re

from .source_config import JV_LANGUAGE_ID_BY_CODE, LANGUAGE_LOCALE_ALIASES
from .source_connection import mysql_connect
from .source_schema import table_exists, table_has_column


def normalize_locale_code(raw_value: str | None) -> str:
    value = str(raw_value or "").strip().lower()
    if not value:
        return ""

    # Accept code/locale forms: de, de-de, de_DE, german, etc.
    if "-" in value:
        value = value.split("-", 1)[0]
    if "_" in value:
        value = value.split("_", 1)[0]
    value = re.sub(r"[^a-z]", "", value)
    if len(value) >= 2:
        value = value[:2]
    return LANGUAGE_LOCALE_ALIASES.get(value, value)


def fetch_source_language_id_by_locale(config: dict) -> dict[str, int]:
    conn = mysql_connect(config)
    cur = conn.cursor(dictionary=True)
    try:
        prefix = config.get("table_prefix", "oc_")

        # JV source does not have oc_language. Use known JV mapping.
        if not table_exists(cur, f"{prefix}product") and table_exists(cur, "shopartikel"):
            return dict(JV_LANGUAGE_ID_BY_CODE)

        t_language = f"`{prefix}language`"
        if not table_exists(cur, f"{prefix}language"):
            return {}

        has_status = table_has_column(cur, f"{prefix}language", "status")
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
            lang_id = row.get("language_id")
            try:
                lang_id_int = int(lang_id)
            except (TypeError, ValueError):
                continue

            candidates = [
                normalize_locale_code(row.get("code")),
                normalize_locale_code(row.get("locale")),
                normalize_locale_code(row.get("name")),
            ]
            for locale in candidates:
                if locale and locale not in mapping:
                    mapping[locale] = lang_id_int
        return mapping
    finally:
        cur.close()
        conn.close()
