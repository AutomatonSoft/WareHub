import logging
import re

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.idempotency import (
    finalize_error,
    finalize_success,
)
from database.permissions import SessionRolePermission

from catalog_core.batch_shared import convert_amount as _convert_amount
from .batch_service import _build_multilang_descriptions_for_site
from .batch_defaults import DEFAULT_LOCALE_BY_SITE_KEY, DEFAULT_CURRENCY_BY_SITE_KEY
from .batch_translation import _translate_jv_content_row
from .models import (
    ImportedProduct,
)
from .price_rules import apply_special_price_from_product
from .serializers import ImportedProductCreateSerializer, ImportedProductDetailSerializer, ImportedProductPatchSerializer
from .source_client import (
    create_product_in_source,
    fetch_source_language_id_by_locale,
    fetch_source_product_snapshot_by_product_id,
    fetch_source_product_snapshot_by_ean,
    push_product_to_source,
    source_db_config_for_site,
)
from .sync_utils import effective_ean_from_source, resolve_local_product_for_source, sync_children_from_snapshot
from .view_helpers import (
    apply_jv_fields_to_payload,
    normalize_site as _normalize_site,
    normalize_site_key as _normalize_site_key,
    request_body_for_hash as _request_body_for_hash,
    resolve_product_by_ean as _resolve_product_by_ean,
    session_actor as _session_actor,
    to_date_or_none as _to_date_or_none,
    to_datetime_or_none as _to_datetime_or_none,
)
from .source_language import normalize_locale_code
from .views_write_children import (
    bulk_create_categories,
    bulk_create_descriptions,
    bulk_create_images,
    bulk_create_specials,
    bulk_create_stores,
    create_payload_children,
    normalize_images_model as _normalize_images_model,
    normalize_images_payload as _normalize_images_payload,
    record_ean_usage,
)
from .views_idempotency import claim_idempotency_or_response
from .views_write_products import (
    create_local_product_from_payload,
    create_local_product_from_source,
    update_local_product_from_source,
)
from .views_push_state import (
    FULL_PUSH_RELATIONS,
    FULL_PUSH_SCALAR_FIELDS,
    mark_push_failed,
    mark_push_pending,
    mark_push_pushed,
)
from .views_create_prepare import prepare_create_identity

logger = logging.getLogger(__name__)


def _finalize_success_if_tracked(idem_record, **kwargs):
    """finalize_success that no-ops when there is no idempotency record.

    Background callers (the create-job worker) reuse the extracted core
    functions without an idempotency record, so finalize must be skipped.
    """
    if idem_record is not None:
        finalize_success(idem_record, **kwargs)


def _finalize_error_if_tracked(idem_record, **kwargs):
    if idem_record is not None:
        finalize_error(idem_record, **kwargs)


def _apply_direct_jv_translation_to_payload(*, payload: dict, site_key: str) -> None:
    if not bool(payload.get("translate_texts")):
        return
    normalized_site_key = str(site_key or "").strip().upper()
    if not normalized_site_key:
        return

    locale_by_site_key_raw = payload.get("locale_by_site_key") or {}
    target_locale = normalize_locale_code(
        str(locale_by_site_key_raw.get(normalized_site_key) or DEFAULT_LOCALE_BY_SITE_KEY.get(normalized_site_key) or "")
    )
    if not target_locale:
        return

    jv_fields = payload.get("jv_fields")
    if not isinstance(jv_fields, dict):
        return
    content_rows = jv_fields.get("content_by_language")
    if not isinstance(content_rows, list):
        return

    source_row = next(
        (
            row for row in content_rows
            if isinstance(row, dict) and str(row.get("language_code") or "").strip().lower() == "de"
        ),
        None,
    )
    if source_row is None:
        source_row = next((row for row in content_rows if isinstance(row, dict)), None)
    if source_row is None:
        return

    source_lang = normalize_locale_code(str(payload.get("translation_source_language") or source_row.get("language_code") or "de")) or "de"
    translated_row, _errors = _translate_jv_content_row(
        row=dict(source_row),
        source_lang=source_lang,
        target_locale=target_locale,
        translation_cache={},
        pretranslated_fields=None,
    )
    translated_row["language_code"] = "de"
    next_jv_fields = dict(jv_fields)
    next_jv_fields["content_by_language"] = [translated_row]
    payload["jv_fields"] = next_jv_fields


