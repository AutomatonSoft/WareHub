import logging
import re

import requests
from django.db import IntegrityError, transaction
from rest_framework import status

from catalog_core.models import ImportedProduct
from database.models import EanStatus, Kid
from hood_service.core import (
    HOOD_API_BASE_URL,
    HOOD_API_TIMEOUT,
    build_create_urls,
    build_delete_by_item_number_urls,
    build_patch_urls,
    get_status_meta,
    hood_auth,
    set_external_push_status,
    upsert_response_and_items,
)
from hood_service.snapshot_store import (
    get_hood_product_snapshot_payload,
    mark_hood_product_snapshot_restored,
    save_hood_product_snapshot,
)
from jv_services.batch_defaults import FIXED_JV_BATCH_SITE_KEYS
from jv_services.source_client import (
    fetch_source_product_snapshot_by_artikelnr,
    fetch_source_product_snapshot_by_ean,
    push_product_to_source,
    source_db_config_for_site,
)
from jv_services.sync_utils import (
    effective_ean_from_source,
    resolve_local_product_for_source,
    sync_children_from_snapshot,
)
from jv_services.view_helpers import to_date_or_none, to_datetime_or_none
from jv_services.views_push_state import mark_push_failed, mark_push_pending, mark_push_pushed
from jv_services.views_write_products import create_local_product_from_source, update_local_product_from_source
from kaufland.external_requests import set_product_active_state
from otto_service.external_requests import OttoExternalAPIError, OttoExternalProductsClient
from xl_services.models import ImportedProduct as XLImportedProduct
from xl_services.source_client import (
    fetch_xl_product_brief_by_ean,
    fetch_xl_product_snapshot_by_ean,
    push_xl_product_to_source,
    source_db_config_for_xl,
)
from xl_services.sync_utils import (
    effective_xl_ean_from_source,
    resolve_xl_local_product_for_source,
    sync_xl_children_from_snapshot,
)

logger = logging.getLogger(__name__)

SUPPORTED_HOOD_SITE_KEYS = {"HOOD_JV", "HOOD_XL"}
HOOD_RESTORE_PAYLOAD_FIELDS = (
    "description",
    "title",
    "price",
    "quantity",
    "categoryID",
    "condition",
    "itemMode",
    "itemNumber",
    "images",
    "productProperties",
)
JV_SOFORT_ARTIKELNR_PREFIX = "JVM"
DEACTIVATE_TARGET_ORDER = (
    "jv",
    "xl",
    "otto_jv",
    "otto_xl",
    "kaufland_jv",
    "kaufland_xl",
    "hood_jv",
    "hood_xl",
    "ebay_jv",
    "ebay_xl",
    "temu",
)


def _normalize_target_site_key(value: str) -> str:
    return str(value or "").strip().upper()


def _resolve_target(site_key: str) -> dict | None:
    normalized = _normalize_target_site_key(site_key)
    if normalized in FIXED_JV_BATCH_SITE_KEYS:
        return {"channel": "JV", "site": "JV", "site_key": normalized}
    if normalized in SUPPORTED_HOOD_SITE_KEYS:
        account = "jv" if normalized.endswith("_JV") else "xl"
        return {"channel": "HOOD", "account": account, "site_key": normalized}
    if normalized.startswith("XL"):
        return {"channel": "XL", "site": "XL", "site_key": normalized}
    return None


def _primary_kid_number_value(kid: Kid) -> str:
    value = kid.kid_number
    if isinstance(value, list) and value:
        return str(value[-1] or "").strip()
    return str(value or "").strip()


def _find_kid_by_number(kid_number: str) -> Kid | None:
    normalized = str(kid_number or "").strip()
    if not normalized:
        return None
    return Kid.objects.filter(kid_number__contains=[normalized]).order_by("id").first()


def _normalized_kid_place_value(value) -> str:
    if isinstance(value, list):
        if not value:
            return ""
        return str(value[-1] or "").strip()
    return str(value or "").strip()


def _resolve_marketplace_place_target(*, kid: Kid, inactive: bool, place: str | None) -> str | None:
    if inactive:
        current_place = _normalized_kid_place_value(kid.place)
        if not re.fullmatch(r"-?\d+", current_place):
            return None
        return f"-{abs(int(current_place))}"

    normalized_place = str(place or "").strip()
    if not normalized_place:
        raise ValueError("place is required to activate marketplace item.")
    return normalized_place


def _update_kid_place_after_marketplace_toggle(*, kid: Kid, inactive: bool, place: str | None) -> None:
    next_place = _resolve_marketplace_place_target(kid=kid, inactive=inactive, place=place)
    if next_place is None:
        return
    if kid.place == next_place:
        return
    kid.place = next_place
    kid.save(update_fields=["place"])


def _response_payload_from_error(response) -> dict:
    payload = getattr(response, "data", None)
    if isinstance(payload, dict):
        return payload
    return {"detail": str(payload)}


def _is_truthy_sofort(value) -> bool:
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return False
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "on"}


def _resolve_kid_marketplace_targets(kid: Kid) -> tuple[list[dict], list[dict]]:
    ean_row = getattr(kid, "ean", None)
    status_row = getattr(kid, "status", None)
    if ean_row is None:
        return [], [
            {
                "ok": False,
                "site_key": "",
                "channel": "LOCAL",
                "status_code": status.HTTP_409_CONFLICT,
                "details": {
                    "code": "marketplace_deactivate_kid_mapping_missing",
                    "detail": "У Kid отсутствует связанный Ean или EanStatus.",
                },
            }
        ]

    targets: list[dict] = []
    issues: list[dict] = []

    for field_name in DEACTIVATE_TARGET_ORDER:
        ean_value = str(getattr(ean_row, field_name, "") or "").strip()
        status_active = bool(getattr(status_row, field_name, False)) if status_row is not None else False
        if not status_active and not ean_value:
            continue
        if not ean_value:
            issues.append(
                {
                    "ok": False,
                    "site_key": field_name.upper(),
                    "channel": "LOCAL",
                    "status_code": status.HTTP_409_CONFLICT,
                    "details": {
                        "code": "marketplace_deactivate_ean_missing",
                        "detail": f"Поле Ean.{field_name} пустое при активном EanStatus.{field_name}.",
                        "field": field_name,
                    },
                }
            )
            continue

        if field_name == "jv":
            for site_key in FIXED_JV_BATCH_SITE_KEYS:
                targets.append(
                    {
                        "source_field": field_name,
                        "channel": "JV",
                        "site_key": site_key,
                        "ean": ean_value,
                    }
                )
            continue

        if field_name == "xl":
            targets.extend(_discover_xl_targets(source_field=field_name, ean=ean_value))
            continue

        if field_name == "hood_jv":
            targets.append(
                {
                    "source_field": field_name,
                    "channel": "HOOD",
                    "site_key": "HOOD_JV",
                    "account": "jv",
                    "ean": ean_value,
                }
            )
            continue

        if field_name == "hood_xl":
            targets.append(
                {
                    "source_field": field_name,
                    "channel": "HOOD",
                    "site_key": "HOOD_XL",
                    "account": "xl",
                    "ean": ean_value,
                }
            )
            continue

        channel = {
            "otto_jv": "OTTO",
            "otto_xl": "OTTO",
            "kaufland_jv": "KAUFLAND",
            "kaufland_xl": "KAUFLAND",
            "ebay_jv": "EBAY",
            "ebay_xl": "EBAY",
            "temu": "TEMU",
        }.get(field_name, "UNKNOWN")
        targets.append(
            {
                "source_field": field_name,
                "channel": channel,
                "site_key": field_name.upper(),
                "ean": ean_value,
                "unsupported": True,
            }
        )

    return targets, issues


def _discover_xl_targets(*, source_field: str, ean: str) -> list[dict]:
    targets: list[dict] = []
    normalized_ean = str(ean or "").strip()
    if not normalized_ean:
        return targets

    for site_key in (
        "XLMOEBEL_DE",
        "XLMOEBEL_CH",
        "XLMOBILI_IT",
        "XLMEUBILAIR_NL",
        "XLMEBELES_LV",
        "XLMOEBEL_LU",
        "XLNABYTEK_CZ",
        "XLPOSLOVNO_SI",
        "XLFURNITURE_CO_UK",
        "XLBUTOROK_HU",
        "XLHOME_GR",
        "XLMEBLE_PL",
        "XLMEUBELLA_BE",
        "XLMEUBLES_FR",
        "XLMOEBEL_AT",
        "XLMUEBLES_ES",
        "XLFURNITURE_IE",
        "XLHUONEKALUT_FI",
        "XLMOBILA_RO",
        "XLMOBILIARIO_PT",
        "XLMOBLER_SE",
        "XLNABYTOK_SK",
        "XXLMOBLER_DK",
    ):
        db_config = source_db_config_for_xl(site_key=site_key)
        if not db_config:
            continue
        try:
            row = fetch_xl_product_brief_by_ean(db_config, normalized_ean)
        except Exception:
            logger.warning(
                "MARKETPLACE_DEACTIVATE_XL_SITE_DISCOVERY_FAILED site_key=%s ean=%s",
                site_key,
                normalized_ean,
                exc_info=True,
            )
            continue
        if not row:
            continue
        targets.append(
            {
                "source_field": source_field,
                "channel": "XL",
                "site_key": site_key,
                "ean": normalized_ean,
            }
        )
    return targets


