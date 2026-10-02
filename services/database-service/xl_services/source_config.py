import os
import re

from catalog_core.source_env import source_env_prefixes as _shared_source_env_prefixes

DEFAULT_XL_SITE_DOMAINS = {
    "XLMOEBEL_DE": "xlmoebel.de",
    "XLMOEBEL_CH": "xlmoebel.ch",
    "XLMOEBEL_AT": "xlmoebel.at",
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
    normalized_key = str(site_key or "XLMOEBEL_DE").strip().upper()
    if normalized_key not in DEFAULT_XL_SITE_DOMAINS:
        return
    for prefix in _shared_source_env_prefixes(namespace="XL", site=site, site_key=normalized_key):
        if normalized_key == "XLMOEBEL_DE" or normalized_key in prefix:
            yield prefix


def source_db_config_for_site(site: str, site_key: str | None = None):
    for prefix in source_env_prefixes(site, site_key):
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


def source_db_config_for_xl(*, site_key: str | None):
    return source_db_config_for_site("XL", site_key=site_key)


def normalize_locale_code(raw_value: str | None) -> str:
    value = str(raw_value or "").strip().lower()
    if not value:
        return ""
    if "-" in value:
        value = value.split("-", 1)[0]
    if "_" in value:
        value = value.split("_", 1)[0]
    value = re.sub(r"[^a-z]", "", value)
    if len(value) >= 2:
        value = value[:2]
    return LANGUAGE_LOCALE_ALIASES.get(value, value)


def xl_site_catalog():
    return [{"site_key": key, "domain": domain} for key, domain in DEFAULT_XL_SITE_DOMAINS.items()]
