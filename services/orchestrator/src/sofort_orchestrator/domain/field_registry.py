from __future__ import annotations

from dataclasses import dataclass

from .models import Marketplace


@dataclass(frozen=True)
class MarketplaceFieldSpec:
    allowed_fields: set[str]
    required_fields: set[str]


REGISTRY: dict[Marketplace, MarketplaceFieldSpec] = {
    Marketplace.HOOD: MarketplaceFieldSpec(
        allowed_fields={
            "title", "description", "price", "quantity", "categoryID", "condition", "itemMode", "itemNumber", "images", "productProperties",
        },
        required_fields={"title", "price"},
    ),
    Marketplace.KAUFLAND: MarketplaceFieldSpec(
        allowed_fields={
            "title", "description", "picture_urls", "unit_id", "storefront", "price",
        },
        required_fields={"title", "price", "storefront"},
    ),
    Marketplace.OTTO: MarketplaceFieldSpec(
        allowed_fields={
            "productReference", "sku", "ean", "pzn", "mpn", "moin", "releaseDate", "productDescription", "mediaAssets", "order", "pricing", "logistics", "compliance",
        },
        required_fields={"productReference", "ean"},
    ),
    Marketplace.XLJV: MarketplaceFieldSpec(
        allowed_fields={
            "source_model", "source_sku", "source_ean_field", "price", "quantity", "status", "manufacturer_id", "stock_status_id", "tax_class_id", "image", "date_available", "descriptions", "categories", "stores", "images", "specials", "jv_fields",
        },
        required_fields={"source_model", "price"},
    ),
}


def validate_changed_fields(marketplace: Marketplace, changed_fields: list[str]) -> list[str]:
    if not changed_fields:
        return []
    allowed = REGISTRY[marketplace].allowed_fields
    return [field for field in changed_fields if field not in allowed]


def missing_required_fields(marketplace: Marketplace, payload: dict) -> list[str]:
    required = REGISTRY[marketplace].required_fields
    missing: list[str] = []
    for field in required:
        value = payload.get(field)
        if value is None:
            missing.append(field)
            continue
        if isinstance(value, str) and value.strip() == "":
            missing.append(field)
            continue
        if isinstance(value, list) and len(value) == 0:
            missing.append(field)
    return missing


def filtered_payload(marketplace: Marketplace, payload: dict) -> dict:
    allowed = REGISTRY[marketplace].allowed_fields
    return {k: v for k, v in payload.items() if k in allowed}