def _ensure_local_jv_product_from_source(*, ean: str, site_key: str, actor: str):
    db_config = source_db_config_for_site("JV", site_key=site_key)
    if not db_config:
        return None, None, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
            "details": {
                "code": "jv_source_db_not_configured",
                "detail": (
                    f"Не настроены credentials source DB для site=JV, site_key={site_key}. "
                    "Ожидаются env: JV_SOURCE_<SITE>[_<SITE_KEY>]_DB_HOST/USER/PASSWORD/NAME[/PORT]."
                ),
            },
        }

    try:
        snapshot = fetch_source_product_snapshot_by_ean(db_config, ean.strip())
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "MARKETPLACE_DEACTIVATE_JV_SOURCE_FETCH_FAILED ean=%s site_key=%s",
            ean,
            site_key,
        )
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "jv_source_fetch_failed",
                "detail": "Failed to read product from source DB.",
                "error": str(exc),
            },
        }

    if not snapshot:
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_404_NOT_FOUND,
            "details": {
                "code": "jv_source_product_not_found",
                "detail": f"Товар не найден в source DB по указанному ean (site=JV, site_key={site_key}).",
            },
        }

    source_product = snapshot["product"]
    effective_ean = effective_ean_from_source(source_product, fallback=ean.strip())
    safe_date_available = to_date_or_none(source_product.get("date_available"))
    safe_date_modified = to_datetime_or_none(source_product.get("date_modified"))
    normalized_site_key = site_key or ""
    existing, conflict_product = resolve_local_product_for_source(
        site="JV",
        site_key=normalized_site_key,
        source_product_id=source_product["product_id"],
        effective_ean=effective_ean,
        source_model=(source_product.get("model") or "").strip(),
    )
    if conflict_product is not None:
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_409_CONFLICT,
            "details": {
                "code": "jv_local_product_conflict",
                "detail": (
                    "Локальная запись конфликтует с товаром source: одинаковый EAN, "
                    "но другой source product_id. Синхронизация остановлена."
                ),
                "local_id": conflict_product.id,
                "local_source_product_id": conflict_product.source_product_id,
                "source_product_id": source_product["product_id"],
            },
        }

    try:
        if existing is None:
            product = create_local_product_from_source(
                site="JV",
                site_key=normalized_site_key,
                source_product=source_product,
                effective_ean=effective_ean,
                safe_date_available=safe_date_available,
                safe_date_modified=safe_date_modified,
                actor=actor,
            )
        else:
            product = update_local_product_from_source(
                product=existing,
                source_product=source_product,
                safe_date_available=safe_date_available,
                safe_date_modified=safe_date_modified,
                actor=actor,
            )
    except IntegrityError as exc:
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_409_CONFLICT,
            "details": {
                "code": "jv_local_upsert_conflict",
                "detail": "Local product upsert failed due to uniqueness conflict.",
                "error": str(exc),
            },
        }

    try:
        sync_children_from_snapshot(product, snapshot)
    except IntegrityError as exc:
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_400_BAD_REQUEST,
            "details": {
                "code": "jv_sync_child_conflict",
                "detail": "Sync failed due to conflicting child records.",
                "error": str(exc),
            },
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "MARKETPLACE_DEACTIVATE_JV_SYNC_CHILDREN_FAILED ean=%s site_key=%s",
            ean,
            site_key,
        )
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_400_BAD_REQUEST,
            "details": {
                "code": "jv_sync_children_failed",
                "detail": "Sync failed while processing source child data.",
                "error": str(exc),
            },
        }

    return product, db_config, None


def _ensure_local_jv_product_from_snapshot(*, snapshot: dict, fallback_ean: str, site_key: str, actor: str):
    source_product = snapshot["product"]
    effective_ean = effective_ean_from_source(source_product, fallback=fallback_ean.strip())
    safe_date_available = to_date_or_none(source_product.get("date_available"))
    safe_date_modified = to_datetime_or_none(source_product.get("date_modified"))
    normalized_site_key = site_key or ""
    existing, conflict_product = resolve_local_product_for_source(
        site="JV",
        site_key=normalized_site_key,
        source_product_id=source_product["product_id"],
        effective_ean=effective_ean,
        source_model=(source_product.get("model") or "").strip(),
    )
    if conflict_product is not None:
        return None, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_409_CONFLICT,
            "details": {
                "code": "jv_local_product_conflict",
                "detail": (
                    "Локальная запись конфликтует с товаром source: одинаковый EAN, "
                    "но другой source product_id. Синхронизация остановлена."
                ),
                "local_id": conflict_product.id,
                "local_source_product_id": conflict_product.source_product_id,
                "source_product_id": source_product["product_id"],
            },
        }

    try:
        if existing is None:
            product = create_local_product_from_source(
                site="JV",
                site_key=normalized_site_key,
                source_product=source_product,
                effective_ean=effective_ean,
                safe_date_available=safe_date_available,
                safe_date_modified=safe_date_modified,
                actor=actor,
            )
        else:
            product = update_local_product_from_source(
                product=existing,
                source_product=source_product,
                safe_date_available=safe_date_available,
                safe_date_modified=safe_date_modified,
                actor=actor,
            )
    except IntegrityError as exc:
        return None, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_409_CONFLICT,
            "details": {
                "code": "jv_local_upsert_conflict",
                "detail": "Local product upsert failed due to uniqueness conflict.",
                "error": str(exc),
            },
        }

    try:
        sync_children_from_snapshot(product, snapshot)
    except IntegrityError as exc:
        return None, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_400_BAD_REQUEST,
            "details": {
                "code": "jv_sync_child_conflict",
                "detail": "Sync failed due to conflicting child records.",
                "error": str(exc),
            },
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "MARKETPLACE_DEACTIVATE_JV_SYNC_CHILDREN_FAILED fallback_ean=%s site_key=%s",
            fallback_ean,
            site_key,
        )
        return None, {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_400_BAD_REQUEST,
            "details": {
                "code": "jv_sync_children_failed",
                "detail": "Sync failed while processing source child data.",
                "error": str(exc),
            },
        }

    return product, None


def _apply_jv_deactivate(*, ean: str, site_key: str, inactive: bool, actor: str) -> dict:
    product, db_config, source_first_error = _ensure_local_jv_product_from_source(
        ean=ean,
        site_key=site_key,
        actor=actor,
    )
    if source_first_error is not None:
        return source_first_error

    desired_status = not bool(inactive)
    product.status = desired_status
    product.is_modified_locally = True
    product.update_user = actor
    product.save(update_fields=["status", "is_modified_locally", "update_user", "updated_at"])
    mark_push_pending(product)

    try:
        push_product_to_source(
            db_config,
            product,
            changed_scalar_fields={"status"},
            changed_relations=set(),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "MARKETPLACE_DEACTIVATE_JV_PUSH_FAILED ean=%s site_key=%s",
            ean,
            site_key,
        )
        mark_push_failed(product, str(exc))
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "jv_source_push_failed",
                "detail": "JV deactivate saved locally but failed to push to source site.",
                "error": str(exc),
            },
        }

    mark_push_pushed(product)
    return {
        "ok": True,
        "site_key": site_key,
        "channel": "JV",
        "status_code": status.HTTP_200_OK,
        "details": {
            "ean": ean,
            "site": "JV",
            "site_key": site_key,
            "inactive": bool(inactive),
            "status": desired_status,
            "source_product_id": product.source_product_id,
        },
    }


