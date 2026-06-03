import os
import re

from catalog_core.source_env import source_env_prefixes as _shared_source_env_prefixes

DEFAULT_JV_SITE_DOMAINS = {
    "JV_DE": "jv.de",
    "JV_MAIN": "main",
    "JV_CO_UK": "jv.co.uk",
    "JV_CH": "jv.ch",
    "JV_AT": "jv.at",
}

JV_LANGUAGE_ID_BY_CODE = {
    "de": 1,
    "en": 2,
    "fr": 3,
    "it": 4,
    "es": 5,
    "pt": 6,
    "pl": 7,
    "cs": 8,
    "sk": 9,
    "sl": 10,
    "nl": 11,
}

JV_DELIVERY_LABEL_BY_UI_ID = {
    0: "Lieferzeit: 2-5 Tage",
    1: "Lieferzeit: 2 Wochen",
    2: "Lieferzeit: 4-8 Wochen",
    3: "Lieferzeit: 8-12 Wochen",
    4: "Lieferzeit: 8-14 Tage",
    5: "derzeit nicht lieferbar!",
    6: "Lieferzeit: 2-6 Wochen",
    7: "Lieferzeit: 4-8 Wochen",
    8: "Lieferzeit: 8-12 Wochen",
    9: "Lieferzeit: 6-8 Wochen",
    10: "Lieferzeit: 2-4 Wochen",
    11: "Lieferzeit: 3-6 Wochen",
    12: "Lieferzeit: 6-10 Wochen",
    13: "Lieferzeit: 10-14 Wochen",
    14: "Lieferzeit: 12-16 Wochen",
    15: "Lieferzeit: 10-12 Wochen",
}

LANGUAGE_LOCALE_ALIASES = {
    "cz": "cs",
    "dk": "da",
    "se": "sv",
    "gr": "el",
    "gb": "en",
    "uk": "en",
}


def source_env_prefixes(site: str, site_key: str | None):
    yield from _shared_source_env_prefixes(namespace="JV", site=site, site_key=site_key)


def source_db_config_for_site(site: str, site_key: str | None = None):
    normalized_site_key = str(site_key or "").strip().upper()
    if normalized_site_key in {"ALL_SITES", "ALL", "*"}:
        candidate_site_keys: list[str | None] = [None]
        candidate_site_keys.extend(DEFAULT_JV_SITE_DOMAINS.keys())
    else:
        candidate_site_keys = [site_key]

    for candidate_site_key in candidate_site_keys:
        for prefix in source_env_prefixes(site, candidate_site_key):
            host = os.getenv(prefix + "HOST", "").strip()
            user = os.getenv(prefix + "USER", "").strip()
            password = os.getenv(prefix + "PASSWORD", "").strip()
            database = os.getenv(prefix + "NAME", "").strip()
            port = int(os.getenv(prefix + "PORT", "3306"))
            table_prefix_raw = os.getenv(prefix + "PREFIX")
            table_prefix = "oc_" if table_prefix_raw is None else str(table_prefix_raw).strip()
            if not re.match(r"^[A-Za-z0-9_]*$", table_prefix):
                table_prefix = "oc_"

            if all([host, user, password, database]):
                return {
                    "host": host,
                    "user": user,
                    "password": password,
                    "database": database,
                    "port": port,
                    "table_prefix": table_prefix,
                }
    return None


def jv_site_catalog(normalize_site_key):
    raw = os.getenv("JV_SITE_KEYS", "").strip()
    if raw:
        keys = [normalize_site_key(part) for part in raw.split(",")]
        keys = [k for k in keys if k]
    else:
        keys = list(DEFAULT_JV_SITE_DOMAINS.keys())

    return [
        {"site_key": key, "domain": DEFAULT_JV_SITE_DOMAINS.get(key, key.lower())}
        for key in keys
    ]
