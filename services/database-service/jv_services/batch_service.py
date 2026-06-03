import os
import copy
from decimal import Decimal
from datetime import date

from django.utils import timezone
import logging
from catalog_core.batch_shared import (
    convert_amount as _shared_convert_amount,
    fetch_max_rate_last_period as _shared_fetch_max_rate_last_period,
    json_safe as _shared_json_safe,
    round_price_no_fraction as _shared_round_price_no_fraction,
)
from catalog_core.locale_currency import (
    infer_currency as _shared_infer_currency,
    infer_locale as _shared_infer_locale,
)

from .models import (
    ImportedProduct,
    ImportedProductCategory,
    ImportedProductDescription,
    ImportedProductImage,
    ImportedProductSpecial,
    ImportedProductStore,
    JVBatchJob,
    JVBatchJobItem,
)
from .source_client import (
    fetch_source_language_id_by_locale,
    fetch_source_product_brief_by_ean,
    fetch_source_product_snapshot_by_product_id,
    fetch_source_product_snapshot_by_ean,
    push_product_to_source,
    source_db_config_for_site,
)
from .source_language import normalize_locale_code
from .sync_utils import (
    effective_ean_from_source,
    resolve_local_product_for_source,
    sync_children_from_snapshot,
)
from .batch_defaults import (
    DEFAULT_CURRENCY_BY_SITE_KEY,
    DEFAULT_LOCALE_BY_SITE_KEY,
    FIXED_JV_BATCH_SITE_KEYS,
    FORCED_JV_TARGET_LOCALE,
)
from .batch_item_status import (
    finalize_batch_job,
    mark_item_applied,
    mark_item_failed,
    mark_item_skipped,
    new_batch_summary,
)
from .batch_payload import (
    SCALAR_UPDATE_KEYS,
    ensure_main_category,
    extract_scalar_updates,
)
from .batch_sites import sites_for_family
from .source_categories import map_jv_categories_between_sources
from .source_values import fetch_jv_lieferzeit_label_by_id
from .batch_translation import (
    _build_multilang_descriptions_for_site,
    _build_translated_descriptions,
    _detect_language_from_texts,
    _extract_translation_source_from_snapshot,
    _language_map_for_site,
    _translate_jv_content_row,
)
from .price_rules import apply_special_price_from_product

logger = logging.getLogger(__name__)
_FX_MAX_RATE_CACHE: dict[tuple[str, str, int, str], Decimal] = {}


def _round_price_no_fraction(value) -> Decimal:
    return _shared_round_price_no_fraction(value)


def _session_actor(request) -> str:
    return str(
        request.session.get("username")
        or request.session.get("user")
        or request.session.get("email")
        or request.session.get("role")
        or "system_import"
    )


def _json_safe(value):
    return _shared_json_safe(value)


def _normalize_translation_source_fields(raw: dict) -> dict:
    if not isinstance(raw, dict):
        return {}
    normalized: dict[str, str] = {}
    for key, value in raw.items():
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue
        key_text = str(key or "").strip()
        if not key_text:
            continue
        lowered = key_text.lower()
        if lowered in {"bezeichnung", "beschreibung"}:
            normalized["description"] = text
            continue
        if lowered in {"kurzbeschreibung", "short_description_real"}:
            normalized["kurzbeschreibung"] = text
            continue
        normalized[key_text] = text
    return normalized


def _sites_for_family(selected_site_keys: list[str] | None = None):
    return sites_for_family(selected_site_keys)


def _infer_locale(*, site_key: str, domain: str, locale_by_site_key: dict) -> str:
    return _shared_infer_locale(
        site_key=site_key,
        domain=domain,
        locale_by_site_key=locale_by_site_key,
        default_locale_by_site_key=DEFAULT_LOCALE_BY_SITE_KEY,
    )


def _infer_currency(*, site_key: str, domain: str, source_currency: str, currency_by_site_key: dict) -> str:
    return _shared_infer_currency(
        site_key=site_key,
        domain=domain,
        source_currency=source_currency,
        currency_by_site_key=currency_by_site_key,
        default_currency_by_site_key=DEFAULT_CURRENCY_BY_SITE_KEY,
    )


def _convert_amount(*, amount, from_currency: str, to_currency: str):
    return _shared_convert_amount(
        amount=amount,
        from_currency=from_currency,
        to_currency=to_currency,
        env_prefix="JV",
        cache=_FX_MAX_RATE_CACHE,
    )