def _apply_jv_sofort_deactivate(*, ean: str, site_key: str, inactive: bool, actor: str) -> dict:
    db_config = source_db_config_for_site("JV", site_key=site_key)
    if not db_config:
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
            "details": {
                "code": "jv_source_db_not_configured",
                "detail": (
                    f"Не настроены credentials source DB для site=JV, site_key={site_key}. "
                    "Ожидаются env: JV_SOURCE_<SITE>[_<SITE_KEY>]_DB_HOST/USER/PASSWORD/NAME[/PORT]."
                ),
            },
        }

    candidates = [f"{JV_SOFORT_ARTIKELNR_PREFIX}{ean.strip()}", ean.strip()]
    matched_candidate = None
    matched_snapshot = None

    def _mark_local_inactive_if_present() -> ImportedProduct | None:
        product = ImportedProduct.all_objects.filter(site="JV", site_key=site_key, ean=ean.strip()).first()
        if product is None:
            return None
        desired_status = not bool(inactive)
        product.status = desired_status
        product.is_modified_locally = True
        product.update_user = actor
        product.save(update_fields=["status", "is_modified_locally", "update_user", "updated_at"])
        mark_push_pushed(product)
        return product

    for index, artikelnr_candidate in enumerate(candidates):
        try:
            snapshot = fetch_source_product_snapshot_by_artikelnr(db_config, artikelnr_candidate)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "MARKETPLACE_DEACTIVATE_JV_SOFORT_SOURCE_FETCH_FAILED artikelnr=%s site_key=%s",
                artikelnr_candidate,
                site_key,
            )
            return {
                "ok": False,
                "site_key": site_key,
                "channel": "JV",
                "status_code": status.HTTP_502_BAD_GATEWAY,
                "details": {
                    "code": "jv_source_fetch_failed",
                    "detail": "Failed to read product from source DB by Artikel-Nr.",
                    "error": str(exc),
                    "artikelnr": artikelnr_candidate,
                },
            }

        if not snapshot:
            continue

        matched_candidate = artikelnr_candidate
        matched_snapshot = snapshot
        if not _is_truthy_sofort((snapshot.get("jv_fields") or {}).get("is_sofort")):
            product, upsert_error = _ensure_local_jv_product_from_snapshot(
                snapshot=matched_snapshot,
                fallback_ean=ean,
                site_key=site_key,
                actor=actor,
            )
            if upsert_error is not None:
                return upsert_error

            desired_status = not bool(inactive)
            product.status = desired_status
            product.is_modified_locally = True
            product.update_user = actor
            product.save(update_fields=["status", "is_modified_locally", "update_user", "updated_at"])
            mark_push_pushed(product)
            return {
                "ok": True,
                "site_key": site_key,
                "channel": "JV",
                "status_code": status.HTTP_200_OK,
                "details": {
                    "code": "jv_sofort_already_inactive",
                    "detail": "Товар найден по Artikel-Nr, но флаг is_sofort не установлен. Считаем сайт уже деактивированным.",
                    "artikelnr": artikelnr_candidate,
                    "ean": ean,
                    "inactive": bool(inactive),
                    "status": desired_status,
                    "source_product_id": product.source_product_id,
                    "is_sofort": False,
                },
            }
        break

    if not matched_snapshot:
        local_product = _mark_local_inactive_if_present()
        return {
            "ok": True,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_200_OK,
            "details": {
                "code": "jv_artikelnr_missing_treated_inactive",
                "detail": "Товар не найден в source DB по Artikel-Nr. Считаем сайт деактивированным.",
                "ean": ean,
                "attempted_artikelnr": candidates,
                "inactive": bool(inactive),
                "status": not bool(inactive),
                "local_product_id": local_product.id if local_product is not None else None,
                "source_product_id": local_product.source_product_id if local_product is not None else None,
            },
        }

    product, upsert_error = _ensure_local_jv_product_from_snapshot(
        snapshot=matched_snapshot,
        fallback_ean=ean,
        site_key=site_key,
        actor=actor,
    )
    if upsert_error is not None:
        return upsert_error

    desired_status = not bool(inactive)
    product.status = desired_status
    product.is_modified_locally = True
    product.update_user = actor
    product.save(update_fields=["status", "is_modified_locally", "update_user", "updated_at"])
    mark_push_pending(product)

    try:
        push_product_to_source(
            db_config,
            product,
            changed_scalar_fields={"status"},
            changed_relations=set(),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "MARKETPLACE_DEACTIVATE_JV_SOFORT_PUSH_FAILED ean=%s site_key=%s artikelnr=%s",
            ean,
            site_key,
            matched_candidate,
        )
        mark_push_failed(product, str(exc))
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "JV",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "jv_source_push_failed",
                "detail": "JV sofort deactivate saved locally but failed to push to source site.",
                "error": str(exc),
                "artikelnr": matched_candidate,
            },
        }

    mark_push_pushed(product)
    return {
        "ok": True,
        "site_key": site_key,
        "channel": "JV",
        "status_code": status.HTTP_200_OK,
        "details": {
            "ean": ean,
            "artikelnr": matched_candidate,
            "site": "JV",
            "site_key": site_key,
            "inactive": bool(inactive),
            "status": desired_status,
            "source_product_id": product.source_product_id,
            "is_sofort": True,
        },
    }


def _ensure_local_xl_product_from_source(*, ean: str, site_key: str, actor: str):
    db_config = source_db_config_for_xl(site_key=site_key)
    if not db_config:
        return None, None, {
            "ok": False,
            "site_key": site_key,
            "channel": "XL",
            "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
            "details": {
                "code": "xl_source_db_not_configured",
                "detail": "Не настроены credentials source DB для XL.",
            },
        }

    product = XLImportedProduct.objects.filter(site="XL", site_key=site_key, ean=ean.strip()).first()
    if product is not None:
        return product, db_config, None

    try:
        snapshot = fetch_xl_product_snapshot_by_ean(db_config, ean.strip())
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "MARKETPLACE_DEACTIVATE_XL_SOURCE_FETCH_FAILED ean=%s site_key=%s",
            ean,
            site_key,
        )
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "XL",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "xl_source_fetch_failed",
                "detail": "Failed to read product from XL source DB.",
                "error": str(exc),
            },
        }

    if not snapshot:
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "XL",
            "status_code": status.HTTP_404_NOT_FOUND,
            "details": {
                "code": "xl_source_product_not_found",
                "detail": "Товар не найден в XL source DB по указанному ean.",
            },
        }

    source_product = snapshot["product"]
    effective_ean = effective_xl_ean_from_source(source_product, fallback=ean.strip())
    safe_date_available = to_date_or_none(source_product.get("date_available"))
    safe_date_modified = to_datetime_or_none(source_product.get("date_modified"))
    existing, conflict_product = resolve_xl_local_product_for_source(
        site="XL",
        site_key=site_key,
        source_product_id=source_product["product_id"],
        effective_ean=effective_ean,
    )
    if conflict_product is not None:
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "XL",
            "status_code": status.HTTP_409_CONFLICT,
            "details": {
                "code": "xl_local_product_conflict",
                "detail": (
                    "Локальная запись конфликтует с товаром source: одинаковый EAN, "
                    "но другой source product_id."
                ),
                "local_id": conflict_product.id,
                "local_source_product_id": conflict_product.source_product_id,
                "source_product_id": source_product["product_id"],
            },
        }

    try:
        if existing is None:
            product = XLImportedProduct.objects.create(
                site="XL",
                site_key=site_key,
                source_product_id=source_product["product_id"],
                ean=effective_ean,
                source_model=(source_product.get("model") or "").strip(),
                source_sku=(source_product.get("sku") or "").strip(),
                source_ean_field=(source_product.get("ean") or "").strip(),
                price=source_product.get("price"),
                quantity=source_product.get("quantity"),
                status=bool(source_product.get("status", 0)),
                manufacturer_id=source_product.get("manufacturer_id"),
                stock_status_id=source_product.get("stock_status_id"),
                tax_class_id=source_product.get("tax_class_id"),
                shipping=bool(source_product.get("shipping", 1)),
                subtract=bool(source_product.get("subtract", 1)),
                minimum=source_product.get("minimum"),
                points=source_product.get("points"),
                sort_order=source_product.get("sort_order"),
                seo_url=str((snapshot or {}).get("seo_url") or "").strip(),
                image=(source_product.get("image") or "").strip(),
                date_available=safe_date_available,
                date_modified_in_source=safe_date_modified,
                is_modified_locally=False,
                is_pushed_to_source=False,
                local_save_status=XLImportedProduct.LocalSaveStatus.SAVED,
                source_push_status=XLImportedProduct.SourcePushStatus.PENDING,
                source_push_error="",
                user_create=str(actor),
                update_user="",
            )
        else:
            product = existing
            XLImportedProduct.all_objects.filter(pk=product.pk).update(
                source_model=(source_product.get("model") or "").strip(),
                source_sku=(source_product.get("sku") or "").strip(),
                source_ean_field=(source_product.get("ean") or "").strip(),
                price=source_product.get("price"),
                quantity=source_product.get("quantity"),
                status=bool(source_product.get("status", 0)),
                manufacturer_id=source_product.get("manufacturer_id"),
                stock_status_id=source_product.get("stock_status_id"),
                tax_class_id=source_product.get("tax_class_id"),
                shipping=bool(source_product.get("shipping", 1)),
                subtract=bool(source_product.get("subtract", 1)),
                minimum=source_product.get("minimum"),
                points=source_product.get("points"),
                sort_order=source_product.get("sort_order"),
                seo_url=str((snapshot or {}).get("seo_url") or "").strip(),
                image=(source_product.get("image") or "").strip(),
                date_available=safe_date_available,
                date_modified_in_source=safe_date_modified,
                is_modified_locally=False,
                is_pushed_to_source=False,
                local_save_status=XLImportedProduct.LocalSaveStatus.SAVED,
                source_push_status=XLImportedProduct.SourcePushStatus.PENDING,
                source_push_error="",
                update_user=str(actor),
            )
            product.refresh_from_db()
    except IntegrityError as exc:
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "XL",
            "status_code": status.HTTP_409_CONFLICT,
            "details": {
                "code": "xl_local_upsert_conflict",
                "detail": "Local product upsert failed due to uniqueness conflict.",
                "error": str(exc),
            },
        }

    try:
        sync_xl_children_from_snapshot(product, snapshot)
    except IntegrityError as exc:
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "XL",
            "status_code": status.HTTP_400_BAD_REQUEST,
            "details": {
                "code": "xl_sync_child_conflict",
                "detail": "Sync failed due to conflicting child records.",
                "error": str(exc),
            },
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "MARKETPLACE_DEACTIVATE_XL_SYNC_CHILDREN_FAILED ean=%s site_key=%s",
            ean,
            site_key,
        )
        return None, db_config, {
            "ok": False,
            "site_key": site_key,
            "channel": "XL",
            "status_code": status.HTTP_400_BAD_REQUEST,
            "details": {
                "code": "xl_sync_children_failed",
                "detail": "Sync failed while processing source child data.",
                "error": str(exc),
            },
        }

    return product, db_config, None


