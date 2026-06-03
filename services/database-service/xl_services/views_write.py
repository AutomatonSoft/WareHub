from __future__ import annotations

import logging
from datetime import date, datetime

from django.db import IntegrityError, models, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.idempotency import (
    build_request_hash,
    claim_or_replay,
    derive_idem_key,
    finalize_error,
    finalize_success,
)
from database.models import EANPool, EANUsage
from database.permissions import SessionRolePermission
from xl_services.models import (
    ImportedProduct,
    ImportedProductCategory,
    ImportedProductDescription,
    ImportedProductImage,
    ImportedProductSpecial,
    ImportedProductStore,
)
from xl_services.fields import XL_RELATION_FIELDS, XL_SOURCE_PUSH_SCALAR_FIELDS
from xl_services.views_common import force_xl_site as _force_xl_site, normalize_site_key as _normalize_site_key
from xl_services.serializers import (
    ImportedProductCreateSerializer,
    ImportedProductDetailSerializer,
    ImportedProductPatchSerializer,
)
from xl_services.source_client import (
    create_xl_product_in_source,
    fetch_xl_product_snapshot_by_product_id,
    fetch_xl_product_snapshot_by_ean,
    fetch_xl_language_id_by_locale,
    push_xl_product_to_source,
    source_db_config_for_xl,
)
from xl_services.batch_config import (
    DEFAULT_LANGUAGE_ID_BY_LOCALE,
    convert_amount as convert_xl_amount,
    infer_currency as infer_xl_currency,
    infer_locale as infer_xl_locale,
)
from xl_services.sync_utils import (
    effective_xl_ean_from_source,
    resolve_xl_local_product_for_source,
    sync_xl_children_from_snapshot,
)
from xl_services.batch_translation import (
    CYRILLIC_RE,
    TRANSLATABLE_FIELDS,
    detect_language_from_texts,
    language_map_for_site,
    safe_translate_fields,
)
from xl_services.batch_service import _build_multilang_descriptions_for_site
from xl_services.price_rules import apply_special_price_from_product
from xl_services.source_config import DEFAULT_XL_SITE_DOMAINS

logger = logging.getLogger(__name__)

XL_CREATE_CONTROL_FIELDS = {
    "translate_texts",
    "translation_source",
    "translation_source_language",
    "locale_by_site_key",
    "language_id_by_locale",
    "convert_currency",
    "source_currency",
    "currency_by_site_key",
}
XL_CREATE_TRANSLATION_CACHE: dict[tuple[str, str, str], dict] = {}


def _session_actor(request) -> str:
    return str(
        request.session.get("username")
        or request.session.get("user")
        or request.session.get("email")
        or request.session.get("role")
        or "system_import"
    )


def _request_body_for_hash(request):
    data = getattr(request, "data", None)
    if data is None:
        return {}
    if isinstance(data, dict):
        return data
    if hasattr(data, "dict"):
        return data.dict()
    return str(data)