def _fetch_max_rate_last_period(
    *,
    from_code: str,
    to_code: str,
    lookback_days: int,
    timeout: tuple[int, int],
    end_date: date,
) -> Decimal:
    return _shared_fetch_max_rate_last_period(
        from_code=from_code,
        to_code=to_code,
        lookback_days=lookback_days,
        timeout=timeout,
        end_date=end_date,
        api_url=os.getenv("JV_FX_API_URL", "").strip(),
    )


def _target_price_for_site(*, site_key: str, old_price, default_price, price_by_site_key: dict, convert_currency: bool, source_currency: str, target_currency: str):
    site_key_norm = str(site_key or "").strip().upper()
    if site_key_norm and site_key_norm in price_by_site_key:
        return _round_price_no_fraction(price_by_site_key[site_key_norm])
    if default_price is None:
        return None
    if convert_currency:
        return _convert_amount(amount=default_price, from_currency=source_currency, to_currency=target_currency)
    return _round_price_no_fraction(default_price)


def _to_decimal_or_none(value):
    if value in (None, ""):
        return None
    return _round_price_no_fraction(value)


def _extract_scalar_updates(payload: dict) -> dict:
    return extract_scalar_updates(payload)


def _ensure_main_category(categories: list[dict], template_main_category_id):
    return ensure_main_category(categories, template_main_category_id)