def _apply_xl_deactivate(*, ean: str, site_key: str, inactive: bool, actor: str) -> dict:
    product, db_config, source_first_error = _ensure_local_xl_product_from_source(
        ean=ean,
        site_key=site_key,
        actor=actor,
    )
    if source_first_error is not None:
        return source_first_error

    desired_status = not bool(inactive)
    product.status = desired_status
    product.is_modified_locally = True
    product.update_user = actor
    product.save(update_fields=["status", "is_modified_locally", "update_user", "updated_at"])
    XLImportedProduct.all_objects.filter(pk=product.pk).update(
        source_push_status=XLImportedProduct.SourcePushStatus.PENDING,
        source_push_error="",
    )

    try:
        push_xl_product_to_source(
            db_config,
            product,
            changed_scalar_fields={"status"},
            changed_relations=set(),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "MARKETPLACE_DEACTIVATE_XL_PUSH_FAILED ean=%s site_key=%s",
            ean,
            site_key,
        )
        XLImportedProduct.all_objects.filter(pk=product.pk).update(
            source_push_status=XLImportedProduct.SourcePushStatus.FAILED,
            source_push_error=str(exc),
        )
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "XL",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "xl_source_push_failed",
                "detail": "XL deactivate saved locally but failed to push to source site.",
                "error": str(exc),
            },
        }

    XLImportedProduct.all_objects.filter(pk=product.pk).update(
        source_push_status=XLImportedProduct.SourcePushStatus.PUSHED,
        source_push_error="",
        is_pushed_to_source=True,
    )
    return {
        "ok": True,
        "site_key": site_key,
        "channel": "XL",
        "status_code": status.HTTP_200_OK,
        "details": {
            "ean": ean,
            "site": "XL",
            "site_key": site_key,
            "inactive": bool(inactive),
            "status": desired_status,
            "source_product_id": product.source_product_id,
        },
    }


def _apply_hood_patch(*, ean: str, site_key: str, account: str, payload: dict) -> dict:
    external_response = None
    last_error = None
    for candidate_url in build_patch_urls(ean):
        try:
            resp = requests.patch(
                candidate_url,
                params={"account": account},
                json=payload,
                headers={"accept": "application/json"},
                auth=hood_auth(),
                timeout=HOOD_API_TIMEOUT,
            )
        except requests.RequestException as exc:
            last_error = str(exc)
            continue

        if resp.status_code in (404, 405):
            external_response = resp
            continue

        external_response = resp
        break

    if external_response is None:
        set_external_push_status(account=account, ean=ean, pushed=False, error=last_error or "unknown error")
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "hood_external_network_failed",
                "detail": f"Hood external API network error: {last_error or 'unknown error'}",
            },
        }

    if external_response.status_code >= 400:
        set_external_push_status(account=account, ean=ean, pushed=False, error=external_response.text[:500])
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "hood_external_patch_failed",
                "detail": "Hood external API returned error status on PATCH.",
                "downstream_status_code": external_response.status_code,
                "body": external_response.text[:1500],
            },
        }

    try:
        downstream_payload = external_response.json()
    except ValueError:
        downstream_payload = None

    db_result = None
    if isinstance(downstream_payload, dict) and isinstance(downstream_payload.get("items"), list):
        with transaction.atomic():
            db_result = upsert_response_and_items(
                downstream_payload,
                account=account,
                ean=ean,
            )

    set_external_push_status(account=account, ean=ean, pushed=True)
    return {
        "ok": True,
        "site_key": site_key,
        "channel": "HOOD",
        "status_code": status.HTTP_200_OK,
        "details": {
            "ean": ean,
            "account": account,
            "payload": payload,
            "db": db_result,
            "status_meta": get_status_meta(account=account, ean=ean),
            "external_payload": downstream_payload,
        },
    }


def _apply_hood_delete_by_item_number(*, ean: str, site_key: str, account: str, item_number: str) -> dict:
    external_response = None
    last_error = None
    for candidate_url in build_delete_by_item_number_urls(item_number):
        try:
            resp = requests.delete(
                candidate_url,
                params={"account": account},
                headers={"accept": "application/json"},
                auth=hood_auth(),
                timeout=HOOD_API_TIMEOUT,
            )
        except requests.RequestException as exc:
            last_error = str(exc)
            continue

        if resp.status_code in (404, 405):
            external_response = resp
            continue

        external_response = resp
        break

    if external_response is None:
        set_external_push_status(account=account, ean=ean, pushed=False, error=last_error or "unknown error")
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "hood_external_network_failed",
                "detail": f"Hood external API network error: {last_error or 'unknown error'}",
                "item_number": item_number,
            },
        }

    if external_response.status_code >= 400:
        set_external_push_status(account=account, ean=ean, pushed=False, error=external_response.text[:500])
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "hood_external_delete_failed",
                "detail": "Hood external API returned error status on DELETE.",
                "downstream_status_code": external_response.status_code,
                "body": external_response.text[:1500],
                "item_number": item_number,
            },
        }

    try:
        downstream_payload = external_response.json()
    except ValueError:
        downstream_payload = None

    set_external_push_status(account=account, ean=ean, pushed=True)
    return {
        "ok": True,
        "site_key": site_key,
        "channel": "HOOD",
        "status_code": status.HTTP_200_OK,
        "details": {
            "ean": ean,
            "account": account,
            "item_number": item_number,
            "status_meta": get_status_meta(account=account, ean=ean),
            "external_payload": downstream_payload,
        },
    }


def _store_hood_snapshot_before_delete(*, ean: str, site_key: str, account: str) -> dict:
    external_url = f"{HOOD_API_BASE_URL}/api/items/by-ean/{ean}"
    try:
        external_response = requests.get(
            external_url,
            params={"account": account},
            headers={"accept": "application/json"},
            auth=hood_auth(),
            timeout=HOOD_API_TIMEOUT,
        )
    except requests.RequestException as exc:
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "hood_snapshot_network_failed",
                "detail": "Hood product snapshot could not be loaded before delete.",
                "error": str(exc),
            },
        }

    if external_response.status_code >= 400:
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "hood_snapshot_fetch_failed",
                "detail": "Hood product snapshot could not be loaded before delete.",
                "downstream_status_code": external_response.status_code,
                "body": external_response.text[:1500],
            },
        }

    try:
        external_payload = external_response.json()
    except ValueError:
        external_payload = None

    if not isinstance(external_payload, dict) or not isinstance(external_payload.get("items"), list) or not external_payload["items"]:
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "hood_snapshot_payload_invalid",
                "detail": "Hood returned no product fields to save before delete.",
            },
        }

    payload = dict(external_payload)
    payload["account"] = account
    payload["ean"] = ean
    with transaction.atomic():
        upsert_response_and_items(payload, account=account, ean=ean)
        save_hood_product_snapshot(account=account, ean=ean, payload=payload)

    return {
        "ok": True,
        "site_key": site_key,
        "channel": "HOOD",
        "status_code": status.HTTP_200_OK,
        "details": {
            "ean": ean,
            "account": account,
            "snapshot_saved": True,
            "items_saved": len(payload["items"]),
        },
    }


