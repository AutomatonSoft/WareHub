import json
import logging
import os

from catalog_core.descriptions_shared import (
    extract_source_fields_from_description as _shared_extract_source_fields_from_description,
    invert_language_map as _shared_invert_language_map,
    pick_best_source_description as _shared_pick_best_source_description,
    same_desc_fields as _shared_same_desc_fields,
)
from catalog_core.text_language import detect_language_from_texts as _shared_detect_language_from_texts
from catalog_core.translation_openai import (
    translate_fields_batch as _shared_translate_fields_batch,
    translate_text as _shared_translate_text,
)

from .batch_defaults import DEFAULT_LANGUAGE_ID_BY_LOCALE, TRANSLATABLE_FIELDS
from .models import ImportedProductDescription
from .source_client import fetch_source_language_id_by_locale

logger = logging.getLogger(__name__)


def _translate_fields_batch(*, source_fields: dict, source_lang: str, target_lang: str) -> dict:
    return _shared_translate_fields_batch(
        source_fields=source_fields,
        source_lang=source_lang,
        target_lang=target_lang,
        translatable_fields=TRANSLATABLE_FIELDS,
    )


def _translate_text(*, text: str, source_lang: str, target_lang: str):
    return _shared_translate_text(text=text, source_lang=source_lang, target_lang=target_lang)


def _extract_translation_source_from_snapshot(*, snapshot: dict, source_locale: str, language_id_by_locale: dict):
    descriptions = (snapshot or {}).get("descriptions") or []
    if not descriptions:
        return {}

    source_language_id = int(
        language_id_by_locale.get(source_locale, DEFAULT_LANGUAGE_ID_BY_LOCALE.get(source_locale, 1))
    )
    preferred = next((row for row in descriptions if int(row.get("language_id") or 0) == source_language_id), None)
    if preferred is None:
        preferred = descriptions[0]

    fields = {}
    for key in TRANSLATABLE_FIELDS:
        value = str(preferred.get(key) or "").strip()
        if value:
            fields[key] = value
    return fields


def _language_map_for_site(
    *,
    site_key: str,
    db_config: dict | None,
    cache: dict[str, dict[str, int]],
    language_id_by_locale_override: dict,
) -> dict[str, int]:
    cache_key = str(site_key or "").strip().upper()
    if cache_key in cache:
        discovered = cache[cache_key]
    else:
        discovered = {}
        if db_config:
            try:
                discovered = fetch_source_language_id_by_locale(db_config) or {}
            except Exception:
                logger.warning(
                    "JV_LANGUAGE_MAP_FETCH_FAILED code=jv_language_map_fetch_failed site_key=%s",
                    cache_key,
                    exc_info=True,
                )
        cache[cache_key] = discovered

    # precedence: defaults < discovered from site DB < explicit override payload
    merged = dict(DEFAULT_LANGUAGE_ID_BY_LOCALE)
    merged.update(discovered)
    merged.update(language_id_by_locale_override or {})
    return merged


def _detect_language_from_texts(*, source_fields: dict) -> str:
    return _shared_detect_language_from_texts(
        source_fields=source_fields,
        translatable_fields=TRANSLATABLE_FIELDS,
    )


def _build_translated_descriptions(
    *,
    source_fields: dict,
    source_lang: str,
    target_locale: str,
    language_id_by_locale: dict,
    translation_cache: dict | None = None,
):
    target_language_id = int(language_id_by_locale.get(target_locale, DEFAULT_LANGUAGE_ID_BY_LOCALE.get(target_locale, 1)))
    translated = {"language_id": target_language_id}
    if not source_fields:
        return [translated]

    if target_locale and target_locale != source_lang:
        translated_fields, _used, _errors = _safe_translate_fields(
            source_fields=source_fields,
            source_lang=source_lang,
            target_lang=target_locale,
            translation_cache=translation_cache,
        )
    else:
        translated_fields = dict(source_fields)

    for key in TRANSLATABLE_FIELDS:
        value = str(translated_fields.get(key) or "")
        if value:
            translated[key] = value
    return [translated]


