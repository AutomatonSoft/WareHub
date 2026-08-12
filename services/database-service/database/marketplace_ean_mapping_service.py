from __future__ import annotations

from django.db import transaction

from .models import Ean, EanStatus, Kid


class MarketplaceEanMappingError(ValueError):
    """Raised when a successful marketplace publication cannot be linked locally."""


_MAPPING_FIELDS: dict[tuple[str, str], str] = {
    ("hood", "jv"): "hood_jv",
    ("hood", "xl"): "hood_xl",
    ("kaufland", "jv"): "kaufland_jv",
    ("kaufland", "xl"): "kaufland_xl",
    ("otto", "jv"): "otto_jv",
    ("otto", "xl"): "otto_xl",
}


def confirm_marketplace_ean_mapping(
    *,
    kid_number: str,
    marketplace: str,
    account: str,
    ean: str,
) -> dict[str, str | int | bool]:
    normalized_kid_number = str(kid_number or "").strip()
    normalized_marketplace = str(marketplace or "").strip().lower()
    normalized_account = str(account or "").strip().lower()
    normalized_ean = str(ean or "").strip()
    field_name = _MAPPING_FIELDS.get((normalized_marketplace, normalized_account))

    if not normalized_kid_number:
        raise MarketplaceEanMappingError("kid_number is required.")
    if not normalized_ean:
        raise MarketplaceEanMappingError("ean is required.")
    if field_name is None:
        raise MarketplaceEanMappingError("Unsupported marketplace/account mapping.")

    with transaction.atomic():
        kid = (
            Kid.objects.select_for_update()
            .filter(kid_number__contains=[normalized_kid_number])
            .first()
        )
        if kid is None:
            raise MarketplaceEanMappingError("Kid was not found for kid_number.")

        ean_record, _ = Ean.objects.select_for_update().get_or_create(kid=kid)
        status_record, _ = EanStatus.objects.select_for_update().get_or_create(ean=kid)
        setattr(ean_record, field_name, normalized_ean)
        setattr(status_record, field_name, True)
        ean_record.save(update_fields=[field_name])
        status_record.save(update_fields=[field_name])

    return {
        "kid_id": kid.pk,
        "kid_number": normalized_kid_number,
        "marketplace": normalized_marketplace,
        "account": normalized_account,
        "ean": normalized_ean,
        "status": True,
    }
