from .models import ImportedProduct
from .source_client import jv_site_catalog


def sites_for_family(selected_site_keys: list[str] | None = None):
    rows = [
        {
            "site": ImportedProduct.Site.JV,
            "site_key": row["site_key"],
            "domain": row["domain"],
        }
        for row in jv_site_catalog(lambda value: value)
    ]
    if not selected_site_keys:
        return rows
    normalized = {
        str(key or "").strip().upper()
        for key in selected_site_keys
        if str(key or "").strip()
    }
    return [row for row in rows if (row.get("site_key") or "").upper() in normalized]