def _translate_jv_content_row(
    *,
    row: dict,
    source_lang: str,
    target_locale: str,
    translation_cache: dict | None = None,
) -> tuple[dict, list[str]]:
    """
    Translate JV admin-content row fields used for shopartikelcontent sync.
    """
    translated = dict(row or {})
    errors: list[str] = []
    if not translated:
        return translated, errors

    # Keep DE override row shape expected by source_client._extract_jv_content_overrides.
    translated["language_code"] = "de"

    if not target_locale or target_locale == source_lang:
        return translated, errors

    fields = (
        "name",
        "keywords",
        "description",
        "short_description",
        "short_description_real",
        "meta_title",
        "meta_description",
        "meta_keyword",
    )
    source_fields = {field: str(translated.get(field) or "").strip() for field in fields if str(translated.get(field) or "").strip()}
    if not source_fields:
        return translated, errors
    allow_field_fallback = os.getenv("JV_TRANSLATION_ALLOW_FIELD_FALLBACK", "0") == "1"

    cache_key = None
    if translation_cache is not None:
        cache_key = (
            str(source_lang or "").strip().lower(),
            str(target_locale or "").strip().lower(),
            "jv_content",
            json.dumps(source_fields, ensure_ascii=False, sort_keys=True),
        )
        cached = translation_cache.get(cache_key)
        if isinstance(cached, dict) and cached:
            for field in fields:
                if field in cached and str(cached.get(field) or "").strip():
                    translated[field] = str(cached.get(field))
            return translated, errors

    translated_fields: dict = {}
    try:
        translated_fields = _shared_translate_fields_batch(
            source_fields=source_fields,
            source_lang=source_lang,
            target_lang=target_locale,
            translatable_fields=fields,
        ) or {}
    except Exception:
        logger.warning(
            "JV_TRANSLATE_JV_CONTENT_BATCH_FAILED code=jv_translate_jv_content_batch_failed "
            "source_lang=%s target_lang=%s",
            source_lang,
            target_locale,
            exc_info=True,
        )
        errors.append("batch: translation_failed_fallback")

    if not allow_field_fallback:
        for field in fields:
            value = str(translated_fields.get(field) or "").strip()
            if value:
                translated[field] = value
            elif field in source_fields:
                translated[field] = source_fields[field]
        if translation_cache is not None and cache_key is not None:
            translation_cache[cache_key] = {field: str(translated.get(field) or "") for field in fields}
        return translated, errors

    for field in fields:
        if field in translated_fields and str(translated_fields.get(field) or "").strip():
            translated[field] = str(translated_fields.get(field))
            continue
        value = source_fields.get(field) or ""
        if not value:
            continue
        try:
            translated[field] = _translate_text(text=value, source_lang=source_lang, target_lang=target_locale)
        except Exception:
            logger.warning(
                "JV_TRANSLATE_JV_CONTENT_FIELD_FAILED code=jv_translate_jv_content_field_failed "
                "source_lang=%s target_lang=%s field=%s",
                source_lang,
                target_locale,
                field,
                exc_info=True,
            )
            errors.append(f"{field}: translation_failed_fallback")
            translated[field] = value

    if translation_cache is not None and cache_key is not None:
        translation_cache[cache_key] = {field: str(translated.get(field) or "") for field in fields}
    return translated, errors


def _invert_language_map(locale_to_id: dict) -> dict[int, str]:
    return _shared_invert_language_map(locale_to_id)


def _extract_source_fields_from_description(desc: dict) -> dict:
    return _shared_extract_source_fields_from_description(desc, TRANSLATABLE_FIELDS)


def _extract_fields_from_model_description(desc: ImportedProductDescription) -> dict:
    return {
        "name": str(desc.name or ""),
        "description": str(desc.description or ""),
        "tag": str(desc.tag or ""),
        "meta_title": str(desc.meta_title or ""),
        "meta_description": str(desc.meta_description or ""),
        "meta_keyword": str(desc.meta_keyword or ""),
    }


def _same_desc_fields(left: dict, right: dict) -> bool:
    return _shared_same_desc_fields(left, right, TRANSLATABLE_FIELDS)


def _pick_best_source_description(descriptions: list[dict]) -> dict | None:
    return _shared_pick_best_source_description(descriptions, TRANSLATABLE_FIELDS)