def _to_date_or_none(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text or text.startswith("0000-00-00"):
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _to_datetime_or_none(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    text = str(value).strip()
    if not text or text.startswith("0000-00-00"):
        return None
    normalized = text.replace(" ", "T")
    try:
        return datetime.fromisoformat(normalized[:19])
    except ValueError:
        return None


def _next_temp_source_product_id(site: str, site_key: str) -> int:
    min_value = (
        ImportedProduct.all_objects.filter(site=site, site_key=site_key)
        .aggregate(models.Min("source_product_id"))
        .get("source_product_id__min")
    )
    if min_value is None or int(min_value) >= 0:
        return -1
    return int(min_value) - 1


def _ensure_default_store(product: ImportedProduct) -> bool:
    if product.stores.exists():
        return False
    ImportedProductStore.objects.get_or_create(product=product, store_id=0)
    return True


def _pop_xl_create_controls(payload: dict) -> dict:
    controls = {}
    for field in XL_CREATE_CONTROL_FIELDS:
        if field in payload:
            controls[field] = payload.pop(field)
    return controls


def _first_description_source(payload: dict) -> dict:
    descriptions = payload.get("descriptions") or []
    if not descriptions:
        return {}
    first = descriptions[0] or {}
    return {key: str(first.get(key) or "") for key in TRANSLATABLE_FIELDS if str(first.get(key) or "").strip()}


def _localized_xl_create_payload(*, payload: dict, controls: dict, site_key: str, db_config: dict | None) -> dict:
    result = dict(payload)
    site_key_norm = str(site_key or "").strip().upper()
    domain = DEFAULT_XL_SITE_DOMAINS.get(site_key_norm, site_key_norm.lower())

    if controls.get("convert_currency") and result.get("price") is not None:
        source_currency = str(controls.get("source_currency") or "EUR").strip().upper()
        target_currency = infer_xl_currency(
            site_key=site_key_norm,
            domain=domain,
            source_currency=source_currency,
            currency_by_site_key=controls.get("currency_by_site_key") or {},
        )
        result["price"] = convert_xl_amount(
            amount=result.get("price"),
            from_currency=source_currency,
            to_currency=target_currency,
        )

    if controls.get("translate_texts"):
        source_fields = controls.get("translation_source") or _first_description_source(result)
        if source_fields:
            target_locale = infer_xl_locale(
                site_key=site_key_norm,
                domain=domain,
                locale_by_site_key=controls.get("locale_by_site_key") or {},
            )
            language_id_by_locale = language_map_for_site(
                site_key=site_key_norm,
                db_config=db_config,
                cache={},
                language_id_by_locale_override=controls.get("language_id_by_locale") or {},
            )
            target_language_id = int(
                language_id_by_locale.get(
                    target_locale,
                    DEFAULT_LANGUAGE_ID_BY_LOCALE.get(target_locale, 1),
                )
            )
            source_language = str(controls.get("translation_source_language") or "auto").strip().lower()
            if not source_language or source_language == "auto":
                source_language = detect_language_from_texts(source_fields=source_fields)

            if target_locale and target_locale != source_language:
                translated_fields, _used, _errors = safe_translate_fields(
                    source_fields=source_fields,
                    source_lang=source_language,
                    target_lang=target_locale,
                    translation_cache=XL_CREATE_TRANSLATION_CACHE,
                )
            else:
                translated_fields = dict(source_fields)

            if target_locale != "ru" and CYRILLIC_RE.search(str(translated_fields.get("name") or "")):
                raise RuntimeError(
                    f"xl_translation_failed_source_script_remaining site_key={site_key_norm} target_locale={target_locale}"
                )

            description_payload = {
                "name": translated_fields.get("name", "") or "",
                "description": translated_fields.get("description", "") or "",
                "tag": translated_fields.get("tag", "") or "",
                "meta_title": translated_fields.get("meta_title", "") or "",
                "meta_description": translated_fields.get("meta_description", "") or "",
                "meta_keyword": translated_fields.get("meta_keyword", "") or "",
            }
            description_rows = [{"language_id": target_language_id, **description_payload}]
            if target_language_id != 1:
                description_rows.insert(0, {"language_id": 1, **description_payload})
            result["descriptions"] = description_rows

    return result


def _take_free_ean_from_pool(*, site: str, site_key: str, actor: str) -> tuple[str | None, str | None]:
    pool_item = (
        EANPool.objects.select_for_update()
        .filter(status="free")
        .order_by("ean", "id")
        .first()
    )
    if pool_item is None:
        return None, "xl_ean_pool_empty"
    pool_item.status = "used"
    pool_item.reserved_by = str(actor or "")
    pool_item.reserved_at = timezone.now()
    pool_item.used_at = timezone.now()
    pool_item.save(update_fields=["status", "reserved_by", "reserved_at", "used_at", "updated_at"])
    EANUsage.objects.update_or_create(ean=pool_item, site=site, site_key=site_key, defaults={})
    return str(pool_item.ean), None


class XLProductCreateAndPushAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @transaction.atomic
    def post(self, request):
        _force_xl_site(request)
        site = ImportedProduct.Site.XL
        site_key = _normalize_site_key(request.query_params.get("site_key")) or ""

        serializer = ImportedProductCreateSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        controls = _pop_xl_create_controls(payload)
        db_config = source_db_config_for_xl(site_key=site_key)
        payload = _localized_xl_create_payload(
            payload=payload,
            controls=controls,
            site_key=site_key,
            db_config=db_config,
        )

        actor = _session_actor(request)
        ean = str(payload.get("ean") or "").strip()
        if not ean:
            ean, pool_error = _take_free_ean_from_pool(site=site, site_key=site_key, actor=actor)
            if pool_error:
                return Response({"code": pool_error, "detail": "Свободные EAN в пуле закончились."}, status=status.HTTP_409_CONFLICT)

        provided_source_product_id = payload.get("source_product_id")
        temporary_source_product_id = provided_source_product_id is None
        source_product_id = _next_temp_source_product_id(site, site_key) if temporary_source_product_id else int(provided_source_product_id)

        ean_conflict = ImportedProduct.all_objects.filter(site=site, site_key=site_key, ean=ean).first()
        if ean_conflict:
            return Response(
                {"code": "xl_create_ean_conflict", "detail": "Товар с таким EAN уже существует для выбранного site/site_key.", "local_id": ean_conflict.id},
                status=status.HTTP_409_CONFLICT,
            )
        source_id_conflict = ImportedProduct.all_objects.filter(site=site, site_key=site_key, source_product_id=source_product_id).first()
        if source_id_conflict:
            return Response(
                {"code": "xl_create_source_product_id_conflict", "detail": "source_product_id уже занят для выбранного site/site_key.", "local_id": source_id_conflict.id},
                status=status.HTTP_409_CONFLICT,
            )

        now = timezone.now()
        product = ImportedProduct.objects.create(
            site=site,
            site_key=site_key,
            source_product_id=source_product_id,
            ean=ean,
            source_model=str(payload.get("source_model") or "").strip(),
            source_sku=str(payload.get("source_sku") or "").strip(),
            source_ean_field=str(payload.get("source_ean_field") or "").strip(),
            price=payload.get("price"),
            quantity=payload.get("quantity"),
            status=bool(payload.get("status", False)),
            manufacturer_id=payload.get("manufacturer_id"),
            stock_status_id=payload.get("stock_status_id"),
            tax_class_id=payload.get("tax_class_id"),
            shipping=bool(payload.get("shipping", True)),
            subtract=bool(payload.get("subtract", True)),
            minimum=payload.get("minimum"),
            points=payload.get("points"),
            sort_order=payload.get("sort_order"),
            seo_url=str(payload.get("seo_url") or "").strip(),
            image=str(payload.get("image") or "").strip(),
            date_available=payload.get("date_available"),
            date_modified_in_source=None,
            is_modified_locally=True,
            is_pushed_to_source=False,
            local_save_status=ImportedProduct.LocalSaveStatus.SAVED,
            source_push_status=ImportedProduct.SourcePushStatus.PENDING,
            source_push_error="",
            last_imported_at=now,
            last_pushed_at=None,
            user_create=str(actor),
            update_user=str(actor),
        )

        pool_item = EANPool.objects.filter(ean=ean).first()
        if pool_item is not None:
            EANUsage.objects.update_or_create(
                ean=pool_item,
                site=site,
                site_key=site_key,
                defaults={"local_product_id": product.id, "source_product_id": source_product_id},
            )

        descriptions = payload.get("descriptions") or []
        if descriptions:
            ImportedProductDescription.objects.bulk_create(
                [
                    ImportedProductDescription(
                        product=product,
                        language_id=int(item["language_id"]),
                        name=str(item.get("name") or ""),
                        description=str(item.get("description") or ""),
                        tag=str(item.get("tag") or ""),
                        meta_title=str(item.get("meta_title") or ""),
                        meta_description=str(item.get("meta_description") or ""),
                        meta_keyword=str(item.get("meta_keyword") or ""),
                        is_modified_locally=bool(item.get("is_modified_locally", True)),
                    )
                    for item in descriptions
                ]
            )
        categories = payload.get("categories") or []
        if categories:
            ImportedProductCategory.objects.bulk_create(
                [ImportedProductCategory(product=product, category_id=int(item["category_id"]), main_category=bool(item.get("main_category", False))) for item in categories],
                ignore_conflicts=True,
            )
        stores = payload.get("stores") or [{"store_id": 0}]
        ImportedProductStore.objects.bulk_create([ImportedProductStore(product=product, store_id=int(item["store_id"])) for item in stores], ignore_conflicts=True)
        images = payload.get("images") or []
        if images:
            ImportedProductImage.objects.bulk_create(
                [ImportedProductImage(product=product, image=str(item.get("image") or "").strip(), sort_order=int(item.get("sort_order") or 0)) for item in images]
            )
        specials = payload.get("specials") or []
        if specials:
            ImportedProductSpecial.objects.bulk_create(
                [
                    ImportedProductSpecial(
                        product=product,
                        customer_group_id=int(item.get("customer_group_id", 1)),
                        priority=int(item.get("priority", 0)),
                        price=item["price"],
                        date_start=item.get("date_start"),
                        date_end=item.get("date_end"),
                        is_modified_locally=bool(item.get("is_modified_locally", True)),
                    )
                    for item in specials
                ]
            )

        if not db_config:
            ImportedProduct.all_objects.filter(pk=product.pk).update(
                source_push_status=ImportedProduct.SourcePushStatus.FAILED,
                source_push_error="xl_source_db_not_configured",
            )
            return Response({"code": "xl_source_db_not_configured", "detail": "Не настроены credentials source DB для XL."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if temporary_source_product_id:
            try:
                new_source_product_id = create_xl_product_in_source(db_config, product)
            except Exception as exc:  # noqa: BLE001
                ImportedProduct.all_objects.filter(pk=product.pk).update(source_push_status=ImportedProduct.SourcePushStatus.FAILED, source_push_error=str(exc))
                return Response(
                    {
                        "code": "xl_source_insert_failed",
                        "detail": "Локальный товар создан, но insert нового товара в source DB не удался.",
                        "error": str(exc),
                        "created_locally": True,
                        "local_id": product.id,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            source_product_id = int(new_source_product_id)
            ImportedProduct.all_objects.filter(pk=product.pk).update(source_product_id=source_product_id)
            if pool_item is not None:
                EANUsage.objects.update_or_create(
                    ean=pool_item,
                    site=site,
                    site_key=site_key,
                    defaults={"local_product_id": product.id, "source_product_id": source_product_id},
                )
            product.refresh_from_db()

        source_snapshot = fetch_xl_product_snapshot_by_product_id(db_config, int(source_product_id))
        if not source_snapshot:
            try:
                new_source_product_id = create_xl_product_in_source(db_config, product)
            except Exception as exc:  # noqa: BLE001
                ImportedProduct.all_objects.filter(pk=product.pk).update(
                    source_push_status=ImportedProduct.SourcePushStatus.FAILED,
                    source_push_error=str(exc),
                )
                return Response(
                    {
                        "code": "xl_source_insert_failed",
                        "detail": "В source DB не найден product_id для push, затем insert нового товара в source DB не удался.",
                        "error": str(exc),
                        "created_locally": True,
                        "local_id": product.id,
                        "source_product_id": source_product_id,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            old_source_product_id = source_product_id
            source_product_id = int(new_source_product_id)
            ImportedProduct.all_objects.filter(pk=product.pk).update(source_product_id=source_product_id)
            if pool_item is not None:
                EANUsage.objects.update_or_create(
                    ean=pool_item,
                    site=site,
                    site_key=site_key,
                    defaults={"local_product_id": product.id, "source_product_id": source_product_id},
                )
            product.refresh_from_db()
            logger.warning(
                "XL_CREATE_SOURCE_ID_NOT_FOUND_INSERTED_NEW code=xl_create_source_id_not_found_inserted_new local_id=%s old_source_product_id=%s new_source_product_id=%s",
                product.id,
                old_source_product_id,
                source_product_id,
            )

        try:
            push_xl_product_to_source(
                db_config,
                product,
                changed_scalar_fields=set(XL_SOURCE_PUSH_SCALAR_FIELDS),
                changed_relations=set(XL_RELATION_FIELDS),
            )
        except Exception as exc:  # noqa: BLE001
            ImportedProduct.all_objects.filter(pk=product.pk).update(source_push_status=ImportedProduct.SourcePushStatus.FAILED, source_push_error=str(exc))
            return Response(
                {
                    "code": "xl_source_push_failed",
                    "detail": "Товар создан локально, но push в source DB не удался.",
                    "error": str(exc),
                    "created_locally": True,
                    "local_id": product.id,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        ImportedProduct.all_objects.filter(pk=product.pk).update(
            is_pushed_to_source=True,
            last_pushed_at=timezone.now(),
            source_push_status=ImportedProduct.SourcePushStatus.PUSHED,
            source_push_error="",
        )
        product.refresh_from_db()
        return Response(
            {
                "created": True,
                "pushed": True,
                "item": ImportedProductDetailSerializer(product).data,
                "ean_auto_assigned": not bool(str(payload.get("ean") or "").strip()),
            },
            status=status.HTTP_201_CREATED,
        )


class XLProductUpdateByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @transaction.atomic
    def patch(self, request, ean: str):
        _force_xl_site(request)
        site = ImportedProduct.Site.XL
        site_key = _normalize_site_key(request.query_params.get("site_key"))

        request_hash = build_request_hash(
            method=request.method,
            path=request.path,
            query=dict(request.query_params),
            body=_request_body_for_hash(request),
        )
        idem_key = derive_idem_key(request, request_hash)
        idem_state, idem_record = claim_or_replay(
            scope="xl.update_by_ean",
            idem_key=idem_key,
            request_hash=request_hash,
        )
        if idem_state == "replay":
            return Response(idem_record.response_payload, status=idem_record.status_code or status.HTTP_200_OK)
        if idem_state == "processing":
            return Response({"code": "xl_idempotency_in_progress", "detail": "Request with same idempotency key is in progress."}, status=status.HTTP_409_CONFLICT)
        if idem_state == "conflict":
            return Response({"code": "xl_idempotency_key_conflict", "detail": "Idempotency key reused with different payload."}, status=status.HTTP_409_CONFLICT)

        normalized_site_key = site_key or ""
        product = ImportedProduct.objects.filter(site=site, site_key=normalized_site_key, ean=ean.strip()).first()
        if product is None:
            payload = {"detail": "Товар с таким ean не найден."}
            finalize_error(idem_record, status_code=status.HTTP_404_NOT_FOUND, payload=payload, error_code="xl_product_not_found")
            return Response(payload, status=status.HTTP_404_NOT_FOUND)

        serializer = ImportedProductPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        controls = _pop_xl_create_controls(payload)
        db_config = source_db_config_for_xl(site_key=site_key)
        payload = _localized_xl_create_payload(
            payload=payload,
            controls=controls,
            site_key=site_key,
            db_config=db_config,
        )
        descriptions_are_localized = bool(controls.get("translate_texts"))
        changed_scalar_fields = set(payload.keys()) - set(XL_RELATION_FIELDS)

        descriptions = payload.pop("descriptions", None)
        categories = payload.pop("categories", None)
        stores = payload.pop("stores", None)
        images = payload.pop("images", None)
        specials = payload.pop("specials", None)
        changed_relations = {name for name, value in (("descriptions", descriptions), ("categories", categories), ("stores", stores), ("images", images), ("specials", specials)) if value is not None}

        for field, value in payload.items():
            setattr(product, field, value)
        if not payload.get("update_user"):
            product.update_user = _session_actor(request)
        product.save()
        ImportedProduct.all_objects.filter(pk=product.pk).update(local_save_status=ImportedProduct.LocalSaveStatus.SAVED, source_push_status=ImportedProduct.SourcePushStatus.PENDING, source_push_error="")

        try:
            if descriptions is not None:
                descriptions_to_save = descriptions
                if descriptions and db_config and not descriptions_are_localized:
                    existing_desc_rows = list(product.descriptions.all().order_by("language_id", "id"))
                    locale_to_language_id = fetch_xl_language_id_by_locale(db_config) or {}
                    if locale_to_language_id:
                        descriptions_to_save, _ = _build_multilang_descriptions_for_site(
                            requested_descriptions=descriptions,
                            existing_descriptions=existing_desc_rows,
                            locale_to_language_id=locale_to_language_id,
                            translation_cache={},
                        )
                product.descriptions.all().delete()
                ImportedProductDescription.objects.bulk_create([
                    ImportedProductDescription(
                        product=product,
                        language_id=item["language_id"],
                        name=item["name"],
                        description=item.get("description", ""),
                        tag=item.get("tag", ""),
                        meta_title=item.get("meta_title", ""),
                        meta_description=item.get("meta_description", ""),
                        meta_keyword=item.get("meta_keyword", ""),
                        is_modified_locally=item.get("is_modified_locally", False),
                    )
                    for item in descriptions_to_save
                ], ignore_conflicts=True)

            if categories is not None:
                product.categories.all().delete()
                ImportedProductCategory.objects.bulk_create(
                    [ImportedProductCategory(product=product, category_id=item["category_id"], main_category=bool(item.get("main_category", False))) for item in categories],
                    ignore_conflicts=True,
                )
            if stores is not None:
                product.stores.all().delete()
                stores_to_save = stores or [{"store_id": 0}]
                ImportedProductStore.objects.bulk_create([ImportedProductStore(product=product, store_id=item["store_id"]) for item in stores_to_save], ignore_conflicts=True)
            if images is not None:
                product.images.all().delete()
                ImportedProductImage.objects.bulk_create([ImportedProductImage(product=product, image=item["image"], sort_order=item.get("sort_order", 0)) for item in images])
            if specials is not None:
                product.specials.all().delete()
                ImportedProductSpecial.objects.bulk_create([
                    ImportedProductSpecial(
                        product=product,
                        customer_group_id=item.get("customer_group_id", 1),
                        priority=item.get("priority", 0),
                        price=item["price"],
                        date_start=item.get("date_start"),
                        date_end=item.get("date_end"),
                        is_modified_locally=item.get("is_modified_locally", False),
                    )
                    for item in specials
                ])
            if "price" in changed_scalar_fields:
                apply_special_price_from_product(product)
                changed_relations.add("specials")
            if stores is None and _ensure_default_store(product):
                changed_relations.add("stores")
        except IntegrityError as exc:
            err = {"code": "xl_patch_child_conflict", "detail": "Patch failed due to conflicting child records.", "error": str(exc)}
            finalize_error(idem_record, status_code=status.HTTP_400_BAD_REQUEST, payload=err, error_code="xl_patch_child_conflict")
            return Response(err, status=status.HTTP_400_BAD_REQUEST)

        if not db_config:
            err = {"code": "xl_source_db_not_configured", "detail": "Не настроены credentials source DB для XL."}
            finalize_error(idem_record, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, payload=err, error_code="xl_source_db_not_configured")
            return Response(err, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        source_snapshot = fetch_xl_product_snapshot_by_product_id(db_config, int(product.source_product_id))
        if not source_snapshot:
            try:
                new_source_product_id = create_xl_product_in_source(db_config, product)
            except Exception as exc:  # noqa: BLE001
                ImportedProduct.all_objects.filter(pk=product.pk).update(
                    source_push_status=ImportedProduct.SourcePushStatus.FAILED,
                    source_push_error=str(exc),
                )
                err = {
                    "code": "xl_source_insert_failed",
                    "detail": "В source DB не найден product_id для push, затем insert нового товара в source DB не удался.",
                    "error": str(exc),
                    "local_id": product.id,
                    "source_product_id": product.source_product_id,
                }
                finalize_error(idem_record, status_code=status.HTTP_502_BAD_GATEWAY, payload=err, error_code="xl_source_insert_failed")
                return Response(err, status=status.HTTP_502_BAD_GATEWAY)
            old_source_product_id = product.source_product_id
            ImportedProduct.all_objects.filter(pk=product.pk).update(source_product_id=int(new_source_product_id))
            product.refresh_from_db()
            logger.warning(
                "XL_UPDATE_SOURCE_ID_NOT_FOUND_INSERTED_NEW code=xl_update_source_id_not_found_inserted_new local_id=%s old_source_product_id=%s new_source_product_id=%s",
                product.id,
                old_source_product_id,
                product.source_product_id,
            )

        try:
            push_xl_product_to_source(db_config, product, changed_scalar_fields=changed_scalar_fields, changed_relations=changed_relations)
        except Exception as exc:  # noqa: BLE001
            logger.exception("XL_SOURCE_PUSH_FAILED code=xl_source_push_failed ean=%s site_key=%s", ean, site_key)
            ImportedProduct.all_objects.filter(pk=product.pk).update(source_push_status=ImportedProduct.SourcePushStatus.FAILED, source_push_error=str(exc))
            err = {"code": "xl_source_push_failed", "detail": "Patch saved locally but failed to push to XL source site.", "error": str(exc)}
            finalize_error(idem_record, status_code=status.HTTP_502_BAD_GATEWAY, payload=err, error_code="xl_source_push_failed")
            return Response(err, status=status.HTTP_502_BAD_GATEWAY)

        ImportedProduct.all_objects.filter(pk=product.pk).update(
            is_pushed_to_source=True,
            last_pushed_at=timezone.now(),
            source_push_status=ImportedProduct.SourcePushStatus.PUSHED,
            source_push_error="",
        )
        product.refresh_from_db()
        result = ImportedProductDetailSerializer(product).data
        finalize_success(idem_record, status_code=status.HTTP_200_OK, payload=result)
        return Response(result, status=status.HTTP_200_OK)


class XLProductSyncByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @transaction.atomic
    def post(self, request, ean: str):
        _force_xl_site(request)
        site = ImportedProduct.Site.XL
        site_key = _normalize_site_key(request.query_params.get("site_key"))
        request_hash = build_request_hash(method=request.method, path=request.path, query=dict(request.query_params), body=_request_body_for_hash(request))
        idem_key = derive_idem_key(request, request_hash)
        idem_state, idem_record = claim_or_replay(scope="xl.sync_by_ean", idem_key=idem_key, request_hash=request_hash)
        if idem_state == "replay":
            return Response(idem_record.response_payload, status=idem_record.status_code or status.HTTP_200_OK)
        if idem_state == "processing":
            return Response({"code": "xl_idempotency_in_progress", "detail": "Request with same idempotency key is in progress."}, status=status.HTTP_409_CONFLICT)
        if idem_state == "conflict":
            return Response({"code": "xl_idempotency_key_conflict", "detail": "Idempotency key reused with different payload."}, status=status.HTTP_409_CONFLICT)

        db_config = source_db_config_for_xl(site_key=site_key)
        if not db_config:
            payload = {"code": "xl_source_db_not_configured", "detail": "Не настроены credentials source DB для XL."}
            finalize_error(idem_record, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, payload=payload, error_code="xl_source_db_not_configured")
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        try:
            snapshot = fetch_xl_product_snapshot_by_ean(db_config, ean.strip())
        except Exception as exc:  # noqa: BLE001
            payload = {"code": "xl_source_fetch_failed", "detail": "Failed to read product from XL source DB.", "error": str(exc)}
            finalize_error(idem_record, status_code=status.HTTP_502_BAD_GATEWAY, payload=payload, error_code="xl_source_fetch_failed")
            return Response(payload, status=status.HTTP_502_BAD_GATEWAY)
        if not snapshot:
            payload = {"code": "xl_source_product_not_found", "detail": "Товар не найден в XL source DB по указанному ean."}
            finalize_error(idem_record, status_code=status.HTTP_404_NOT_FOUND, payload=payload, error_code="xl_source_product_not_found")
            return Response(payload, status=status.HTTP_404_NOT_FOUND)

        source_product = snapshot["product"]
        effective_ean = effective_xl_ean_from_source(source_product, fallback=ean.strip())
        safe_date_available = _to_date_or_none(source_product.get("date_available"))
        safe_date_modified = _to_datetime_or_none(source_product.get("date_modified"))
        normalized_site_key = site_key or ""
        existing, conflict_product = resolve_xl_local_product_for_source(
            site=site,
            site_key=normalized_site_key,
            source_product_id=source_product["product_id"],
            effective_ean=effective_ean,
        )
        if conflict_product is not None:
            payload = {
                "code": "xl_local_product_conflict",
                "detail": "Локальная запись конфликтует с товаром source: одинаковый EAN, но другой source product_id.",
                "local_id": conflict_product.id,
                "local_source_product_id": conflict_product.source_product_id,
                "source_product_id": source_product["product_id"],
            }
            finalize_error(idem_record, status_code=status.HTTP_409_CONFLICT, payload=payload, error_code="xl_local_product_conflict")
            return Response(payload, status=status.HTTP_409_CONFLICT)

        actor = _session_actor(request)
        is_created = existing is None
        try:
            if is_created:
                product = ImportedProduct.objects.create(
                    site=site,
                    site_key=normalized_site_key,
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
                    local_save_status=ImportedProduct.LocalSaveStatus.SAVED,
                    source_push_status=ImportedProduct.SourcePushStatus.PENDING,
                    source_push_error="",
                    last_imported_at=timezone.now(),
                    user_create=str(actor),
                    update_user="",
                )
            else:
                product = existing
                ImportedProduct.all_objects.filter(pk=product.pk).update(
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
                    local_save_status=ImportedProduct.LocalSaveStatus.SAVED,
                    source_push_status=ImportedProduct.SourcePushStatus.PENDING,
                    source_push_error="",
                    last_imported_at=timezone.now(),
                    update_user=str(actor),
                    updated_at=timezone.now(),
                )
                product.refresh_from_db()
        except IntegrityError as exc:
            payload = {"code": "xl_local_upsert_conflict", "detail": "Local product upsert failed due to uniqueness conflict.", "error": str(exc)}
            finalize_error(idem_record, status_code=status.HTTP_409_CONFLICT, payload=payload, error_code="xl_local_upsert_conflict")
            return Response(payload, status=status.HTTP_409_CONFLICT)

        try:
            sync_xl_children_from_snapshot(product, snapshot)
        except IntegrityError as exc:
            payload = {"code": "xl_sync_child_conflict", "detail": "Sync failed due to conflicting child records.", "error": str(exc)}
            finalize_error(idem_record, status_code=status.HTTP_400_BAD_REQUEST, payload=payload, error_code="xl_sync_child_conflict")
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:  # noqa: BLE001
            payload = {"code": "xl_sync_children_failed", "detail": "Sync failed while processing source child data.", "error": str(exc)}
            finalize_error(idem_record, status_code=status.HTTP_400_BAD_REQUEST, payload=payload, error_code="xl_sync_children_failed")
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        result = ImportedProductDetailSerializer(product).data
        response_payload = {"created": is_created, "updated": not is_created, "item": result}
        response_status = status.HTTP_201_CREATED if is_created else status.HTTP_200_OK
        finalize_success(idem_record, status_code=response_status, payload=response_payload)
        return Response(response_payload, status=response_status)
