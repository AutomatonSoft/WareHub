from __future__ import annotations

from typing import Any
from urllib.parse import quote


OTTO_PRODUCT_URL_BASE = "https://www.otto.de/p/?moin="


def build_otto_url(moin: object) -> str | None:
    normalized_moin = str(moin or "").strip()
    if not normalized_moin:
        return None
    return f"{OTTO_PRODUCT_URL_BASE}{quote(normalized_moin, safe='')}"


def enrich_otto_product(product: dict[str, Any]) -> dict[str, Any]:
    return {**product, "ottoUrl": build_otto_url(product.get("moin"))}
