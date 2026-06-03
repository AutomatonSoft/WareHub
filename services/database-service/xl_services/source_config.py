import os
import re

from catalog_core.source_env import source_env_prefixes as _shared_source_env_prefixes

DEFAULT_XL_SITE_DOMAINS = {
    "XLMOEBEL_DE": "xlmoebel.de",
    "XLMOEBEL_CH": "xlmoebel.ch",
    "XLMOBILI_IT": "xlmobili.it",
    "XLMEUBILAIR_NL": "xlmeubilair.nl",
    "XLMEBELES_LV": "xlmebeles.lv",
    "XLMOEBEL_LU": "xlmoebel.lu",
    "XLNABYTEK_CZ": "xlnabytek.cz",
    "XLPOSLOVNO_SI": "xlposlovno.si",
    "XLFURNITURE_CO_UK": "xlfurniture.co.uk",
    "XLBUTOROK_HU": "xlbutorok.hu",
    "XLHOME_GR": "xlhome.gr",
    "XLMEBLE_PL": "xlmeble.pl",
    "XLMEUBELLA_BE": "xlmeubella.be",
    "XLMEUBLES_FR": "xlmeubles.fr",
    "XLMOEBEL_AT": "xlmoebel.at",
    "XLMUEBLES_ES": "xlmuebles.es",
    "XLFURNITURE_IE": "xlfurniture.ie",
    "XLHUONEKALUT_FI": "xlhuonekalut.fi",
    "XLMOBILA_RO": "xlmobila.ro",
    "XLMOBILIARIO_PT": "xlmobiliario.pt",
    "XLMOBLER_SE": "xlmobler.se",
    "XLNABYTOK_SK": "xlnabytok.sk",
    "XXLMOBLER_DK": "xxlmobler.dk",
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
    yield from _shared_source_env_prefixes(namespace="XL", site=site, site_key=site_key)


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


def xl_site_catalog(normalize_site_key):
    raw = os.getenv("XL_XL_SITE_KEYS", "").strip()
    if raw:
        keys = [normalize_site_key(part) for part in raw.split(",")]
        keys = [k for k in keys if k]
    else:
        keys = list(DEFAULT_XL_SITE_DOMAINS.keys())
    return [{"site_key": key, "domain": DEFAULT_XL_SITE_DOMAINS.get(key, key.lower())} for key in keys]