def _restore_payload_from_hood_snapshot(*, account: str, ean: str) -> tuple[dict | None, str | None]:
    snapshot = get_hood_product_snapshot_payload(account=account, ean=ean)
    if not isinstance(snapshot, dict):
        return None, "hood_restore_snapshot_missing"

    raw_items = snapshot.get("items")
    items = [item for item in raw_items if isinstance(item, dict)] if isinstance(raw_items, list) else []
    matching_items = [
        item
        for item in items
        if str(item.get("itemNumber") or "").strip() == ean or str(item.get("itemID") or "").strip() == ean
    ]
    if len(matching_items) == 1:
        item = matching_items[0]
    elif len(items) == 1:
        item = items[0]
    elif not items:
        return None, "hood_restore_snapshot_empty"
    else:
        return None, "hood_restore_snapshot_ambiguous"

    payload = {field: item[field] for field in HOOD_RESTORE_PAYLOAD_FIELDS if field in item}
    if not payload:
        return None, "hood_restore_snapshot_invalid"
    payload["ean"] = ean
    payload["account"] = account
    return payload, None


def _apply_hood_restore_from_snapshot(*, ean: str, site_key: str, account: str) -> dict:
    payload, error_code = _restore_payload_from_hood_snapshot(account=account, ean=ean)
    if payload is None:
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_409_CONFLICT,
            "details": {
                "code": error_code,
                "detail": "A saved Hood product snapshot is required to activate this item.",
                "ean": ean,
                "account": account,
            },
        }

    external_response = None
    last_error = None
    for candidate_url in build_create_urls(ean):
        try:
            response = requests.post(
                candidate_url,
                params={"account": account},
                json=payload,
                headers={"accept": "application/json"},
                auth=hood_auth(),
                timeout=HOOD_API_TIMEOUT,
            )
        except requests.RequestException as exc:
            last_error = str(exc)
            continue

        if response.status_code in (404, 405):
            external_response = response
            continue
        external_response = response
        break

    if external_response is None:
        set_external_push_status(account=account, ean=ean, pushed=False, error=last_error or "unknown error")
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "hood_restore_network_failed",
                "detail": f"Hood product restore network error: {last_error or 'unknown error'}",
            },
        }

    if external_response.status_code >= 400:
        set_external_push_status(account=account, ean=ean, pushed=False, error=external_response.text[:500])
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "hood_restore_create_failed",
                "detail": "Hood external API returned an error while restoring the product.",
                "downstream_status_code": external_response.status_code,
                "body": external_response.text[:1500],
            },
        }

    try:
        external_payload = external_response.json()
    except ValueError:
        external_payload = None

    if isinstance(external_payload, dict) and isinstance(external_payload.get("items"), list):
        external_payload = dict(external_payload)
        external_payload["account"] = account
        external_payload["ean"] = ean
        with transaction.atomic():
            upsert_response_and_items(external_payload, account=account, ean=ean)
    mark_hood_product_snapshot_restored(account=account, ean=ean)
    set_external_push_status(account=account, ean=ean, pushed=True)
    return {
        "ok": True,
        "site_key": site_key,
        "channel": "HOOD",
        "status_code": status.HTTP_201_CREATED,
        "details": {
            "ean": ean,
            "account": account,
            "restored_from_snapshot": True,
            "payload_fields": sorted(payload.keys()),
            "external_payload": external_payload,
        },
    }


def _build_success_response(*, entity_name: str, entity_value: str, inactive: bool, results: list[dict], response_status: int):
    success_count = sum(1 for row in results if row.get("ok"))
    failed_count = len(results) - success_count
    overall_status = "ok" if failed_count == 0 else ("partial" if success_count > 0 else "failed")
    return {
        "payload": {
            "status": overall_status,
            entity_name: entity_value,
            "inactive": inactive,
            "summary": {
                "total": len(results),
                "success": success_count,
                "failed": failed_count,
            },
            "results": results,
        },
        "status_code": response_status,
    }


def _all_issue_codes(results: list[dict]) -> set[str]:
    codes: set[str] = set()
    for row in results:
        details = row.get("details")
        if not isinstance(details, dict):
            continue
        code = details.get("code")
        if isinstance(code, str) and code.strip():
            codes.add(code.strip())
    return codes


def deactivate_marketplaces_by_explicit_sites(*, ean: str, site_keys: list[str], inactive: bool, actor: str, payloads_by_site_key: dict | None = None):
    payloads_by_site_key = {
        _normalize_target_site_key(key): value
        for key, value in (payloads_by_site_key or {}).items()
    }
    results = []
    for site_key in [_normalize_target_site_key(value) for value in site_keys]:
        target = _resolve_target(site_key)
        if target is None:
            results.append(
                {
                    "ok": False,
                    "site_key": site_key,
                    "channel": "UNKNOWN",
                    "status_code": status.HTTP_400_BAD_REQUEST,
                    "details": {
                        "code": "marketplace_deactivate_site_key_unsupported",
                        "detail": f"Unsupported site_key: {site_key}.",
                    },
                }
            )
            continue

        if target["channel"] == "JV":
            results.append(_apply_jv_deactivate(ean=ean, site_key=site_key, inactive=inactive, actor=actor))
            continue

        if target["channel"] == "XL":
            results.append(_apply_xl_deactivate(ean=ean, site_key=site_key, inactive=inactive, actor=actor))
            continue

        payload_override = payloads_by_site_key.get(site_key)
        if not isinstance(payload_override, dict) or not payload_override:
            results.append(
                {
                    "ok": False,
                    "site_key": site_key,
                    "channel": "HOOD",
                    "status_code": status.HTTP_400_BAD_REQUEST,
                    "details": {
                        "code": "marketplace_deactivate_payload_required",
                        "detail": (
                            f"site_key={site_key} requires explicit payloads['{site_key}'] because "
                            "the exact downstream deactivate field is marketplace-specific."
                        ),
                    },
                }
            )
            continue

        outbound_payload = dict(payload_override)
        outbound_payload.setdefault("ean", ean)
        outbound_payload.setdefault("account", target["account"])
        results.append(
            _apply_hood_patch(
                ean=ean,
                site_key=site_key,
                account=target["account"],
                payload=outbound_payload,
            )
        )

    response_status = status.HTTP_200_OK if all(row.get("ok") for row in results) else status.HTTP_207_MULTI_STATUS
    return _build_success_response(
        entity_name="ean",
        entity_value=ean,
        inactive=inactive,
        results=results,
        response_status=response_status,
    )


