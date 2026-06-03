import re

from .models import ImportedProduct


def force_xl_site(request) -> None:
    query = request.GET.copy()
    query["site"] = ImportedProduct.Site.XL
    request.GET = query


def normalize_site_key(site_key_raw: str | None) -> str | None:
    if site_key_raw in (None, ""):
        return None
    value = str(site_key_raw).strip().upper()
    value = re.sub(r"[^A-Z0-9]+", "_", value)
    value = value.strip("_")
    return value or None