def build_batch_plan(*, ean: str, payload: dict):
    selected_site_keys = list(FIXED_JV_BATCH_SITE_KEYS)
    template_site_key = str(payload.get("template_site_key") or "").strip().upper()
    template_main_category_id = payload.get("template_main_category_id")
    default_price = payload.get("default_price")
    price_by_site_key_raw = payload.get("price_by_site_key") or {}
    price_by_site_key = {str(k or "").strip().upper(): v for k, v in price_by_site_key_raw.items()}
    image_by_site_key_raw = payload.get("image_by_site_key") or {}
    image_by_site_key = {
        str(k or "").strip().upper(): str(v or "").strip()
        for k, v in image_by_site_key_raw.items()
        if str(k or "").strip() and str(v or "").strip()
    }
    convert_currency = bool(payload.get("convert_currency"))
    source_currency_default = str(payload.get("source_currency") or "EUR").upper()
    currency_by_site_key_raw = payload.get("currency_by_site_key") or {}
    currency_by_site_key = {str(k or "").strip().upper(): str(v or "").strip().upper() for k, v in currency_by_site_key_raw.items()}
    translate_texts = bool(payload.get("translate_texts"))
    translation_source = _normalize_translation_source_fields(payload.get("translation_source") or {})
    translation_source_language_raw = str(payload.get("translation_source_language") or "").strip().lower()
    source_locale_for_snapshot = (
        translation_source_language_raw
        if translation_source_language_raw not in {"", "auto"}
        else "de"
    )
    locale_by_site_key = {key: FORCED_JV_TARGET_LOCALE for key in FIXED_JV_BATCH_SITE_KEYS}
    language_id_by_locale = payload.get("language_id_by_locale") or {}
    site_language_map_cache: dict[str, dict[str, int]] = {}
    explicit_descriptions = payload.get("descriptions") or []
    has_explicit_descriptions = "descriptions" in payload
    has_explicit_categories = "categories" in payload
    categories_by_site_key_raw = payload.get("categories_by_site_key") or {}
    categories_by_site_key = {
        str(site_key or "").strip().upper(): rows
        for site_key, rows in categories_by_site_key_raw.items()
        if str(site_key or "").strip()
    }
    has_explicit_stores = "stores" in payload
    has_explicit_images = "images" in payload
    has_explicit_specials = "specials" in payload
    explicit_categories = payload.get("categories") if has_explicit_categories else None
    explicit_stores = payload.get("stores") if has_explicit_stores else None
    explicit_images = payload.get("images") if has_explicit_images else None
    explicit_specials = payload.get("specials") if has_explicit_specials else None
    base_scalar_updates = _extract_scalar_updates(payload)
    base_jv_fields = payload.get("jv_fields") if isinstance(payload.get("jv_fields"), dict) else None
    resolved_translation_source = dict(translation_source)
    template_currency_detected = None
    translation_cache: dict = {}

    candidate_rows = _sites_for_family(selected_site_keys)
    if template_site_key:
        candidate_rows = sorted(
            candidate_rows,
            key=lambda row: 0 if (row.get("site_key") or "").upper() == template_site_key else 1,
        )

    if translate_texts and not resolved_translation_source:
        for site_row in candidate_rows:
            db_config = source_db_config_for_site(site_row["site"], site_key=site_row["site_key"] or None)
            if not db_config:
                continue
            try:
                snapshot = fetch_source_product_snapshot_by_ean(db_config, ean)
            except Exception:
                continue
            if not snapshot:
                continue
            language_map_for_snapshot = _language_map_for_site(
                site_key=site_row.get("site_key") or "",
                db_config=db_config,
                cache=site_language_map_cache,
                language_id_by_locale_override=language_id_by_locale,
            )
            resolved_translation_source = _extract_translation_source_from_snapshot(
                snapshot=snapshot,
                source_locale=source_locale_for_snapshot,
                language_id_by_locale=language_map_for_snapshot,
            )
            if resolved_translation_source:
                break

    if translation_source_language_raw in {"", "auto"}:
        translation_source_language = _detect_language_from_texts(source_fields=resolved_translation_source)
    else:
        translation_source_language = translation_source_language_raw

    plan_items = []
    for site_row in candidate_rows:
        site = site_row["site"]
        site_key = site_row["site_key"]
        domain = site_row["domain"]
        db_config = source_db_config_for_site(site, site_key=site_key or None)
        if not db_config:
            plan_items.append({
                "site": site, "site_key": site_key, "domain": domain, "status": "skipped",
                "error_code": "jv_site_not_configured", "error_text": "Missing source DB credentials for site.",
            })
            continue

        try:
            row = fetch_source_product_brief_by_ean(db_config, ean)
            if not row:
                plan_items.append({
                    "site": site, "site_key": site_key, "domain": domain, "status": "skipped",
                    "error_code": "jv_ean_not_found_on_site", "error_text": "EAN not found on this site.",
                })
                continue

            target_locale = FORCED_JV_TARGET_LOCALE
            language_map_for_site = _language_map_for_site(
                site_key=site_key,
                db_config=db_config,
                cache=site_language_map_cache,
                language_id_by_locale_override=language_id_by_locale,
            )
            source_currency = str(row.get("currency_code") or source_currency_default).upper()
            if (site_key or "").upper() == template_site_key and source_currency:
                template_currency_detected = source_currency
            target_currency = _infer_currency(
                site_key=site_key,
                domain=domain,
                source_currency=source_currency,
                currency_by_site_key=currency_by_site_key,
            )
            conversion_source_currency = str(
                payload.get("source_currency")
                or template_currency_detected
                or source_currency_default
            ).upper()
            new_price = _target_price_for_site(
                site_key=site_key,
                old_price=row.get("price"),
                default_price=default_price,
                price_by_site_key=price_by_site_key,
                convert_currency=convert_currency,
                source_currency=conversion_source_currency,
                target_currency=target_currency,
            )

            descriptions_to_apply = explicit_descriptions
            if translate_texts and resolved_translation_source:
                descriptions_to_apply = _build_translated_descriptions(
                    source_fields=resolved_translation_source,
                    source_lang=translation_source_language,
                    target_locale=target_locale,
                    language_id_by_locale=language_map_for_site,
                    translation_cache=translation_cache,
                )
            elif not has_explicit_descriptions:
                descriptions_to_apply = None

            scalar_updates = dict(base_scalar_updates)
            site_specific_image = image_by_site_key.get(str(site_key or "").strip().upper())
            if site_specific_image:
                scalar_updates["image"] = site_specific_image
            if "price" in scalar_updates:
                base_price = _to_decimal_or_none(scalar_updates.get("price"))
                if base_price is not None and convert_currency:
                    base_from_currency = conversion_source_currency
                    scalar_updates["price"] = _convert_amount(
                        amount=base_price,
                        from_currency=base_from_currency,
                        to_currency=target_currency,
                    )
                elif base_price is not None:
                    scalar_updates["price"] = base_price
            elif new_price is not None:
                scalar_updates["price"] = new_price

            details_payload = {
                "title": row.get("title") or "",
                "target_locale": target_locale,
                "translate_texts_requested": bool(translate_texts),
                "scalar_updates": scalar_updates,
                "translation_source_language": translation_source_language,
                # Per-site resolved mapping so frontend knows exactly
                # which language_id belongs to which locale on this source site.
                "language_id_by_locale": language_map_for_site,
            }

            if base_jv_fields is not None:
                jv_fields_for_site = copy.deepcopy(base_jv_fields)
                if (
                    template_site_key
                    and str(site_key or "").strip().upper() != template_site_key
                    and jv_fields_for_site.get("lieferzeitid") not in (None, "")
                ):
                    template_db_config = source_db_config_for_site(site, site_key=template_site_key)
                    if template_db_config:
                        try:
                            delivery_label = fetch_jv_lieferzeit_label_by_id(
                                template_db_config,
                                jv_fields_for_site.get("lieferzeitid"),
                            )
                            if delivery_label:
                                jv_fields_for_site["lieferzeitid"] = delivery_label
                                details_payload["delivery_mapping_meta"] = {
                                    "mode": "label_from_template",
                                    "template_site_key": template_site_key,
                                    "label": delivery_label,
                                }
                        except Exception as exc:
                            logger.warning(
                                "JV_DELIVERY_MAPPING_FAILED code=jv_delivery_mapping_failed template_site_key=%s site_key=%s",
                                template_site_key,
                                site_key,
                                exc_info=True,
                            )
                            details_payload["delivery_mapping_meta"] = {
                                "mode": "label_from_template",
                                "template_site_key": template_site_key,
                                "error": str(exc),
                            }
                content_rows = jv_fields_for_site.get("content_by_language")
                if isinstance(content_rows, list):
                    source_row = next(
                        (
                            content_row
                            for content_row in content_rows
                            if isinstance(content_row, dict)
                            and str(content_row.get("language_code") or "de").strip().lower() == "de"
                        ),
                        None,
                    )
                    if source_row is None:
                        source_row = next((content_row for content_row in content_rows if isinstance(content_row, dict)), None)
                    if source_row is not None:
                        if isinstance(resolved_translation_source, dict):
                            description_override = str(resolved_translation_source.get("description") or "").strip()
                            short_override = str(resolved_translation_source.get("kurzbeschreibung") or "").strip()
                            if description_override and not str(source_row.get("description") or "").strip():
                                source_row["description"] = description_override
                            if short_override and not str(source_row.get("short_description_real") or "").strip():
                                source_row["short_description_real"] = short_override
                                source_row["kurzbeschreibung"] = short_override
                        if translate_texts:
                            content_source_lang = normalize_locale_code(source_row.get("language_code")) or translation_source_language
                            translated_row, content_errors = _translate_jv_content_row(
                                row=source_row,
                                source_lang=content_source_lang,
                                target_locale=target_locale,
                                translation_cache=translation_cache,
                            )
                            jv_fields_for_site["content_by_language"] = [translated_row]
                            if content_errors:
                                details_payload["translation_meta_jv_content_error"] = "; ".join(content_errors[:10])
                        else:
                            jv_fields_for_site["content_by_language"] = [dict(source_row)]
                details_payload["jv_fields"] = jv_fields_for_site

            if descriptions_to_apply is not None:
                details_payload["descriptions"] = descriptions_to_apply
            site_key_norm = str(site_key or "").strip().upper()
            category_mapping_meta = None
            if site_key_norm in categories_by_site_key:
                details_payload["categories"] = _ensure_main_category(
                    categories_by_site_key.get(site_key_norm) or [],
                    template_main_category_id=template_main_category_id,
                )
                category_mapping_meta = {"mode": "explicit_site_categories"}
            elif has_explicit_categories:
                categories_for_site = explicit_categories or []
                if (
                    categories_for_site
                    and template_site_key
                    and site_key_norm
                    and site_key_norm != template_site_key
                ):
                    template_db_config = source_db_config_for_site(site, site_key=template_site_key)
                    if template_db_config:
                        try:
                            categories_for_site, category_mapping_meta = map_jv_categories_between_sources(
                                template_db_config,
                                db_config,
                                categories_for_site,
                            )
                            category_mapping_meta = {
                                **(category_mapping_meta or {}),
                                "mode": "rubnum_from_template",
                                "template_site_key": template_site_key,
                            }
                        except Exception as exc:
                            logger.warning(
                                "JV_CATEGORY_MAPPING_FAILED code=jv_category_mapping_failed template_site_key=%s site_key=%s",
                                template_site_key,
                                site_key_norm,
                                exc_info=True,
                            )
                            categories_for_site = []
                            category_mapping_meta = {
                                "mode": "rubnum_from_template",
                                "template_site_key": template_site_key,
                                "mapped": 0,
                                "error": str(exc),
                            }
                elif site_key_norm == template_site_key:
                    category_mapping_meta = {"mode": "template_categories"}
                details_payload["categories"] = _ensure_main_category(
                    categories_for_site,
                    template_main_category_id=template_main_category_id if site_key_norm == template_site_key else None,
                )
            if category_mapping_meta is not None:
                details_payload["category_mapping_meta"] = category_mapping_meta
            details_payload["template_main_category_id"] = template_main_category_id
            if has_explicit_stores:
                details_payload["stores"] = explicit_stores
            if has_explicit_images:
                details_payload["images"] = explicit_images
            if has_explicit_specials:
                details_payload["specials"] = explicit_specials

            plan_items.append(
                {
                    "site": site,
                    "site_key": site_key,
                    "domain": domain,
                    "status": "pending",
                    "source_product_id": row.get("product_id"),
                    "effective_ean": effective_ean_from_source(row, fallback=ean),
                    "currency_code": target_currency,
                    "old_price": row.get("price"),
                    "new_price": new_price,
                    "details": details_payload,
                }
            )
        except Exception as exc:
            logger.exception(
                "JV_BATCH_PLAN_ITEM_FAILED code=jv_batch_plan_item_failed site=%s site_key=%s",
                site,
                site_key,
            )
            plan_items.append(
                {
                    "site": site,
                    "site_key": site_key,
                    "domain": domain,
                    "status": "failed",
                    "error_code": "jv_batch_plan_item_failed",
                    "error_text": str(exc),
                }
            )
    return plan_items


