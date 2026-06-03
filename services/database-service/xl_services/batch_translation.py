import json
import logging
import re

from catalog_core.descriptions_shared import (
    extract_source_fields_from_description as _shared_extract_source_fields_from_description,
    invert_language_map as _shared_invert_language_map,
    pick_best_source_description as _shared_pick_best_source_description,
    same_desc_fields as _shared_same_desc_fields,
)
from catalog_core.text_language import detect_language_from_texts as _shared_detect_language_from_texts
from catalog_core.translation_openai import (
    extract_response_output_text as _shared_extract_response_output_text,
    translate_fields_batch as _shared_translate_fields_batch,
    translate_text as _shared_translate_text,
)

from .batch_config import DEFAULT_LANGUAGE_ID_BY_LOCALE
from .models import ImportedProductDescription
from .source_client import fetch_xl_language_id_by_locale as fetch_source_language_id_by_locale

logger = logging.getLogger(__name__)

TRANSLATABLE_FIELDS = ("name", "description", "tag", "meta_title", "meta_description", "meta_keyword")
CYRILLIC_RE = re.compile(r"[\u0400-\u04FF]")


def translate_text(*, text: str, source_lang: str, target_lang: str):
    return _shared_translate_text(text=text, source_lang=source_lang, target_lang=target_lang)


def extract_response_output_text(payload: dict) -> str:
    return _shared_extract_response_output_text(payload)


def translate_fields_batch(*, source_fields: dict, source_lang: str, target_lang: str) -> dict:
    return _shared_translate_fields_batch(
        source_fields=source_fields,
        source_lang=source_lang,
        target_lang=target_lang,
        translatable_fields=TRANSLATABLE_FIELDS,
    )


def extract_translation_source_from_snapshot(*, snapshot: dict, source_locale: str, language_id_by_locale: dict):
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


def language_map_for_site(
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
                    "XL_LANGUAGE_MAP_FETCH_FAILED code=xl_language_map_fetch_failed site_key=%s",
                    cache_key,
                    exc_info=True,
                )
        cache[cache_key] = discovered

    merged = dict(DEFAULT_LANGUAGE_ID_BY_LOCALE)
    merged.update(discovered)
    merged.update(language_id_by_locale_override or {})
    return merged


def detect_language_from_texts(*, source_fields: dict) -> str:
    return _shared_detect_language_from_texts(
        source_fields=source_fields,
        translatable_fields=TRANSLATABLE_FIELDS,
    )


def build_translated_descriptions(*, source_fields: dict, source_lang: str, target_locale: str, language_id_by_locale: dict):
    target_language_id = int(language_id_by_locale.get(target_locale, DEFAULT_LANGUAGE_ID_BY_LOCALE.get(target_locale, 1)))
    translated = {"language_id": target_language_id}
    for key in TRANSLATABLE_FIELDS:
        value = str(source_fields.get(key) or "")
        if value:
            translated[key] = translate_text(text=value, source_lang=source_lang, target_lang=target_locale)
    return [translated]


def invert_language_map(locale_to_id: dict) -> dict[int, str]:
    return _shared_invert_language_map(locale_to_id)


def extract_source_fields_from_description(desc: dict) -> dict:
    return _shared_extract_source_fields_from_description(desc, TRANSLATABLE_FIELDS)


def extract_fields_from_model_description(desc: ImportedProductDescription) -> dict:
    return {
        "name": str(desc.name or ""),
        "description": str(desc.description or ""),
        "tag": str(desc.tag or ""),
        "meta_title": str(desc.meta_title or ""),
        "meta_description": str(desc.meta_description or ""),
        "meta_keyword": str(desc.meta_keyword or ""),
    }


def same_desc_fields(left: dict, right: dict) -> bool:
    return _shared_same_desc_fields(left, right, TRANSLATABLE_FIELDS)


def pick_best_source_description(descriptions: list[dict]) -> dict | None:
    return _shared_pick_best_source_description(descriptions, TRANSLATABLE_FIELDS)