def deactivate_marketplaces_by_kid_number(
    *,
    kid_number: str,
    inactive: bool,
    actor: str,
    place: str | None = None,
    payloads_by_site_key: dict | None = None,
):
    payloads_by_site_key = {
        _normalize_target_site_key(key): value
        for key, value in (payloads_by_site_key or {}).items()
    }
    kid = _find_kid_by_number(kid_number)
    if kid is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_not_found",
                "detail": "Kid с таким kid_number не найден.",
                "kid_number": str(kid_number or "").strip(),
            },
            "status_code": status.HTTP_404_NOT_FOUND,
        }

    targets, issues = _resolve_kid_marketplace_targets(kid)
    results = list(issues)

    if not targets and results:
        if inactive and _all_issue_codes(results) == {"marketplace_deactivate_kid_mapping_missing"}:
            payload = _build_success_response(
                entity_name="kid_number",
                entity_value=_primary_kid_number_value(kid),
                inactive=inactive,
                results=[
                    {
                        "ok": True,
                        "site_key": "MARKETPLACE",
                        "channel": "LOCAL",
                        "status_code": status.HTTP_200_OK,
                        "details": {
                            "code": "marketplace_deactivate_no_mapping_noop",
                            "detail": "Marketplace deactivate skipped because the kid has no marketplace mapping yet.",
                        },
                    }
                ],
                response_status=status.HTTP_200_OK,
            )
            payload["payload"]["kid_id"] = kid.id
            return payload
        return _build_success_response(
            entity_name="kid_number",
            entity_value=_primary_kid_number_value(kid),
            inactive=inactive,
            results=results,
            response_status=status.HTTP_409_CONFLICT,
        )

    status_row, _ = EanStatus.objects.get_or_create(ean=kid)
    desired_flag_value = not bool(inactive)

    for target in targets:
        source_field = target["source_field"]
        if target.get("unsupported"):
            if source_field == "temu" or inactive:
                setattr(status_row, source_field, desired_flag_value)
                status_row.save(update_fields=[source_field])
                results.append(
                    {
                        "ok": True,
                        "site_key": target["site_key"],
                        "channel": target["channel"],
                        "status_code": status.HTTP_200_OK,
                        "details": {
                            "code": "marketplace_deactivate_local_status_only",
                            "detail": f"EanStatus.{source_field} updated locally without marketplace integration.",
                            "ean": target["ean"],
                            "field": source_field,
                            "inactive": bool(inactive),
                            "status": desired_flag_value,
                        },
                    }
                )
            else:
                results.append(
                    {
                        "ok": False,
                        "site_key": target["site_key"],
                        "channel": target["channel"],
                        "status_code": status.HTTP_501_NOT_IMPLEMENTED,
                        "details": {
                            "code": "marketplace_deactivate_not_supported",
                            "detail": (
                                f"Автоматическая деактивация для поля EanStatus.{source_field} "
                                "в текущей кодовой базе не реализована."
                            ),
                            "ean": target["ean"],
                            "field": source_field,
                        },
                    }
                )
            continue

        if target["channel"] == "JV":
            result = _apply_jv_deactivate(
                ean=target["ean"],
                site_key=target["site_key"],
                inactive=inactive,
                actor=actor,
            )
        elif target["channel"] == "XL":
            result = _apply_xl_deactivate(
                ean=target["ean"],
                site_key=target["site_key"],
                inactive=inactive,
                actor=actor,
            )
        elif target["channel"] == "HOOD":
            if inactive:
                setattr(status_row, source_field, desired_flag_value)
                status_row.save(update_fields=[source_field])
                result = {
                    "ok": True,
                    "site_key": target["site_key"],
                    "channel": "HOOD",
                    "status_code": status.HTTP_200_OK,
                    "details": {
                        "code": "marketplace_deactivate_local_status_only",
                        "detail": (
                            f"EanStatus.{source_field} updated locally without HOOD integration."
                        ),
                        "ean": target["ean"],
                        "field": source_field,
                        "inactive": True,
                        "status": desired_flag_value,
                    },
                }
            else:
                payload_override = payloads_by_site_key.get(target["site_key"])
                if not isinstance(payload_override, dict) or not payload_override:
                    result = {
                        "ok": False,
                        "site_key": target["site_key"],
                        "channel": "HOOD",
                        "status_code": status.HTTP_400_BAD_REQUEST,
                        "details": {
                            "code": "marketplace_deactivate_payload_required",
                            "detail": (
                                f"Для {target['site_key']} нужен explicit payloads['{target['site_key']}'], "
                                "потому что точное downstream поле деактивации для Hood в текущем коде не зафиксировано."
                            ),
                            "ean": target["ean"],
                            "field": source_field,
                        },
                    }
                else:
                    outbound_payload = dict(payload_override)
                    outbound_payload.setdefault("ean", target["ean"])
                    outbound_payload.setdefault("account", target["account"])
                    result = _apply_hood_patch(
                        ean=target["ean"],
                        site_key=target["site_key"],
                        account=target["account"],
                        payload=outbound_payload,
                    )
        else:
            result = {
                "ok": False,
                "site_key": target["site_key"],
                "channel": target["channel"],
                "status_code": status.HTTP_400_BAD_REQUEST,
                "details": {
                    "code": "marketplace_deactivate_target_unsupported",
                    "detail": f"Unsupported channel: {target['channel']}.",
                },
            }

        if result.get("ok") and result.get("status_code") in {status.HTTP_200_OK, status.HTTP_201_CREATED}:
            setattr(status_row, source_field, desired_flag_value)
            status_row.save(update_fields=[source_field])
        results.append(result)

    response_status = status.HTTP_200_OK if results and all(row.get("ok") for row in results) else status.HTTP_207_MULTI_STATUS
    if not results:
        response_status = status.HTTP_409_CONFLICT
        results.append(
            {
                "ok": False,
                "site_key": "",
                "channel": "LOCAL",
                "status_code": status.HTTP_409_CONFLICT,
                "details": {
                    "code": "marketplace_deactivate_no_active_targets",
                    "detail": "Для этого Kid нет активных marketplace-статусов для деактивации.",
                },
            }
        )

    if results and all(row.get("ok") for row in results):
        try:
            _update_kid_place_after_marketplace_toggle(kid=kid, inactive=inactive, place=place)
        except ValueError as exc:
            return {
                "payload": {
                    "code": "marketplace_place_update_invalid",
                    "detail": str(exc),
                    "kid_number": _primary_kid_number_value(kid),
                },
                "status_code": status.HTTP_409_CONFLICT,
            }

    payload = _build_success_response(
        entity_name="kid_number",
        entity_value=_primary_kid_number_value(kid),
        inactive=inactive,
        results=results,
        response_status=response_status,
    )
    payload["payload"]["kid_id"] = kid.id
    return payload


def toggle_local_marketplace_statuses_by_kid_number(*, kid_number: str, inactive: bool, actor: str):
    kid = _find_kid_by_number(kid_number)
    if kid is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_not_found",
                "detail": "Kid с таким kid_number не найден.",
                "kid_number": str(kid_number or "").strip(),
            },
            "status_code": status.HTTP_404_NOT_FOUND,
        }

    ean_row = getattr(kid, "ean", None)
    if ean_row is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_mapping_missing",
                "detail": "У Kid отсутствует связанный Ean.",
                "kid_number": _primary_kid_number_value(kid),
            },
            "status_code": status.HTTP_409_CONFLICT,
        }

    status_row, _ = EanStatus.objects.get_or_create(ean=kid)
    desired_flag_value = not bool(inactive)
    results: list[dict] = []
    update_fields: list[str] = []

    for field_name, channel in (
        ("ebay_jv", "EBAY"),
        ("ebay_xl", "EBAY"),
        ("temu", "TEMU"),
    ):
        ean_value = str(getattr(ean_row, field_name, "") or "").strip()
        if not ean_value:
            continue
        if getattr(status_row, field_name, None) != desired_flag_value:
            setattr(status_row, field_name, desired_flag_value)
            update_fields.append(field_name)
        results.append(
            {
                "ok": True,
                "site_key": field_name.upper(),
                "channel": channel,
                "status_code": status.HTTP_200_OK,
                "details": {
                    "code": "marketplace_local_status_updated",
                    "detail": f"EanStatus.{field_name} updated locally without marketplace integration.",
                    "ean": ean_value,
                    "field": field_name,
                    "inactive": bool(inactive),
                    "status": desired_flag_value,
                },
            }
        )

    if update_fields:
        status_row.save(update_fields=update_fields)

    if not results:
        results.append(
            {
                "ok": True,
                "site_key": "LOCAL",
                "channel": "LOCAL",
                "status_code": status.HTTP_200_OK,
                "details": {
                    "code": "marketplace_local_status_no_targets",
                    "detail": "Для этого Kid нет EBAY или TEMU targets для локального обновления.",
                },
            }
        )

    response_status = status.HTTP_200_OK if results and all(row.get("ok") for row in results) else status.HTTP_409_CONFLICT
    payload = _build_success_response(
        entity_name="kid_number",
        entity_value=_primary_kid_number_value(kid),
        inactive=inactive,
        results=results,
        response_status=response_status,
    )
    payload["payload"]["kid_id"] = kid.id
    payload["payload"]["mode"] = "local_status_only"
    return payload