def apply_batch(*, job: JVBatchJob):
    payload = job.request_payload or {}
    ean = str(job.ean or "").strip()
    explicit_scalar_fields = {
        key
        for key in SCALAR_UPDATE_KEYS
        if key in payload
    }
    if payload.get("image_by_site_key"):
        explicit_scalar_fields.add("image")
    explicit_relations = {
        key
        for key in ("descriptions", "categories", "stores", "images", "specials", "jv_fields")
        if key in payload
    }
    if payload.get("categories_by_site_key"):
        explicit_relations.add("categories")
    translate_texts_requested = bool(payload.get("translate_texts"))
    translation_source_requested = isinstance(payload.get("translation_source"), dict) and bool(payload.get("translation_source"))
    summary = new_batch_summary()
    site_language_map_cache: dict[str, dict[str, int]] = {}
    translation_cache: dict = {}

    for item in job.items.all().order_by("id"):
        summary["total"] += 1
        if item.status == JVBatchJobItem.Status.SKIPPED:
            summary["skipped"] += 1
            continue

        db_config = source_db_config_for_site(item.site, site_key=item.site_key or None)
        if not db_config:
            mark_item_skipped(
                item,
                summary,
                code="jv_site_not_configured",
                text="Missing source DB credentials for site.",
            )
            continue

        try:
            lookup_ean = (item.effective_ean or "").strip() or ean
            snapshot = None
            if item.source_product_id:
                snapshot = fetch_source_product_snapshot_by_product_id(db_config, int(item.source_product_id))
            if not snapshot:
                snapshot = fetch_source_product_snapshot_by_ean(db_config, lookup_ean)
            if not snapshot:
                mark_item_skipped(
                    item,
                    summary,
                    code="jv_ean_not_found_on_site",
                    text="EAN not found on this site.",
                )
                continue
            if item.source_product_id and int(snapshot["product"]["product_id"]) != int(item.source_product_id):
                mark_item_failed(
                    item,
                    summary,
                    code="jv_source_product_mismatch",
                    text=(
                        f"Resolved product_id={snapshot['product']['product_id']} "
                        f"but expected {item.source_product_id} for this site."
                    ),
                )
                continue

            product_row = snapshot["product"]
            effective_ean = effective_ean_from_source(product_row, fallback=ean)
            product, conflict_product = resolve_local_product_for_source(
                site=item.site,
                site_key=item.site_key or "",
                source_product_id=product_row["product_id"],
                effective_ean=effective_ean,
            )
            if conflict_product is not None:
                mark_item_failed(
                    item,
                    summary,
                    code="jv_local_product_conflict",
                    text=(
                        f"Local record conflict for site={item.site}: "
                        f"local source_product_id={conflict_product.source_product_id}, "
                        f"target source_product_id={product_row['product_id']}. "
                        "Batch push blocked to prevent updating wrong product."
                    ),
                )
                continue
            actor = str(job.initiated_by or "system_import")

            if product is None:
                product = ImportedProduct.objects.create(
                    site=item.site,
                    site_key=item.site_key or "",
                    source_product_id=product_row["product_id"],
                    ean=effective_ean,
                    source_model=(product_row.get("model") or "").strip(),
                    source_sku=(product_row.get("sku") or "").strip(),
                    source_ean_field=(product_row.get("ean") or "").strip(),
                    price=product_row.get("price"),
                    quantity=product_row.get("quantity"),
                    status=bool(product_row.get("status", 0)),
                    manufacturer_id=product_row.get("manufacturer_id"),
                    stock_status_id=product_row.get("stock_status_id"),
                    tax_class_id=product_row.get("tax_class_id"),
                    image=(product_row.get("image") or "").strip(),
                    date_available=product_row.get("date_available"),
                    date_modified_in_source=product_row.get("date_modified"),
                    is_modified_locally=False,
                    is_pushed_to_source=False,
                    local_save_status=ImportedProduct.LocalSaveStatus.SAVED,
                    source_push_status=ImportedProduct.SourcePushStatus.PENDING,
                    source_push_error="",
                    last_imported_at=timezone.now(),
                    user_create=actor,
                    update_user="",
                )
            else:
                if int(product.source_product_id) != int(product_row["product_id"]):
                    mark_item_failed(
                        item,
                        summary,
                        code="jv_local_product_conflict",
                        text=(
                            f"Local record conflict for site={item.site}: "
                            f"local source_product_id={product.source_product_id}, "
                            f"target source_product_id={product_row['product_id']}. "
                            "Batch push blocked to prevent updating wrong product."
                        ),
                    )
                    continue
                ImportedProduct.all_objects.filter(pk=product.pk).update(
                    source_model=(product_row.get("model") or "").strip(),
                    source_sku=(product_row.get("sku") or "").strip(),
                    source_ean_field=(product_row.get("ean") or "").strip(),
                    price=product_row.get("price"),
                    quantity=product_row.get("quantity"),
                    status=bool(product_row.get("status", 0)),
                    manufacturer_id=product_row.get("manufacturer_id"),
                    stock_status_id=product_row.get("stock_status_id"),
                    tax_class_id=product_row.get("tax_class_id"),
                    image=(product_row.get("image") or "").strip(),
                    date_available=product_row.get("date_available"),
                    date_modified_in_source=product_row.get("date_modified"),
                    is_modified_locally=False,
                    is_pushed_to_source=False,
                    local_save_status=ImportedProduct.LocalSaveStatus.SAVED,
                    source_push_status=ImportedProduct.SourcePushStatus.PENDING,
                    source_push_error="",
                    last_imported_at=timezone.now(),
                    update_user=actor,
                    updated_at=timezone.now(),
                )
                product.refresh_from_db()

            sync_children_from_snapshot(product, snapshot)

            changed_scalar_fields = set()
            changed_relations = set()

            details = dict(item.details or {})
            # Safety guard: for patch-like requests, do not apply relation blocks
            # that were not explicitly requested in the outer payload.
            if "images" not in explicit_relations:
                details.pop("images", None)
            if "categories" not in explicit_relations:
                details.pop("categories", None)
            if "stores" not in explicit_relations:
                details.pop("stores", None)
            if "specials" not in explicit_relations:
                details.pop("specials", None)
            if "jv_fields" not in explicit_relations:
                details.pop("jv_fields", None)
            if "descriptions" not in explicit_relations and not (translate_texts_requested and translation_source_requested):
                details.pop("descriptions", None)
            scalar_updates = details.get("scalar_updates") or {}
            template_main_category_id = details.get("template_main_category_id")
            translation_meta = {
                "translation_used": False,
                "translation_error": None,
                "translation_errors": [],
            }
            if explicit_scalar_fields:
                scalar_updates = {k: v for k, v in scalar_updates.items() if k in explicit_scalar_fields}
            if not scalar_updates and item.new_price is not None:
                scalar_updates = {"price": item.new_price}

            for key, value in scalar_updates.items():
                if key not in {
                    "source_model",
                    "source_sku",
                    "source_ean_field",
                    "price",
                    "quantity",
                    "status",
                    "manufacturer_id",
                    "stock_status_id",
                    "tax_class_id",
                    "image",
                    "date_available",
                    "update_user",
                }:
                    continue
                if key == "price":
                    product.price = _to_decimal_or_none(value)
                elif key == "quantity":
                    product.quantity = int(value) if value is not None else None
                elif key == "status":
                    product.status = bool(value)
                elif key == "update_user":
                    # handled below together with actor fallback
                    pass
                else:
                    setattr(product, key, value)
                changed_scalar_fields.add(key)

            if "jv_fields" in details and isinstance(details.get("jv_fields"), dict):
                existing_jv_fields = getattr(product, "_jv_fields", {})
                if not isinstance(existing_jv_fields, dict):
                    existing_jv_fields = {}
                merged_jv_fields = dict(existing_jv_fields)
                merged_jv_fields.update(details.get("jv_fields") or {})
                setattr(product, "_jv_fields", merged_jv_fields)

            if "descriptions" in details:
                descriptions = details.get("descriptions") or []
                if descriptions:
                    changed_relations.add("descriptions")
                    site_key_for_map = str(item.site_key or "").strip().upper()
                    if site_key_for_map in site_language_map_cache:
                        locale_to_language_id = site_language_map_cache[site_key_for_map]
                    else:
                        try:
                            locale_to_language_id = fetch_source_language_id_by_locale(db_config) or {}
                        except Exception:
                            logger.warning(
                                "JV_LANGUAGE_MAP_APPLY_FAILED code=jv_language_map_apply_failed site=%s site_key=%s",
                                item.site,
                                item.site_key,
                                exc_info=True,
                            )
                            locale_to_language_id = {}
                        site_language_map_cache[site_key_for_map] = locale_to_language_id

                    existing_desc_rows = list(product.descriptions.all().order_by("language_id", "id"))
                    final_descriptions, translation_meta = _build_multilang_descriptions_for_site(
                        requested_descriptions=descriptions,
                        existing_descriptions=existing_desc_rows,
                        locale_to_language_id=locale_to_language_id,
                        translation_cache=translation_cache,
                        source_lang_hint=details.get("translation_source_language"),
                    )
                    try:
                        debug_rows = [
                            {
                                "language_id": int(desc_patch.get("language_id") or 0),
                                "name": str(desc_patch.get("name") or "")[:120],
                                "description": str(desc_patch.get("description") or "")[:120],
                            }
                            for desc_patch in (final_descriptions or [])
                        ]
                        print(
                            "JV_TRANSLATION_DEBUG",
                            {
                                "job_id": int(job.id),
                                "site": str(item.site or ""),
                                "site_key": str(item.site_key or ""),
                                "target_locale": str(details.get("target_locale") or ""),
                                "language_map": {k: int(v) for k, v in (locale_to_language_id or {}).items() if str(k)},
                                "rows": debug_rows,
                                "meta": translation_meta,
                            },
                        )
                    except Exception:
                        print(
                            "JV_TRANSLATION_DEBUG_LOG_FAILED",
                            {
                                "job_id": int(job.id),
                                "site": str(item.site or ""),
                                "site_key": str(item.site_key or ""),
                            },
                        )
                    if final_descriptions:
                        product.descriptions.all().delete()
                        ImportedProductDescription.objects.bulk_create(
                            [
                                ImportedProductDescription(
                                    product=product,
                                    language_id=int(desc_patch.get("language_id") or 1),
                                    name=desc_patch.get("name", "") or "",
                                    description=desc_patch.get("description", "") or "",
                                    tag=desc_patch.get("tag", "") or "",
                                    meta_title=desc_patch.get("meta_title", "") or "",
                                    meta_description=desc_patch.get("meta_description", "") or "",
                                    meta_keyword=desc_patch.get("meta_keyword", "") or "",
                                    is_modified_locally=True,
                                )
                                for desc_patch in final_descriptions
                            ]
                        )
                    details["translation_meta"] = translation_meta
                    if bool(translation_meta.get("translation_used")):
                        summary["translation_used_sites"] += 1
                    if translation_meta.get("translation_error"):
                        summary["translation_error_sites"] += 1

            if "categories" in details:
                categories = _ensure_main_category(
                    details.get("categories") or [],
                    template_main_category_id=template_main_category_id,
                )
                if categories:
                    changed_relations.add("categories")
                    product.categories.all().delete()
                    ImportedProductCategory.objects.bulk_create(
                        [
                            ImportedProductCategory(
                                product=product,
                                category_id=int(item_cat.get("category_id")),
                                main_category=bool(item_cat.get("main_category", False)),
                            )
                            for item_cat in categories
                            if item_cat.get("category_id") is not None
                        ],
                        ignore_conflicts=True,
                    )
            elif template_main_category_id is not None:
                current = list(product.categories.all().order_by("id"))
                if current and not any(bool(c.main_category) for c in current):
                    try:
                        preferred_id = int(template_main_category_id)
                    except (TypeError, ValueError):
                        preferred_id = None
                    selected = None
                    if preferred_id is not None:
                        selected = next((c for c in current if int(c.category_id) == preferred_id), None)
                    if selected is None:
                        selected = current[0]
                    product.categories.update(main_category=False)
                    ImportedProductCategory.objects.filter(pk=selected.pk).update(main_category=True)
                    changed_relations.add("categories")

            if "stores" in details:
                stores = details.get("stores") or []
                if stores:
                    changed_relations.add("stores")
                    product.stores.all().delete()
                    ImportedProductStore.objects.bulk_create(
                        [
                            ImportedProductStore(
                                product=product,
                                store_id=int(item_store.get("store_id")),
                            )
                            for item_store in stores
                            if item_store.get("store_id") is not None
                        ],
                        ignore_conflicts=True,
                    )

            if "images" in details:
                images = details.get("images") or []
                if images:
                    changed_relations.add("images")
                    product.images.all().delete()
                    ImportedProductImage.objects.bulk_create(
                        [
                            ImportedProductImage(
                                product=product,
                                image=(item_img.get("image") or "").strip(),
                                sort_order=int(item_img.get("sort_order") or 0),
                            )
                            for item_img in images
                            if (item_img.get("image") or "").strip()
                        ]
                    )

            if "specials" in details:
                specials = details.get("specials") or []
                if specials:
                    changed_relations.add("specials")
                    product.specials.all().delete()
                    ImportedProductSpecial.objects.bulk_create(
                        [
                            ImportedProductSpecial(
                                product=product,
                                customer_group_id=int(item_sp.get("customer_group_id") or 1),
                                priority=int(item_sp.get("priority") or 0),
                                price=_to_decimal_or_none(item_sp.get("price")) or Decimal("0.0000"),
                                date_start=item_sp.get("date_start"),
                                date_end=item_sp.get("date_end"),
                                is_modified_locally=True,
                            )
                            for item_sp in specials
                            if item_sp.get("price") is not None
                        ]
                    )

            # Business rule: specials price is always derived from base product price.
            if "price" in changed_scalar_fields:
                apply_special_price_from_product(product)
                changed_relations.add("specials")

            product.update_user = str(scalar_updates.get("update_user") or actor)
            product.is_modified_locally = True
            product.local_save_status = ImportedProduct.LocalSaveStatus.SAVED
            product.source_push_status = ImportedProduct.SourcePushStatus.PENDING
            product.source_push_error = ""
            product.save()

            translation_requested = bool(details.get("translate_texts_requested"))
            translation_meta_error = str((details.get("translation_meta") or {}).get("translation_error") or "").strip()
            translation_content_error = str(details.get("translation_meta_jv_content_error") or "").strip()
            if translation_requested and (translation_meta_error or translation_content_error):
                combined_error = "; ".join([part for part in [translation_meta_error, translation_content_error] if part])
                mark_item_failed(
                    item,
                    summary,
                    code="jv_translation_failed",
                    text=combined_error or "Translation failed for one or more fields.",
                    details=_json_safe(details),
                )
                continue

            push_product_to_source(
                db_config,
                product,
                changed_scalar_fields=changed_scalar_fields,
                changed_relations=changed_relations,
            )
            ImportedProduct.all_objects.filter(pk=product.pk).update(
                is_pushed_to_source=True,
                source_push_status=ImportedProduct.SourcePushStatus.PUSHED,
                source_push_error="",
                last_pushed_at=timezone.now(),
            )

            mark_item_applied(item, summary, details=_json_safe(details))
        except Exception as exc:
            mark_item_failed(item, summary, code="jv_batch_apply_failed", text=str(exc))

    return finalize_batch_job(job, summary)


def create_job_with_plan(*, request, ean: str, site_family: str, payload: dict, idempotency_key: str):
    actor = _session_actor(request)
    forced_site_family = ImportedProduct.Site.JV
    job = JVBatchJob.objects.create(
        ean=ean,
        site_family=forced_site_family,
        status=JVBatchJob.Status.PENDING,
        initiated_by=actor,
        idempotency_key=idempotency_key or "",
        request_payload=_json_safe(payload),
    )

    plan_items = build_batch_plan(ean=ean, payload=payload)
    for row in plan_items:
        JVBatchJobItem.objects.create(
            job=job,
            site=row.get("site") or forced_site_family,
            site_key=row.get("site_key") or "",
            domain=row.get("domain") or "",
            status=row.get("status") or JVBatchJobItem.Status.PENDING,
            source_product_id=row.get("source_product_id"),
            effective_ean=row.get("effective_ean") or "",
            currency_code=row.get("currency_code") or "",
            old_price=row.get("old_price"),
            new_price=row.get("new_price"),
            error_code=row.get("error_code") or "",
            error_text=row.get("error_text") or "",
            details=_json_safe(row.get("details") or {}),
        )
    return job