def _safe_translate_fields(
    *,
    source_fields: dict,
    source_lang: str,
    target_lang: str,
    translation_cache: dict | None = None,
) -> tuple[dict, bool, list[str]]:
    allow_field_fallback = os.getenv("JV_TRANSLATION_ALLOW_FIELD_FALLBACK", "0") == "1"
    cache_key = None
    if translation_cache is not None:
        cache_key = (
            str(source_lang or "").strip().lower(),
            str(target_lang or "").strip().lower(),
            json.dumps(source_fields or {}, ensure_ascii=False, sort_keys=True),
        )
        cached = translation_cache.get(cache_key)
        if isinstance(cached, dict) and cached:
            return dict(cached), True, []

    translated: dict = {}
    used = False
    errors: list[str] = []
    try:
        translated_batch = _translate_fields_batch(
            source_fields=source_fields,
            source_lang=source_lang,
            target_lang=target_lang,
        )
        if translated_batch:
            translated.update(translated_batch)
            used = True
    except Exception:
        logger.warning(
            "JV_TRANSLATE_BATCH_FALLBACK code=jv_translate_batch_fallback source_lang=%s target_lang=%s",
            source_lang,
            target_lang,
            exc_info=True,
        )
        errors.append("batch: translation_failed_fallback")

    if not allow_field_fallback:
        for key in TRANSLATABLE_FIELDS:
            if key in translated and str(translated.get(key) or ""):
                continue
            value = str(source_fields.get(key) or "")
            if value:
                translated[key] = value
        if translation_cache is not None and cache_key is not None and translated:
            translation_cache[cache_key] = dict(translated)
        return translated, used, errors

    for key in TRANSLATABLE_FIELDS:
        if key in translated and str(translated.get(key) or ""):
            continue
        value = str(source_fields.get(key) or "")
        if not value:
            continue
        try:
            translated[key] = _translate_text(text=value, source_lang=source_lang, target_lang=target_lang)
            used = True
        except Exception:
            logger.warning(
                "JV_TRANSLATE_FIELD_FALLBACK code=jv_translate_field_fallback source_lang=%s target_lang=%s field=%s",
                source_lang,
                target_lang,
                key,
                exc_info=True,
            )
            translated[key] = value
            errors.append(f"{key}: translation_failed_fallback")
    if translation_cache is not None and cache_key is not None and translated:
        translation_cache[cache_key] = dict(translated)
    return translated, used, errors


