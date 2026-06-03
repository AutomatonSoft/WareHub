def invert_language_map(locale_to_id: dict) -> dict[int, str]:
    result: dict[int, str] = {}
    for locale, lang_id in (locale_to_id or {}).items():
        try:
            parsed = int(lang_id)
        except (TypeError, ValueError):
            continue
        locale_key = str(locale or "").strip().lower()
        if not locale_key:
            continue
        if parsed not in result:
            result[parsed] = locale_key
    return result


def extract_source_fields_from_description(desc: dict, translatable_fields: tuple[str, ...]) -> dict:
    fields: dict = {}
    for key in translatable_fields:
        value = str((desc or {}).get(key) or "").strip()
        if value:
            fields[key] = value
    return fields


def same_desc_fields(left: dict, right: dict, translatable_fields: tuple[str, ...]) -> bool:
    for key in translatable_fields:
        if str(left.get(key) or "").strip() != str(right.get(key) or "").strip():
            return False
    return True


def pick_best_source_description(descriptions: list[dict], translatable_fields: tuple[str, ...]) -> dict | None:
    if not descriptions:
        return None

    ranked: list[tuple[int, dict]] = []
    for desc in descriptions:
        fields = extract_source_fields_from_description(desc, translatable_fields)
        score = sum(len(str(fields.get(key) or "")) for key in translatable_fields)
        ranked.append((score, desc))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return ranked[0][1] if ranked else None
