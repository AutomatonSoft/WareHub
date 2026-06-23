from __future__ import annotations


def normalize_kid_numbers(value: object) -> list[str]:
    if value is None:
        return []

    if isinstance(value, str):
        raw_values = [value]
    elif isinstance(value, (list, tuple, set)):
        raw_values = list(value)
    else:
        raw_values = [value]

    result: list[str] = []
    seen: set[str] = set()
    for item in raw_values:
        normalized = str(item or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def primary_kid_number(value: object) -> str:
    normalized = normalize_kid_numbers(value)
    return normalized[-1] if normalized else ""


def kid_number_contains(value: object, candidate: object) -> bool:
    normalized_candidate = str(candidate or "").strip()
    if not normalized_candidate:
        return False
    return normalized_candidate in normalize_kid_numbers(value)