_FX_MAX_RATE_CACHE: dict = {}


def _apply_currency_conversion_to_payload(*, payload: dict, site_key: str) -> None:
    """Convert ``payload['price']`` into the target site currency when requested.

    Mirrors the batch path: source currency defaults to EUR, target currency is
    inferred from the site key (e.g. JV_CH -> CHF, JV_CO_UK -> GBP). No-op unless
    ``convert_currency`` is set and source/target currencies differ.
    """
    if not bool(payload.get("convert_currency")):
        return
    price = payload.get("price")
    if price is None:
        return
    source_currency = (str(payload.get("source_currency") or "").strip().upper()) or "EUR"
    normalized_site_key = str(site_key or "").strip().upper()
    target_currency = (
        str(DEFAULT_CURRENCY_BY_SITE_KEY.get(normalized_site_key) or "").strip().upper() or source_currency
    )
    if source_currency == target_currency:
        return
    converted = _convert_amount(
        amount=price,
        from_currency=source_currency,
        to_currency=target_currency,
        env_prefix="JV",
        cache=_FX_MAX_RATE_CACHE,
    )
    if converted is not None:
        payload["price"] = converted


# Sofort products carry a "SOFORT" marker in the article name and in the meta
# title/description, and the meta domain suffix is rewritten per site.
_JV_SITE_META_DOMAIN = {
    "JV_DE": "jvmoebel.de",
    "JV_AT": "jvmoebel.at",
    "JV_CH": "jvmoebel.ch",
    "JV_CO_UK": "jvfurniture.co.uk",
}
_META_DOMAIN_TAIL = re.compile(r"\s*\|\s*(?:jvmoebel\.[a-z.]+|jvfurniture\.co\.uk)\s*$", re.IGNORECASE)
_META_SOFORT_TAIL = re.compile(r"\s*\|\s*SOFORT\s*$", re.IGNORECASE)
_NAME_SOFORT_TAIL = re.compile(r"\bSOFORT\s*$", re.IGNORECASE)


def _append_sofort_to_name(value) -> str:
    text = str(value or "").strip()
    if not text or _NAME_SOFORT_TAIL.search(text):
        return text
    return f"{text} SOFORT"


def _rewrite_sofort_meta(value, domain: str) -> str:
    text = str(value or "").strip()
    if not text:
        return text
    text = _META_DOMAIN_TAIL.sub("", text)
    text = _META_SOFORT_TAIL.sub("", text).rstrip()
    if domain:
        return f"{text} | SOFORT | {domain}"
    return f"{text} | SOFORT"


def _apply_sofort_content_transforms(*, payload: dict, site: str, site_key: str) -> None:
    """For Sofort products: append SOFORT to the name and inject ``| SOFORT | <site domain>``
    into meta title/description. Runs AFTER translation so the marker/domain survive."""
    if site != ImportedProduct.Site.JV:
        return
    jv_fields = payload.get("jv_fields")
    if not isinstance(jv_fields, dict):
        return
    try:
        is_sofort = int(jv_fields.get("is_sofort") or 0) == 1
    except (TypeError, ValueError):
        is_sofort = False
    if not is_sofort:
        return
    rows = jv_fields.get("content_by_language")
    if not isinstance(rows, list):
        return
    domain = _JV_SITE_META_DOMAIN.get(str(site_key or "").strip().upper(), "")
    next_rows = []
    for row in rows:
        if not isinstance(row, dict):
            next_rows.append(row)
            continue
        new_row = dict(row)
        if new_row.get("name") is not None:
            new_row["name"] = _append_sofort_to_name(new_row.get("name"))
        if new_row.get("meta_title") is not None:
            new_row["meta_title"] = _rewrite_sofort_meta(new_row.get("meta_title"), domain)
        if new_row.get("meta_description") is not None:
            new_row["meta_description"] = _rewrite_sofort_meta(new_row.get("meta_description"), domain)
        next_rows.append(new_row)
    next_jv_fields = dict(jv_fields)
    next_jv_fields["content_by_language"] = next_rows
    payload["jv_fields"] = next_jv_fields


class JVProductUpdateByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @transaction.atomic
    def patch(self, request, ean: str):
        site = _normalize_site(request.query_params.get("site"))
        site_key = _normalize_site_key(request.query_params.get("site_key"))
        if site is None:
            return Response(
                {"detail": "Передайте query-параметр ?site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        idem_record, idem_response = claim_idempotency_or_response(
            request=request,
            scope="jv.update_by_ean",
            body=_request_body_for_hash(request),
        )
        if idem_response is not None:
            return idem_response

        return update_and_push_jv_product_by_ean(
            ean=ean,
            site=site,
            site_key=site_key,
            payload_data=request.data,
            actor=_session_actor(request),
            idem_record=idem_record,
        )


@transaction.atomic
def update_and_push_jv_product_by_ean(
    *,
    ean: str,
    site: str,
    site_key: str | None,
    payload_data,
    actor: str,
    idem_record=None,
) -> Response:
    """Update an existing JV product by EAN and push it to the source site.

    Extracted from ``JVProductUpdateByEANAPIView.patch`` so the create-job
    worker can reuse it as the conflict fallback (when an article with the
    same EAN already exists on a site). Idempotency is claimed by the view
    and passed via ``idem_record``; background callers pass ``idem_record=None``
    to skip idempotency bookkeeping. Returns the same DRF ``Response`` objects
    as the view.
    """
    product, error_response = _resolve_product_by_ean(ean, site, site_key)
    if error_response is not None:
        _finalize_error_if_tracked(
            idem_record,
            status_code=error_response.status_code,
            payload=error_response.data if isinstance(error_response.data, dict) else {"detail": str(error_response.data)},
            error_code="jv_product_not_found_or_invalid_site",
        )
        return error_response

    serializer = ImportedProductPatchSerializer(data=payload_data, partial=True)
    serializer.is_valid(raise_exception=True)
    payload = serializer.validated_data
    _apply_direct_jv_translation_to_payload(payload=payload, site_key=site_key)
    _apply_currency_conversion_to_payload(payload=payload, site_key=site_key)
    _apply_sofort_content_transforms(payload=payload, site=site, site_key=site_key)
    apply_jv_fields_to_payload(
        payload,
        site=site,
        existing_descriptions=list(product.descriptions.all()) if site == ImportedProduct.Site.JV else None,
    )
    relation_fields = {"descriptions", "categories", "stores", "images", "specials"}
    changed_scalar_fields = set(payload.keys()) - relation_fields

    descriptions = payload.pop("descriptions", None)
    categories = payload.pop("categories", None)
    stores = payload.pop("stores", None)
    images = payload.pop("images", None)
    specials = payload.pop("specials", None)
    changed_relations = {
        name
        for name, value in (
            ("descriptions", descriptions),
            ("categories", categories),
            ("stores", stores),
            ("images", images),
            ("specials", specials),
        )
        if value is not None
    }
    if images is not None:
        incoming_images = _normalize_images_payload(images)
        existing_images = _normalize_images_model(product.images.all().order_by("sort_order", "id"))
        if incoming_images == existing_images:
            changed_relations.discard("images")

    for field, value in payload.items():
        setattr(product, field, value)

    if not payload.get("update_user"):
        product.update_user = actor

    product.save()
    mark_push_pending(product)
    db_config = source_db_config_for_site(site, site_key=site_key)

    try:
        if descriptions is not None:
            descriptions_to_save = descriptions
            if descriptions:
                existing_desc_rows = list(product.descriptions.all().order_by("language_id", "id"))
                locale_to_language_id = {}
                if db_config:
                    try:
                        locale_to_language_id = fetch_source_language_id_by_locale(db_config) or {}
                    except Exception:
                        logger.warning(
                            "JV_LANGUAGE_MAP_PATCH_FAILED code=jv_language_map_patch_failed site=%s site_key=%s",
                            site,
                            site_key,
                            exc_info=True,
                        )
                if locale_to_language_id:
                    try:
                        descriptions_to_save, _translation_meta = _build_multilang_descriptions_for_site(
                            requested_descriptions=descriptions,
                            existing_descriptions=existing_desc_rows,
                            locale_to_language_id=locale_to_language_id,
                            translation_cache={},
                        )
                    except Exception:
                        logger.warning(
                            "JV_DESCRIPTION_TRANSLATION_PATCH_FAILED code=jv_description_translation_patch_failed ean=%s site=%s site_key=%s",
                            ean,
                            site,
                            site_key,
                            exc_info=True,
                        )

            product.descriptions.all().delete()
            bulk_create_descriptions(product, descriptions_to_save, modified_default=False)

        if categories is not None:
            product.categories.all().delete()
            bulk_create_categories(product, categories)

        if stores is not None:
            product.stores.all().delete()
            bulk_create_stores(product, stores)

        if images is not None:
            product.images.all().delete()
            bulk_create_images(product, images)

        if specials is not None:
            product.specials.all().delete()
            bulk_create_specials(product, specials, modified_default=False)

        # Business rule: product_special.price is derived from product.price.
        # Recalculate specials automatically whenever base price changes.
        if "price" in changed_scalar_fields:
            if apply_special_price_from_product(product):
                changed_relations.add("specials")
            else:
                # Ensure push includes specials even when only creation happened.
                changed_relations.add("specials")
    except IntegrityError as exc:
        payload = {
            "code": "jv_patch_child_conflict",
            "detail": "Patch failed due to conflicting child records.",
            "error": str(exc),
        }
        _finalize_error_if_tracked(
            idem_record,
            status_code=status.HTTP_400_BAD_REQUEST,
            payload=payload,
            error_code="jv_patch_child_conflict",
        )
        return Response(
            {
                "code": "jv_patch_child_conflict",
                "detail": "Patch failed due to conflicting child records.",
                "error": str(exc),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not db_config:
        mark_push_failed(product, "jv_source_db_not_configured")
        payload = {
            "code": "jv_source_db_not_configured",
            "detail": (
                f"Не настроены credentials source DB для site={site}"
                f"{f', site_key={site_key}' if site_key else ''}. "
                "Ожидаются env: JV_SOURCE_<SITE>[_<SITE_KEY>]_DB_HOST/USER/PASSWORD/NAME[/PORT]."
            ),
        }
        _finalize_error_if_tracked(
            idem_record,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            payload=payload,
            error_code="jv_source_db_not_configured",
        )
        return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    try:
        product._jv_fields = payload.get("_jv_fields") if isinstance(payload.get("_jv_fields"), dict) else {}
        push_product_to_source(
            db_config,
            product,
            changed_scalar_fields=changed_scalar_fields,
            changed_relations=changed_relations,
        )
    except Exception as exc:
        if site == ImportedProduct.Site.JV and str(exc).startswith("JV article not found for artikelid="):
            try:
                recreated_source_product_id = int(create_product_in_source(db_config, product))
                ImportedProduct.all_objects.filter(pk=product.pk).update(source_product_id=recreated_source_product_id)
                record_ean_usage(
                    ean=product.ean,
                    site=site,
                    site_key=site_key,
                    product=product,
                    source_product_id=recreated_source_product_id,
                )
                product.refresh_from_db()
                push_product_to_source(
                    db_config,
                    product,
                    changed_scalar_fields=FULL_PUSH_SCALAR_FIELDS,
                    changed_relations=FULL_PUSH_RELATIONS,
                )
            except Exception as recreate_exc:
                logger.exception(
                    "JV_SOURCE_RECREATE_AFTER_MISSING_ARTICLE_FAILED code=jv_source_recreate_after_missing_article_failed ean=%s site=%s site_key=%s",
                    ean,
                    site,
                    site_key,
                )
                mark_push_failed(product, str(recreate_exc))
                payload = {
                    "code": "jv_source_recreate_after_missing_article_failed",
                    "detail": "Patch saved locally but failed to recreate missing source article.",
                    "error": str(recreate_exc),
                }
                _finalize_error_if_tracked(
                    idem_record,
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    payload=payload,
                    error_code="jv_source_recreate_after_missing_article_failed",
                )
                return Response(payload, status=status.HTTP_502_BAD_GATEWAY)
        else:
            logger.exception(
                "JV_SOURCE_PUSH_FAILED code=jv_source_push_failed ean=%s site=%s site_key=%s",
                ean,
                site,
                site_key,
            )
            mark_push_failed(product, str(exc))
            payload = {
                "code": "jv_source_push_failed",
                "detail": "Patch saved locally but failed to push to source site.",
                "error": str(exc),
            }
            _finalize_error_if_tracked(
                idem_record,
                status_code=status.HTTP_502_BAD_GATEWAY,
                payload=payload,
                error_code="jv_source_push_failed",
            )
            return Response(payload, status=status.HTTP_502_BAD_GATEWAY)

    mark_push_pushed(product)

    result = ImportedProductDetailSerializer(product).data
    _finalize_success_if_tracked(idem_record, status_code=status.HTTP_200_OK, payload=result)
    return Response(result, status=status.HTTP_200_OK)


class JVProductCreateByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def handle_exception(self, exc):
        try:
            return super().handle_exception(exc)
        except Exception:  # noqa: BLE001
            logger.exception(
                "JV_SYNC_UNHANDLED_EXCEPTION code=jv_sync_unhandled_exception",
                exc_info=True,
            )
            return Response(
                {
                    "code": "jv_sync_unhandled_exception",
                    "detail": "Unhandled server error during sync-by-ean.",
                    "error": str(exc),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @transaction.atomic
    def post(self, request, ean: str):
        site = _normalize_site(request.query_params.get("site"))
        site_key = _normalize_site_key(request.query_params.get("site_key"))
        if site is None:
            return Response(
                {"detail": "Передайте query-параметр ?site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        idem_record, idem_response = claim_idempotency_or_response(
            request=request,
            scope="jv.sync_by_ean",
            body=_request_body_for_hash(request),
        )
        if idem_response is not None:
            return idem_response

        db_config = source_db_config_for_site(site, site_key=site_key)
        if not db_config:
            payload = {
                "code": "jv_source_db_not_configured",
                "detail": (
                    f"Не настроены credentials source DB для site={site}"
                    f"{f', site_key={site_key}' if site_key else ''}. "
                    "Ожидаются env: JV_SOURCE_<SITE>[_<SITE_KEY>]_DB_HOST/USER/PASSWORD/NAME[/PORT]."
                ),
            }
            finalize_error(
                idem_record,
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                payload=payload,
                error_code="jv_source_db_not_configured",
            )
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            snapshot = fetch_source_product_snapshot_by_ean(db_config, ean.strip())
        except Exception as exc:
            logger.exception(
                "JV_SYNC_SOURCE_FETCH_FAILED code=jv_sync_source_fetch_failed ean=%s site=%s site_key=%s",
                ean,
                site,
                site_key,
            )
            payload = {
                "code": "jv_source_fetch_failed",
                "detail": "Failed to read product from source DB.",
                "error": str(exc),
            }
            finalize_error(
                idem_record,
                status_code=status.HTTP_502_BAD_GATEWAY,
                payload=payload,
                error_code="jv_source_fetch_failed",
            )
            return Response(payload, status=status.HTTP_502_BAD_GATEWAY)
        if not snapshot:
            payload = {
                "code": "jv_source_product_not_found",
                "detail": f"Товар не найден в source DB по указанному ean (site={site}).",
            }
            finalize_error(
                idem_record,
                status_code=status.HTTP_404_NOT_FOUND,
                payload=payload,
                error_code="jv_source_product_not_found",
            )
            return Response(payload, status=status.HTTP_404_NOT_FOUND)

        source_product = snapshot["product"]
        effective_ean = effective_ean_from_source(source_product, fallback=ean.strip())
        safe_date_available = _to_date_or_none(source_product.get("date_available"))
        safe_date_modified = _to_datetime_or_none(source_product.get("date_modified"))
        normalized_site_key = site_key or ""
        existing, conflict_product = resolve_local_product_for_source(
            site=site,
            site_key=normalized_site_key,
            source_product_id=source_product["product_id"],
            effective_ean=effective_ean,
        )
        if conflict_product is not None:
            payload = {
                "code": "jv_local_product_conflict",
                "detail": (
                    "Локальная запись конфликтует с товаром source: одинаковый EAN, "
                    "но другой source product_id. Синхронизация остановлена."
                ),
                "local_id": conflict_product.id,
                "local_source_product_id": conflict_product.source_product_id,
                "source_product_id": source_product["product_id"],
            }
            finalize_error(
                idem_record,
                status_code=status.HTTP_409_CONFLICT,
                payload=payload,
                error_code="jv_local_product_conflict",
            )
            return Response(payload, status=status.HTTP_409_CONFLICT)
        user_create = _session_actor(request)
        is_created = existing is None

        try:
            if is_created:
                product = create_local_product_from_source(
                    site=site,
                    site_key=normalized_site_key,
                    source_product=source_product,
                    effective_ean=effective_ean,
                    safe_date_available=safe_date_available,
                    safe_date_modified=safe_date_modified,
                    actor=user_create,
                )
            else:
                product = update_local_product_from_source(
                    product=existing,
                    source_product=source_product,
                    safe_date_available=safe_date_available,
                    safe_date_modified=safe_date_modified,
                    actor=user_create,
                )
        except IntegrityError as exc:
            payload = {
                "code": "jv_local_upsert_conflict",
                "detail": "Local product upsert failed due to uniqueness conflict.",
                "error": str(exc),
            }
            finalize_error(
                idem_record,
                status_code=status.HTTP_409_CONFLICT,
                payload=payload,
                error_code="jv_local_upsert_conflict",
            )
            return Response(payload, status=status.HTTP_409_CONFLICT)

        try:
            sync_children_from_snapshot(product, snapshot)
        except IntegrityError as exc:
            payload = {
                "code": "jv_sync_child_conflict",
                "detail": "Sync failed due to conflicting child records.",
                "error": str(exc),
            }
            finalize_error(
                idem_record,
                status_code=status.HTTP_400_BAD_REQUEST,
                payload=payload,
                error_code="jv_sync_child_conflict",
            )
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception(
                "JV_SYNC_CHILDREN_FAILED code=jv_sync_children_failed ean=%s site=%s site_key=%s",
                ean,
                site,
                site_key,
            )
            payload = {
                "code": "jv_sync_children_failed",
                "detail": "Sync failed while processing source child data.",
                "error": str(exc),
            }
            finalize_error(
                idem_record,
                status_code=status.HTTP_400_BAD_REQUEST,
                payload=payload,
                error_code="jv_sync_children_failed",
            )
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        result = ImportedProductDetailSerializer(product).data
        if site == ImportedProduct.Site.JV:
            result["jv_fields"] = snapshot.get("jv_fields") if isinstance(snapshot.get("jv_fields"), dict) else None
        response_payload = {
            "created": is_created,
            "updated": not is_created,
            "item": result,
        }
        response_status = status.HTTP_201_CREATED if is_created else status.HTTP_200_OK
        finalize_success(idem_record, status_code=response_status, payload=response_payload)
        return Response(response_payload, status=response_status)


class JVProductCreateAndPushAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request, site: str | None = None, site_key: str | None = None):
        site = _normalize_site(request.query_params.get("site") or site)
        site_key = _normalize_site_key(request.query_params.get("site_key") or site_key) or ""
        if site is None:
            return Response(
                {"detail": "Передайте query-параметр ?site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return create_and_push_jv_product(
            site=site,
            site_key=site_key,
            payload_data=request.data or {},
            actor=_session_actor(request),
        )


@transaction.atomic
def create_and_push_jv_product(*, site: str, site_key: str, payload_data: dict, actor: str) -> Response:
    """Create a new JV product locally and push it to the source site.

    Extracted from ``JVProductCreateAndPushAPIView.post`` so the background
    create-job worker can reuse the exact same create-and-push code path
    without going through HTTP. Returns the same DRF ``Response`` objects as
    the view; callers outside request context can read ``.status_code`` and
    ``.data``.
    """
    serializer = ImportedProductCreateSerializer(data=payload_data or {})
    serializer.is_valid(raise_exception=True)
    payload = serializer.validated_data
    _apply_direct_jv_translation_to_payload(payload=payload, site_key=site_key)
    _apply_currency_conversion_to_payload(payload=payload, site_key=site_key)
    _apply_sofort_content_transforms(payload=payload, site=site, site_key=site_key)
    apply_jv_fields_to_payload(payload, site=site)

    ean, source_product_id, temporary_source_product_id, identity_response = prepare_create_identity(
        site=site,
        site_key=site_key,
        payload=payload,
        actor=actor,
    )
    if identity_response is not None:
        return identity_response

    product = create_local_product_from_payload(
        site=site,
        site_key=site_key,
        source_product_id=source_product_id,
        ean=ean,
        payload=payload,
        actor=actor,
    )
    record_ean_usage(
        ean=ean,
        site=site,
        site_key=site_key,
        product=product,
        source_product_id=source_product_id,
    )

    create_payload_children(product, payload)

    db_config = source_db_config_for_site(site, site_key=site_key)
    if not db_config:
        mark_push_failed(product, "jv_source_db_not_configured")
        return Response(
            {
                "code": "jv_source_db_not_configured",
                "detail": (
                    f"Не настроены credentials source DB для site={site}"
                    f"{f', site_key={site_key}' if site_key else ''}. "
                    "Ожидаются env: JV_SOURCE_<SITE>[_<SITE_KEY>]_DB_HOST/USER/PASSWORD/NAME[/PORT]."
                ),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if temporary_source_product_id:
        try:
            new_source_product_id = create_product_in_source(db_config, product)
        except Exception as exc:
            mark_push_failed(product, str(exc))
            return Response(
                {
                    "code": "jv_source_insert_failed",
                    "detail": "Локальный товар создан, но insert нового товара в source DB не удался.",
                    "error": str(exc),
                    "created_locally": True,
                    "local_id": product.id,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        source_product_id = int(new_source_product_id)
        ImportedProduct.all_objects.filter(pk=product.pk).update(source_product_id=source_product_id)
        record_ean_usage(
            ean=ean,
            site=site,
            site_key=site_key,
            product=product,
            source_product_id=source_product_id,
        )
        product.refresh_from_db()

    source_snapshot = fetch_source_product_snapshot_by_product_id(db_config, int(source_product_id))
    if not source_snapshot:
        mark_push_failed(product, "jv_source_product_not_found_by_id")
        return Response(
            {
                "code": "jv_source_product_not_found_by_id",
                "detail": "В source DB не найден product_id для push. Товар создан локально, но не опубликован.",
                "created_locally": True,
                "local_id": product.id,
                "source_product_id": source_product_id,
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        product._jv_fields = payload.get("_jv_fields") if isinstance(payload.get("_jv_fields"), dict) else {}
        push_product_to_source(
            db_config,
            product,
            changed_scalar_fields=FULL_PUSH_SCALAR_FIELDS,
            changed_relations=FULL_PUSH_RELATIONS,
        )
    except Exception as exc:
        mark_push_failed(product, str(exc))
        return Response(
            {
                "code": "jv_source_push_failed",
                "detail": "Товар создан локально, но push в source DB не удался.",
                "error": str(exc),
                "created_locally": True,
                "local_id": product.id,
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    mark_push_pushed(product)
    return Response(
        {
            "created": True,
            "pushed": True,
            "item": ImportedProductDetailSerializer(product).data,
            "ean_auto_assigned": not bool(str(payload.get("ean") or "").strip()),
        },
        status=status.HTTP_201_CREATED,
    )


class JVProductCreateAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @transaction.atomic
    def post(self, request):
        site = _normalize_site(request.query_params.get("site"))
        site_key = _normalize_site_key(request.query_params.get("site_key")) or ""
        if site is None:
            return Response(
                {"detail": "Передайте query-параметр ?site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ImportedProductCreateSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        _apply_direct_jv_translation_to_payload(payload=payload, site_key=site_key)
        apply_jv_fields_to_payload(payload, site=site)

        actor = _session_actor(request)
        ean, source_product_id, temporary_source_product_id, identity_response = prepare_create_identity(
            site=site,
            site_key=site_key,
            payload=payload,
            actor=actor,
        )
        if identity_response is not None:
            return identity_response

        product = create_local_product_from_payload(
            site=site,
            site_key=site_key,
            source_product_id=source_product_id,
            ean=ean,
            payload=payload,
            actor=actor,
        )
        record_ean_usage(ean=ean, site=site, site_key=site_key, product=product)

        create_payload_children(product, payload)

        result = ImportedProductDetailSerializer(product).data
        return Response(
            {
                "created": True,
                "item": result,
                "temporary_source_product_id": temporary_source_product_id,
                "ean_auto_assigned": not bool(str(payload.get("ean") or "").strip()),
            },
            status=status.HTTP_201_CREATED,
        )