def _apply_kaufland_active_state(*, ean: str, site_key: str, controller: str, inactive: bool) -> dict:
    try:
        upstream_payload = set_product_active_state(
            ean=ean,
            controller=controller,
            active=not bool(inactive),
        )
    except requests.HTTPError as exc:
        response = exc.response
        status_code = response.status_code if response is not None else status.HTTP_502_BAD_GATEWAY
        try:
            upstream_payload = response.json() if response is not None else {"detail": str(exc)}
        except ValueError:
            upstream_payload = {"detail": response.text if response is not None else str(exc)}
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "KAUFLAND",
            "status_code": status_code,
            "details": {
                "code": "kaufland_toggle_failed",
                "detail": "Kaufland activate/deactivate request failed.",
                "ean": ean,
                "controller": controller,
                "inactive": bool(inactive),
                "upstream_response": upstream_payload,
            },
        }
    except requests.RequestException as exc:
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "KAUFLAND",
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "kaufland_toggle_transport_failed",
                "detail": "Kaufland activate/deactivate request failed before response.",
                "ean": ean,
                "controller": controller,
                "inactive": bool(inactive),
                "reason": str(exc),
            },
        }

    return {
        "ok": True,
        "site_key": site_key,
        "channel": "KAUFLAND",
        "status_code": status.HTTP_200_OK,
        "details": {
            "code": "kaufland_toggled",
            "ean": ean,
            "controller": controller,
            "inactive": bool(inactive),
            "status": not bool(inactive),
            "upstream_response": upstream_payload,
        },
    }


def _apply_otto_active_state(*, ean: str, site_key: str, controller: str, inactive: bool) -> dict:
    try:
        upstream_payload = OttoExternalProductsClient().set_active_state(
            ean=ean,
            controller=controller,
            active=not bool(inactive),
        )
    except OttoExternalAPIError as exc:
        return {
            "ok": False,
            "site_key": site_key,
            "channel": "OTTO",
            "status_code": exc.status_code or status.HTTP_502_BAD_GATEWAY,
            "details": {
                "code": "otto_toggle_failed",
                "detail": str(exc),
                "ean": ean,
                "controller": controller,
                "inactive": bool(inactive),
                "upstream_response": exc.details,
            },
        }

    return {
        "ok": True,
        "site_key": site_key,
        "channel": "OTTO",
        "status_code": status.HTTP_200_OK,
        "details": {
            "code": "otto_toggled",
            "ean": ean,
            "controller": controller,
            "inactive": bool(inactive),
            "status": not bool(inactive),
            "upstream_response": upstream_payload,
        },
    }


def deactivate_otto_by_kid_number(*, kid_number: str, inactive: bool, actor: str, place: str | None = None):
    kid = _find_kid_by_number(kid_number)
    if kid is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_not_found",
                "detail": "Kid с таким kid_number не найден.",
                "kid_number": str(kid_number or "").strip(),
            },
            "status_code": status.HTTP_404_NOT_FOUND,
        }

    ean_row = getattr(kid, "ean", None)
    if ean_row is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_mapping_missing",
                "detail": "У Kid отсутствует связанный Ean.",
                "kid_number": _primary_kid_number_value(kid),
            },
            "status_code": status.HTTP_409_CONFLICT,
        }

    status_row, _ = EanStatus.objects.get_or_create(ean=kid)
    desired_status = not bool(inactive)
    results: list[dict] = []

    for source_field, site_key, controller in (
        ("otto_jv", "OTTO_JV", "jv"),
        ("otto_xl", "OTTO_XL", "xl"),
    ):
        ean_value = str(getattr(ean_row, source_field, "") or "").strip()
        if not ean_value:
            continue
        if bool(getattr(status_row, source_field, False)) == desired_status:
            continue

        result = _apply_otto_active_state(
            ean=ean_value,
            site_key=site_key,
            controller=controller,
            inactive=inactive,
        )
        if result.get("ok") and result.get("status_code") in {status.HTTP_200_OK, status.HTTP_201_CREATED}:
            setattr(status_row, source_field, desired_status)
            status_row.save(update_fields=[source_field])
        results.append(result)

    if not results:
        results.append(
            {
                "ok": True,
                "site_key": "OTTO",
                "channel": "OTTO",
                "status_code": status.HTTP_200_OK,
                "details": {
                    "code": "marketplace_otto_toggle_noop",
                    "detail": "У Kid нет OTTO targets, требующих изменения статуса.",
                    "inactive": bool(inactive),
                },
            }
        )

    successful_results = [
        row
        for row in results
        if row.get("ok") and row.get("status_code") in {status.HTTP_200_OK, status.HTTP_201_CREATED}
        and row.get("details", {}).get("code") != "marketplace_otto_toggle_noop"
    ]
    if successful_results:
        try:
            _update_kid_place_after_marketplace_toggle(kid=kid, inactive=inactive, place=place)
        except ValueError as exc:
            return {
                "payload": {
                    "code": "marketplace_place_update_invalid",
                    "detail": str(exc),
                    "kid_number": _primary_kid_number_value(kid),
                },
                "status_code": status.HTTP_409_CONFLICT,
            }

    response_status = status.HTTP_200_OK if results and all(row.get("ok") for row in results) else status.HTTP_207_MULTI_STATUS
    payload = _build_success_response(
        entity_name="kid_number",
        entity_value=_primary_kid_number_value(kid),
        inactive=inactive,
        results=results,
        response_status=response_status,
    )
    payload["payload"]["kid_id"] = kid.id
    payload["payload"]["mode"] = "otto_jv_xl"
    return payload


def deactivate_kaufland_by_kid_number(*, kid_number: str, inactive: bool, actor: str, place: str | None = None):
    kid = _find_kid_by_number(kid_number)
    if kid is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_not_found",
                "detail": "Kid с таким kid_number не найден.",
                "kid_number": str(kid_number or "").strip(),
            },
            "status_code": status.HTTP_404_NOT_FOUND,
        }

    ean_row = getattr(kid, "ean", None)
    if ean_row is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_mapping_missing",
                "detail": "У Kid отсутствует связанный Ean.",
                "kid_number": _primary_kid_number_value(kid),
            },
            "status_code": status.HTTP_409_CONFLICT,
        }

    status_row, _ = EanStatus.objects.get_or_create(ean=kid)
    desired_status = not bool(inactive)
    results: list[dict] = []

    for source_field, site_key, controller in (
        ("kaufland_jv", "KAUFLAND_JV", "jv"),
        ("kaufland_xl", "KAUFLAND_XL", "xl"),
    ):
        ean_value = str(getattr(ean_row, source_field, "") or "").strip()
        if not ean_value:
            continue
        if bool(getattr(status_row, source_field, False)) == desired_status:
            continue

        result = _apply_kaufland_active_state(
            ean=ean_value,
            site_key=site_key,
            controller=controller,
            inactive=inactive,
        )
        if result.get("ok") and result.get("status_code") in {status.HTTP_200_OK, status.HTTP_201_CREATED}:
            setattr(status_row, source_field, desired_status)
            status_row.save(update_fields=[source_field])
        results.append(result)

    if not results:
        results.append(
            {
                "ok": True,
                "site_key": "KAUFLAND",
                "channel": "KAUFLAND",
                "status_code": status.HTTP_200_OK,
                "details": {
                    "code": "marketplace_kaufland_toggle_noop",
                    "detail": "У Kid нет Kaufland targets, требующих изменения статуса.",
                    "inactive": bool(inactive),
                },
            }
        )

    successful_results = [
        row
        for row in results
        if row.get("ok") and row.get("status_code") in {status.HTTP_200_OK, status.HTTP_201_CREATED}
        and row.get("details", {}).get("code") != "marketplace_kaufland_toggle_noop"
    ]
    if successful_results:
        try:
            _update_kid_place_after_marketplace_toggle(kid=kid, inactive=inactive, place=place)
        except ValueError as exc:
            return {
                "payload": {
                    "code": "marketplace_place_update_invalid",
                    "detail": str(exc),
                    "kid_number": _primary_kid_number_value(kid),
                },
                "status_code": status.HTTP_409_CONFLICT,
            }

    response_status = status.HTTP_200_OK if results and all(row.get("ok") for row in results) else status.HTTP_207_MULTI_STATUS

    payload = _build_success_response(
        entity_name="kid_number",
        entity_value=_primary_kid_number_value(kid),
        inactive=inactive,
        results=results,
        response_status=response_status,
    )
    payload["payload"]["kid_id"] = kid.id
    payload["payload"]["mode"] = "kaufland_jv_xl"
    return payload