def _build_multilang_descriptions_for_site(
    *,
    requested_descriptions: list[dict],
    existing_descriptions: list[ImportedProductDescription],
    locale_to_language_id: dict,
    translation_cache: dict | None = None,
    source_lang_hint: str | None = None,
) -> tuple[list[dict], dict]:
    requested = requested_descriptions or []
    existing = existing_descriptions or []
    meta = {
        "translation_used": False,
        "translation_error": None,
        "translation_errors": [],
    }
    if not requested:
        return [], meta

    by_lang_requested: dict[int, dict] = {}
    for row in requested:
        try:
            lang_id = int(row.get("language_id") or 0)
        except (TypeError, ValueError):
            continue
        if lang_id <= 0:
            continue
        by_lang_requested[lang_id] = row

    existing_by_lang: dict[int, dict] = {}
    for row in existing:
        try:
            lang_id = int(row.language_id)
        except (TypeError, ValueError):
            continue
        existing_by_lang[lang_id] = _extract_fields_from_model_description(row)

    changed_requested: list[dict] = []
    for lang_id, req in by_lang_requested.items():
        req_fields = _extract_source_fields_from_description(req)
        old_fields = existing_by_lang.get(lang_id)
        if old_fields is None:
            changed_requested.append(req)
            continue
        if not _same_desc_fields(req_fields, old_fields):
            changed_requested.append(req)

    source_desc = _pick_best_source_description(changed_requested or requested)
    source_fields = _extract_source_fields_from_description(source_desc or {})
    source_lang_id = None
    if source_desc:
        try:
            source_lang_id = int(source_desc.get("language_id") or 0)
        except (TypeError, ValueError):
            source_lang_id = None

    lang_to_locale = _invert_language_map(locale_to_language_id)
    source_locale = lang_to_locale.get(source_lang_id or 0, "")
    detected_source_lang = _detect_language_from_texts(source_fields=source_fields)
    hint_lang = str(source_lang_hint or "").strip().lower()
    if hint_lang in {"", "auto"}:
        hint_lang = ""

    if hint_lang:
        source_lang = hint_lang
        source_lang_id_for_keep = None
    else:
    # If text language and mapped language_id disagree, trust detected text language.
    # This happens when users edit DE row (language_id=1) with non-DE text (e.g. RU),
    # and we still must translate to target locales.
        source_lang_id_for_keep = source_lang_id
        if detected_source_lang and source_locale and detected_source_lang != source_locale:
            source_lang = detected_source_lang
            # Do not treat this language_id as immutable source row.
            # Example: language_id=1 (DE) row contains RU text and must be translated to DE.
            source_lang_id_for_keep = None
        else:
            source_lang = source_locale or detected_source_lang

    # Translate only into languages that are already filled for this target product.
    existing_lang_ids = []
    for row in existing:
        try:
            lang_id = int(row.language_id)
        except (TypeError, ValueError):
            continue
        if lang_id not in existing_lang_ids:
            existing_lang_ids.append(lang_id)

    result_by_lang: dict[int, dict] = {}
    for lang_id in existing_lang_ids:
        if lang_id in by_lang_requested and lang_id == (source_lang_id_for_keep or -1):
            requested_row = by_lang_requested[lang_id]
            result_by_lang[lang_id] = {
                "language_id": lang_id,
                "name": requested_row.get("name", "") or "",
                "description": requested_row.get("description", "") or "",
                "tag": requested_row.get("tag", "") or "",
                "meta_title": requested_row.get("meta_title", "") or "",
                "meta_description": requested_row.get("meta_description", "") or "",
                "meta_keyword": requested_row.get("meta_keyword", "") or "",
            }
            continue

        if lang_id in by_lang_requested and lang_id != (source_lang_id or -1):
            requested_row = by_lang_requested[lang_id]
            requested_fields = _extract_source_fields_from_description(requested_row)
            old_fields = existing_by_lang.get(lang_id)
            # Keep explicit edits on non-source language.
            # If value equals old value, treat it as unchanged and overwrite by translation.
            if old_fields is not None and not _same_desc_fields(requested_fields, old_fields):
                result_by_lang[lang_id] = {
                    "language_id": lang_id,
                    "name": requested_row.get("name", "") or "",
                    "description": requested_row.get("description", "") or "",
                    "tag": requested_row.get("tag", "") or "",
                    "meta_title": requested_row.get("meta_title", "") or "",
                    "meta_description": requested_row.get("meta_description", "") or "",
                    "meta_keyword": requested_row.get("meta_keyword", "") or "",
                }
                continue

        if not source_fields:
            continue

        target_locale = lang_to_locale.get(lang_id, "")
        if target_locale and target_locale != source_lang:
            translated_fields, used, errors = _safe_translate_fields(
                source_fields=source_fields,
                source_lang=source_lang,
                target_lang=target_locale,
                translation_cache=translation_cache,
            )
            if used:
                meta["translation_used"] = True
            if errors:
                meta["translation_errors"].extend([f"lang_id={lang_id} {msg}" for msg in errors])
        else:
            translated_fields = dict(source_fields)
        result_by_lang[lang_id] = {
            "language_id": lang_id,
            "name": translated_fields.get("name", "") or "",
            "description": translated_fields.get("description", "") or "",
            "tag": translated_fields.get("tag", "") or "",
            "meta_title": translated_fields.get("meta_title", "") or "",
            "meta_description": translated_fields.get("meta_description", "") or "",
            "meta_keyword": translated_fields.get("meta_keyword", "") or "",
        }

    # Keep explicitly provided languages even if they do not exist on target site yet.
    # Useful when user intentionally adds a new language row.
    for lang_id, row in by_lang_requested.items():
        if lang_id in result_by_lang:
            continue
        result_by_lang[lang_id] = {
            "language_id": lang_id,
            "name": row.get("name", "") or "",
            "description": row.get("description", "") or "",
            "tag": row.get("tag", "") or "",
            "meta_title": row.get("meta_title", "") or "",
            "meta_description": row.get("meta_description", "") or "",
            "meta_keyword": row.get("meta_keyword", "") or "",
        }

    if meta["translation_errors"]:
        meta["translation_error"] = "; ".join(meta["translation_errors"][:10])
    return [result_by_lang[k] for k in sorted(result_by_lang.keys())], meta
