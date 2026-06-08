import logging

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.idempotency import (
    finalize_error,
    finalize_success,
)
from database.permissions import SessionRolePermission

from .batch_service import _build_multilang_descriptions_for_site
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

        product, error_response = _resolve_product_by_ean(ean, site, site_key)
        if error_response is not None:
            finalize_error(
                idem_record,
                status_code=error_response.status_code,
                payload=error_response.data if isinstance(error_response.data, dict) else {"detail": str(error_response.data)},
                error_code="jv_product_not_found_or_invalid_site",
            )
            return error_response

        serializer = ImportedProductPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
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
            product.update_user = _session_actor(request)

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
            finalize_error(
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
            finalize_error(
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
            finalize_error(
                idem_record,
                status_code=status.HTTP_502_BAD_GATEWAY,
                payload=payload,
                error_code="jv_source_push_failed",
            )
            return Response(payload, status=status.HTTP_502_BAD_GATEWAY)

        mark_push_pushed(product)

        result = ImportedProductDetailSerializer(product).data
        finalize_success(idem_record, status_code=status.HTTP_200_OK, payload=result)
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

    @transaction.atomic
    def post(self, request, site: str | None = None, site_key: str | None = None):
        site = _normalize_site(request.query_params.get("site") or site)
        site_key = _normalize_site_key(request.query_params.get("site_key") or site_key) or ""
        if site is None:
            return Response(
                {"detail": "Передайте query-параметр ?site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ImportedProductCreateSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
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
