from __future__ import annotations

import logging

from django.db import transaction
from django.db.models import Q

from database.models import Ean, EanStatus

logger = logging.getLogger(__name__)


def record_xl_ean_marker(product) -> list[str]:
    ean = str(product.ean or "").strip()
    if product.site != "XL" or not ean:
        return []
    try:
        with transaction.atomic():
            rows = Ean.objects.select_for_update()
            matches = list(rows.filter(reserved_xl=ean).order_by("pk")[:2])
            if not matches:
                matches = list(rows.filter(Q(main_ean_xl=ean) | Q(main_ean_jv=ean) | Q(xl=ean)).order_by("pk")[:2])
            if len(matches) != 1:
                logger.warning("XL_EAN_MARKER_IDENTITY_UNRESOLVED product_id=%s site_key=%s matches=%s", product.pk, product.site_key, len(matches))
                return ["xl_ean_marker_identity_unresolved"]
            record = matches[0]
            if record.xl and record.xl != ean:
                logger.warning("XL_EAN_MARKER_MAPPING_CONFLICT product_id=%s kid_id=%s", product.pk, record.kid_id)
                return ["xl_ean_marker_mapping_conflict"]
            if record.xl != ean:
                record.xl = ean
                record.save(update_fields=["xl"])
            EanStatus.objects.update_or_create(ean_id=record.kid_id, defaults={"xl": bool(product.status)})
        return []
    except Exception:
        logger.exception("XL_EAN_MARKER_WRITE_FAILED product_id=%s site_key=%s", product.pk, product.site_key)
        return ["xl_ean_marker_write_failed"]