def safe_translate_fields(
    *,
    source_fields: dict,
    source_lang: str,
    target_lang: str,
    translation_cache: dict | None = None,
) -> tuple[dict, bool, list[str]]:
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
    validate_source_script = str(target_lang or "").strip().lower() != "ru" and any(
        CYRILLIC_RE.search(str(source_fields.get(key) or ""))
        for key in TRANSLATABLE_FIELDS
    )
    try:
        translated_batch = translate_fields_batch(
            source_fields=source_fields,
            source_lang=source_lang,
            target_lang=target_lang,
        )
        if translated_batch:
            translated.update(translated_batch)
            if validate_source_script:
                for key in list(translated.keys()):
                    if CYRILLIC_RE.search(str(translated.get(key) or "")):
                        translated.pop(key, None)
                        errors.append(f"{key}: translation_kept_source_script_fallback")
            used = True
    except Exception as exc:
        logger.warning(
            "XL_TRANSLATE_BATCH_FALLBACK code=xl_translate_batch_fallback source_lang=%s target_lang=%s",
            source_lang,
            target_lang,
            exc_info=True,
        )
        errors.append("batch: translation_failed_fallback")

        text = str(exc).lower()
        if "timed out" in text or "timeout" in text:
            return dict(source_fields), False, errors

    for key in TRANSLATABLE_FIELDS:
        if key in translated and str(translated.get(key) or ""):
            continue
        value = str(source_fields.get(key) or "")
        if not value:
            continue
        try:
            translated_value = translate_text(text=value, source_lang=source_lang, target_lang=target_lang)
            if validate_source_script and CYRILLIC_RE.search(str(translated_value or "")):
                translated[key] = value
                errors.append(f"{key}: translation_kept_source_script")
            else:
                translated[key] = translated_value
            used = True
        except Exception:
            logger.warning(
                "XL_TRANSLATE_FIELD_FALLBACK code=xl_translate_field_fallback source_lang=%s target_lang=%s field=%s",
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


def build_multilang_descriptions_for_site(
    *,
    requested_descriptions: list[dict],
    existing_descriptions: list[ImportedProductDescription],
    locale_to_language_id: dict,
    translation_cache: dict | None = None,
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
        existing_by_lang[lang_id] = extract_fields_from_model_description(row)

    changed_requested: list[dict] = []
    for lang_id, req in by_lang_requested.items():
        req_fields = extract_source_fields_from_description(req)
        old_fields = existing_by_lang.get(lang_id)
        if old_fields is None:
            changed_requested.append(req)
            continue
        if not same_desc_fields(req_fields, old_fields):
            changed_requested.append(req)

    source_desc = pick_best_source_description(changed_requested or requested)
    source_fields = extract_source_fields_from_description(source_desc or {})
    source_lang_id = None
    if source_desc:
        try:
            source_lang_id = int(source_desc.get("language_id") or 0)
        except (TypeError, ValueError):
            source_lang_id = None

    lang_to_locale = invert_language_map(locale_to_language_id)
    source_locale = lang_to_locale.get(source_lang_id or 0, "")
    source_lang = source_locale or detect_language_from_texts(source_fields=source_fields)

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
        if lang_id in by_lang_requested and lang_id == (source_lang_id or -1):
            requested_row = by_lang_requested[lang_id]
            result_by_lang[lang_id] = _description_payload(lang_id, requested_row)
            continue

        if lang_id in by_lang_requested and lang_id != (source_lang_id or -1):
            requested_row = by_lang_requested[lang_id]
            requested_fields = extract_source_fields_from_description(requested_row)
            old_fields = existing_by_lang.get(lang_id)
            if old_fields is not None and not same_desc_fields(requested_fields, old_fields):
                result_by_lang[lang_id] = _description_payload(lang_id, requested_row)
                continue

        if not source_fields:
            continue

        target_locale = lang_to_locale.get(lang_id, "")
        if target_locale and target_locale != source_lang:
            translated_fields, used, errors = safe_translate_fields(
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
        result_by_lang[lang_id] = _description_payload(lang_id, translated_fields)

    for lang_id, row in by_lang_requested.items():
        if lang_id in result_by_lang:
            continue
        result_by_lang[lang_id] = _description_payload(lang_id, row)

    if meta["translation_errors"]:
        meta["translation_error"] = "; ".join(meta["translation_errors"][:10])
    return [result_by_lang[k] for k in sorted(result_by_lang.keys())], meta


def _description_payload(language_id: int, row: dict) -> dict:
    return {
        "language_id": language_id,
        "name": row.get("name", "") or "",
        "description": row.get("description", "") or "",
        "tag": row.get("tag", "") or "",
        "meta_title": row.get("meta_title", "") or "",
        "meta_description": row.get("meta_description", "") or "",
        "meta_keyword": row.get("meta_keyword", "") or "",
    }