def deactivate_jv_sofort_by_kid_number(*, kid_number: str, inactive: bool, actor: str, place: str | None = None):
    kid = _find_kid_by_number(kid_number)
    if kid is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_not_found",
                "detail": "Kid с таким kid_number не найден.",
                "kid_number": str(kid_number or "").strip(),
            },
            "status_code": status.HTTP_404_NOT_FOUND,
        }

    ean_row = getattr(kid, "ean", None)
    if ean_row is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_mapping_missing",
                "detail": "У Kid отсутствует связанный Ean.",
                "kid_number": _primary_kid_number_value(kid),
            },
            "status_code": status.HTTP_409_CONFLICT,
        }

    jv_ean = str(getattr(ean_row, "jv", "") or "").strip()
    if not jv_ean:
        return {
            "payload": {
                "code": "marketplace_deactivate_ean_missing",
                "detail": "Поле Ean.jv пустое.",
                "kid_number": _primary_kid_number_value(kid),
            },
            "status_code": status.HTTP_409_CONFLICT,
        }

    results = [
        _apply_jv_sofort_deactivate(
            ean=jv_ean,
            site_key=site_key,
            inactive=inactive,
            actor=actor,
        )
        for site_key in FIXED_JV_BATCH_SITE_KEYS
    ]

    if results and all(row.get("ok") and row.get("status_code") in {status.HTTP_200_OK, status.HTTP_201_CREATED} for row in results):
        status_row, _ = EanStatus.objects.get_or_create(ean=kid)
        status_row.jv = not bool(inactive)
        status_row.save(update_fields=["jv"])
        try:
            _update_kid_place_after_marketplace_toggle(kid=kid, inactive=inactive, place=place)
        except ValueError as exc:
            return {
                "payload": {
                    "code": "marketplace_place_update_invalid",
                    "detail": str(exc),
                    "kid_number": _primary_kid_number_value(kid),
                },
                "status_code": status.HTTP_409_CONFLICT,
            }

    response_status = status.HTTP_200_OK if results and all(row.get("ok") for row in results) else status.HTTP_207_MULTI_STATUS
    payload = _build_success_response(
        entity_name="kid_number",
        entity_value=_primary_kid_number_value(kid),
        inactive=inactive,
        results=results,
        response_status=response_status,
    )
    payload["payload"]["kid_id"] = kid.id
    payload["payload"]["ean"] = jv_ean
    payload["payload"]["mode"] = "jv_sofort_artikelnr"
    return payload


def deactivate_xl_by_kid_number(*, kid_number: str, inactive: bool, actor: str, place: str | None = None):
    kid = _find_kid_by_number(kid_number)
    if kid is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_not_found",
                "detail": "Kid с таким kid_number не найден.",
                "kid_number": str(kid_number or "").strip(),
            },
            "status_code": status.HTTP_404_NOT_FOUND,
        }

    ean_row = getattr(kid, "ean", None)
    if ean_row is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_mapping_missing",
                "detail": "У Kid отсутствует связанный Ean.",
                "kid_number": _primary_kid_number_value(kid),
            },
            "status_code": status.HTTP_409_CONFLICT,
        }

    xl_ean = str(getattr(ean_row, "xl", "") or "").strip()
    if not xl_ean:
        return {
            "payload": {
                "code": "marketplace_deactivate_ean_missing",
                "detail": "Поле Ean.xl пустое.",
                "kid_number": _primary_kid_number_value(kid),
            },
            "status_code": status.HTTP_409_CONFLICT,
        }

    result = _apply_xl_deactivate(
        ean=xl_ean,
        site_key="XLMOEBEL_DE",
        inactive=inactive,
        actor=actor,
    )
    results = [result]

    if result.get("ok") and result.get("status_code") in {status.HTTP_200_OK, status.HTTP_201_CREATED}:
        status_row, _ = EanStatus.objects.get_or_create(ean=kid)
        status_row.xl = not bool(inactive)
        status_row.save(update_fields=["xl"])
        try:
            _update_kid_place_after_marketplace_toggle(kid=kid, inactive=inactive, place=place)
        except ValueError as exc:
            return {
                "payload": {
                    "code": "marketplace_place_update_invalid",
                    "detail": str(exc),
                    "kid_number": _primary_kid_number_value(kid),
                },
                "status_code": status.HTTP_409_CONFLICT,
            }

    response_status = status.HTTP_200_OK if result.get("ok") else status.HTTP_207_MULTI_STATUS
    payload = _build_success_response(
        entity_name="kid_number",
        entity_value=_primary_kid_number_value(kid),
        inactive=inactive,
        results=results,
        response_status=response_status,
    )
    payload["payload"]["kid_id"] = kid.id
    payload["payload"]["ean"] = xl_ean
    payload["payload"]["mode"] = "xl_de_only"
    return payload


def deactivate_hood_by_kid_number(*, kid_number: str, inactive: bool, actor: str, place: str | None = None):
    kid = _find_kid_by_number(kid_number)
    if kid is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_not_found",
                "detail": "Kid с таким kid_number не найден.",
                "kid_number": str(kid_number or "").strip(),
            },
            "status_code": status.HTTP_404_NOT_FOUND,
        }

    ean_row = getattr(kid, "ean", None)
    status_row = getattr(kid, "status", None)
    if ean_row is None or status_row is None:
        return {
            "payload": {
                "code": "marketplace_deactivate_kid_mapping_missing",
                "detail": "У Kid отсутствует связанный Ean или EanStatus.",
                "kid_number": _primary_kid_number_value(kid),
            },
            "status_code": status.HTTP_409_CONFLICT,
        }

    targets: list[dict] = []
    results: list[dict] = []
    for source_field, site_key, account in (
        ("hood_jv", "HOOD_JV", "jv"),
        ("hood_xl", "HOOD_XL", "xl"),
    ):
        is_active = bool(getattr(status_row, source_field, False))
        if inactive and not is_active:
            continue
        if not inactive and is_active:
            continue
        ean_value = str(getattr(ean_row, source_field, "") or "").strip()
        if not ean_value:
            results.append(
                {
                    "ok": False,
                    "site_key": site_key,
                    "channel": "HOOD",
                    "status_code": status.HTTP_409_CONFLICT,
                    "details": {
                        "code": "marketplace_deactivate_ean_missing",
                        "detail": f"Поле Ean.{source_field} пустое при активном EanStatus.{source_field}.",
                        "field": source_field,
                    },
                }
            )
            continue
        targets.append(
            {
                "source_field": source_field,
                "site_key": site_key,
                "account": account,
                "ean": ean_value,
            }
        )

    if not targets and results:
        payload = _build_success_response(
            entity_name="kid_number",
            entity_value=_primary_kid_number_value(kid),
            inactive=inactive,
            results=results,
            response_status=status.HTTP_409_CONFLICT,
        )
        payload["payload"]["kid_id"] = kid.id
        payload["payload"]["mode"] = "hood_only"
        return payload

    desired_flag_value = not bool(inactive)
    for target in targets:
        if inactive:
            snapshot_result = _store_hood_snapshot_before_delete(
                ean=target["ean"],
                site_key=target["site_key"],
                account=target["account"],
            )
            if not snapshot_result.get("ok"):
                results.append(snapshot_result)
                continue
            result = _apply_hood_delete_by_item_number(
                ean=target["ean"],
                site_key=target["site_key"],
                account=target["account"],
                item_number=target["ean"],
            )
        else:
            result = _apply_hood_restore_from_snapshot(
                ean=target["ean"],
                site_key=target["site_key"],
                account=target["account"],
            )
        if result.get("ok") and result.get("status_code") in {status.HTTP_200_OK, status.HTTP_201_CREATED}:
            setattr(status_row, target["source_field"], desired_flag_value)
            status_row.save(update_fields=[target["source_field"]])
        results.append(result)

    if not results:
        results.append(
            {
                "ok": False,
                "site_key": "",
                "channel": "HOOD",
                "status_code": status.HTTP_409_CONFLICT,
                "details": {
                    "code": "marketplace_deactivate_no_active_targets",
                        "detail": (
                            "Для этого Kid нет активных HOOD-статусов для деактивации."
                            if inactive
                            else "Для этого Kid нет деактивированных HOOD-статусов для восстановления."
                        ),
                },
            }
        )

    response_status = status.HTTP_200_OK if results and all(row.get("ok") for row in results) else status.HTTP_207_MULTI_STATUS
    if len(results) == 1 and results[0]["details"].get("code") == "marketplace_deactivate_no_active_targets":
        response_status = status.HTTP_409_CONFLICT
    elif any(row.get("ok") and row.get("status_code") in {status.HTTP_200_OK, status.HTTP_201_CREATED} for row in results):
        try:
            _update_kid_place_after_marketplace_toggle(kid=kid, inactive=inactive, place=place)
        except ValueError as exc:
            return {
                "payload": {
                    "code": "marketplace_place_update_invalid",
                    "detail": str(exc),
                    "kid_number": _primary_kid_number_value(kid),
                },
                "status_code": status.HTTP_409_CONFLICT,
            }

    payload = _build_success_response(
        entity_name="kid_number",
        entity_value=_primary_kid_number_value(kid),
        inactive=inactive,
        results=results,
        response_status=response_status,
    )
    payload["payload"]["kid_id"] = kid.id
    payload["payload"]["mode"] = "hood_only"
    return payload
