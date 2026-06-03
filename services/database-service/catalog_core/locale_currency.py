DEFAULT_LOCALE_BY_SUFFIX = {
    "de": "de",
    "ch": "de",
    "it": "it",
    "nl": "nl",
    "lv": "lv",
    "lu": "fr",
    "cz": "cs",
    "si": "sl",
    "uk": "en",
    "hu": "hu",
    "gr": "el",
    "pl": "pl",
    "be": "nl",
    "fr": "fr",
    "at": "de",
    "es": "es",
    "ie": "en",
    "fi": "fi",
    "ro": "ro",
    "pt": "pt",
    "se": "sv",
    "sk": "sk",
    "dk": "da",
}

DEFAULT_CURRENCY_BY_SUFFIX = {
    "de": "EUR",
    "ch": "CHF",
    "it": "EUR",
    "nl": "EUR",
    "lv": "EUR",
    "lu": "EUR",
    "cz": "CZK",
    "si": "EUR",
    "uk": "GBP",
    "hu": "HUF",
    "gr": "EUR",
    "pl": "PLN",
    "be": "EUR",
    "fr": "EUR",
    "at": "EUR",
    "es": "EUR",
    "ie": "EUR",
    "fi": "EUR",
    "ro": "RON",
    "pt": "EUR",
    "se": "SEK",
    "sk": "EUR",
    "dk": "DKK",
}


def suffix_from_domain(domain: str) -> str:
    if not domain:
        return ""
    chunks = str(domain).strip().lower().split(".")
    return chunks[-1] if chunks else ""


def infer_locale(*, site_key: str, domain: str, locale_by_site_key: dict, default_locale_by_site_key: dict) -> str:
    if site_key and site_key in locale_by_site_key:
        return str(locale_by_site_key[site_key]).strip().lower()
    site_key_norm = str(site_key or "").strip().upper()
    if site_key_norm and site_key_norm in default_locale_by_site_key:
        return default_locale_by_site_key[site_key_norm]
    return DEFAULT_LOCALE_BY_SUFFIX.get(suffix_from_domain(domain), "en")


def infer_currency(
    *,
    site_key: str,
    domain: str,
    source_currency: str,
    currency_by_site_key: dict,
    default_currency_by_site_key: dict,
) -> str:
    if site_key and site_key in currency_by_site_key:
        return str(currency_by_site_key[site_key]).strip().upper()
    site_key_norm = str(site_key or "").strip().upper()
    if site_key_norm and site_key_norm in default_currency_by_site_key:
        return default_currency_by_site_key[site_key_norm]
    inferred = DEFAULT_CURRENCY_BY_SUFFIX.get(suffix_from_domain(domain))
    if inferred:
        return inferred
    if source_currency:
        return source_currency.strip().upper()
    return "EUR"
