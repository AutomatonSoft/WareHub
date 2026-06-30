from rest_framework import status
from rest_framework.response import Response

from .models import ImportedProduct
from .view_helpers import next_temp_source_product_id, take_free_ean_from_pool


def prepare_create_identity(*, site: str, site_key: str, payload: dict, actor: str):
    ean = str(payload.get("ean") or "").strip()
    if not ean:
        ean, pool_error = take_free_ean_from_pool(site=site, site_key=site_key, actor=actor)
        if pool_error:
            return None, None, None, Response(
                {
                    "code": pool_error,
                    "detail": "Свободные EAN в пуле закончились.",
                },
                status=status.HTTP_409_CONFLICT,
            )

    provided_source_product_id = payload.get("source_product_id")
    temporary_source_product_id = provided_source_product_id is None
    source_product_id = (
        next_temp_source_product_id(site, site_key)
        if temporary_source_product_id
        else int(provided_source_product_id)
    )

    # Product identity is the article number (artikelnr / source_model), not the EAN:
    # a single EAN can carry many products (a main item + several Sofort colour variants),
    # each with its own artikelnr. So a create only conflicts when the SAME artikelnr already
    # exists; a new artikelnr on an existing EAN is a new product. When no artikelnr is given
    # (legacy/XL), fall back to the previous EAN-based conflict for safety.
    artikelnr = str(payload.get("source_model") or "").strip()
    if artikelnr:
        artikelnr_conflict = ImportedProduct.all_objects.filter(
            site=site, site_key=site_key, source_model=artikelnr
        ).first()
        if artikelnr_conflict:
            return None, None, None, Response(
                {
                    "code": "jv_create_artikelnr_conflict",
                    "detail": "Товар с таким ARTIKELNR уже существует для выбранного site/site_key.",
                    "local_id": artikelnr_conflict.id,
                },
                status=status.HTTP_409_CONFLICT,
            )
    else:
        ean_conflict = ImportedProduct.all_objects.filter(site=site, site_key=site_key, ean=ean).first()
        if ean_conflict:
            return None, None, None, Response(
                {
                    "code": "jv_create_ean_conflict",
                    "detail": "Товар с таким EAN уже существует для выбранного site/site_key.",
                    "local_id": ean_conflict.id,
                },
                status=status.HTTP_409_CONFLICT,
            )

    source_id_conflict = ImportedProduct.all_objects.filter(
        site=site,
        site_key=site_key,
        source_product_id=source_product_id,
    ).first()
    if source_id_conflict:
        return None, None, None, Response(
            {
                "code": "jv_create_source_product_id_conflict",
                "detail": "source_product_id уже занят для выбранного site/site_key.",
                "local_id": source_id_conflict.id,
            },
            status=status.HTTP_409_CONFLICT,
        )

    return ean, source_product_id, temporary_source_product_id, None
