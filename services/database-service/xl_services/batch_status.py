def collect_language_mapping_by_site(job) -> list[dict]:
    rows: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for item in job.items.all().order_by("id"):
        key = (str(item.site or ""), str(item.site_key or ""), str(item.domain or ""))
        if key in seen:
            continue
        seen.add(key)

        details = item.details or {}
        language_map = details.get("language_id_by_locale")
        if not isinstance(language_map, dict) or not language_map:
            continue

        normalized_map: dict[str, int] = {}
        for locale, language_id in language_map.items():
            locale_key = str(locale or "").strip().lower()
            if not locale_key:
                continue
            try:
                normalized_map[locale_key] = int(language_id)
            except (TypeError, ValueError):
                continue
        if not normalized_map:
            continue

        rows.append(
            {
                "site": item.site,
                "site_key": item.site_key,
                "domain": item.domain,
                "target_locale": details.get("target_locale") or "",
                "language_id_by_locale": normalized_map,
            }
        )
    return rows


def collect_translation_status_by_site(job) -> list[dict]:
    rows: list[dict] = []
    for item in job.items.all().order_by("id"):
        details = item.details or {}
        meta = details.get("translation_meta") or {}
        used = bool(meta.get("translation_used"))
        error = meta.get("translation_error")
        if not used and not error:
            continue
        rows.append(
            {
                "site": item.site,
                "site_key": item.site_key,
                "domain": item.domain,
                "translation_used": used,
                "translation_error": str(error) if error else None,
            }
        )
    return rows
