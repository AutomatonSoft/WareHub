from catalog_core.batch_shared import convert_amount as _shared_convert_amount
from catalog_core.locale_currency import infer_currency as _shared_infer_currency, infer_locale as _shared_infer_locale

from .models import ImportedProduct
from .source_client import source_db_config_for_xl, xl_site_catalog

DEFAULT_LOCALE_BY_SITE_KEY = {}
DEFAULT_CURRENCY_BY_SITE_KEY = {
    "XLMOEBEL_DE": "EUR",
}
DEFAULT_LANGUAGE_ID_BY_LOCALE = {
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
    "lv": 12,
    "da": 13,
    "sv": 14,
    "fi": 15,
    "hu": 16,
    "el": 17,
    "ro": 18,
}

_FX_MAX_RATE_CACHE = {}


def source_db_config_for_site(site: str, site_key: str | None = None):
    if str(site or "").upper() != ImportedProduct.Site.XL:
        return None
    return source_db_config_for_xl(site_key=site_key)


def sites_for_family(site_family: str, selected_site_keys: list[str] | None = None):
    if site_family != ImportedProduct.Site.XL:
        return []
    rows = [{"site": ImportedProduct.Site.XL, "site_key": row["site_key"], "domain": row["domain"]} for row in xl_site_catalog()]
    if not selected_site_keys:
        return rows
    normalized = {str(key or "").strip().upper() for key in selected_site_keys if str(key or "").strip()}
    return [row for row in rows if (row.get("site_key") or "").upper() in normalized]


def infer_locale(*, site_key: str, domain: str, locale_by_site_key: dict) -> str:
    return _shared_infer_locale(
        site_key=site_key,
        domain=domain,
        locale_by_site_key=locale_by_site_key,
        default_locale_by_site_key=DEFAULT_LOCALE_BY_SITE_KEY,
    )


def infer_currency(*, site_key: str, domain: str, source_currency: str, currency_by_site_key: dict) -> str:
    return _shared_infer_currency(
        site_key=site_key,
        domain=domain,
        source_currency=source_currency,
        currency_by_site_key=currency_by_site_key,
        default_currency_by_site_key=DEFAULT_CURRENCY_BY_SITE_KEY,
    )


def convert_amount(*, amount, from_currency: str, to_currency: str):
    return _shared_convert_amount(
        amount=amount,
        from_currency=from_currency,
        to_currency=to_currency,
        env_prefix="XL",
        cache=_FX_MAX_RATE_CACHE,
    )
