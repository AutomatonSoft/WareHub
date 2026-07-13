from __future__ import annotations

import re

from .models import Kid

PLACE_POOL_MIN = 1
PLACE_POOL_MAX = 100000
POOL_PLACE_PATTERN = re.compile(r"^(?P<base>[1-9]\d{0,4})(?P<suffix>[A-Za-z]?)$")
POOL_PREFIX_PATTERN = re.compile(r"^[1-9]\d{0,4}[A-Za-z]+$")


def _increment_suffix(value: str) -> str:
    normalized = str(value or "").strip().upper()
    if not normalized:
        return "A"
    if len(normalized) != 1 or not ("A" <= normalized <= "Z"):
        return ""
    if normalized == "Z":
        return ""
    return chr(ord(normalized) + 1)


def parse_pool_place(value: object) -> tuple[int, str, str] | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None

    match = POOL_PLACE_PATTERN.fullmatch(normalized)
    if match is None:
        return None

    base = int(match.group("base"))
    if base < PLACE_POOL_MIN or base > PLACE_POOL_MAX:
        return None

    suffix = str(match.group("suffix") or "").upper()
    return base, suffix, f"{base}{suffix}"


def is_invalid_multi_letter_pool_place(value: object) -> bool:
    normalized = str(value or "").strip()
    if not normalized:
        return False
    return POOL_PREFIX_PATTERN.fullmatch(normalized) is not None and parse_pool_place(normalized) is None


def normalize_place(value: object) -> str:
    parsed = parse_pool_place(value)
    if parsed is not None:
        return parsed[2]
    return str(value or "").strip()


def _occupied_pool_bases(*, exclude_kid_id: int | None = None) -> set[int]:
    queryset = Kid.objects.all().order_by("id")
    if exclude_kid_id is not None:
        queryset = queryset.exclude(id=exclude_kid_id)

    occupied_bases: set[int] = set()
    for raw_place in queryset.values_list("place", flat=True):
        parsed_place = parse_pool_place(raw_place)
        if parsed_place is None:
            continue
        occupied_bases.add(parsed_place[0])
    return occupied_bases


def suggest_next_free_base_place(*, exclude_kid_id: int | None = None, start_from: int = PLACE_POOL_MIN) -> str | None:
    occupied_bases = _occupied_pool_bases(exclude_kid_id=exclude_kid_id)
    for base in range(max(PLACE_POOL_MIN, start_from), PLACE_POOL_MAX + 1):
        if base not in occupied_bases:
            return str(base)
    return None


def find_place_conflict(place: object, *, exclude_kid_id: int | None = None) -> Kid | None:
    normalized_place = normalize_place(place)
    if not normalized_place:
        return None

    queryset = Kid.objects.filter(place__iexact=normalized_place).order_by("id")
    if exclude_kid_id is not None:
        queryset = queryset.exclude(id=exclude_kid_id)
    return queryset.first()


def suggest_nearest_free_place(place: object, *, exclude_kid_id: int | None = None) -> str | None:
    parsed = parse_pool_place(place)
    if parsed is None:
        return None

    base, suffix, _ = parsed
    queryset = Kid.objects.all().order_by("id")
    if exclude_kid_id is not None:
        queryset = queryset.exclude(id=exclude_kid_id)

    occupied: set[str] = set()
    occupied_bases: set[int] = set()
    for raw_place in queryset.values_list("place", flat=True):
        parsed_place = parse_pool_place(raw_place)
        if parsed_place is None:
            continue
        current_base, _, normalized = parsed_place
        occupied_bases.add(current_base)
        if current_base == base:
            occupied.add(normalized)

    next_suffix = _increment_suffix(suffix)
    while next_suffix:
        candidate = f"{base}{next_suffix}"
        if candidate not in occupied:
            return candidate
        next_suffix = _increment_suffix(next_suffix)

    for next_base in range(base + 1, PLACE_POOL_MAX + 1):
        if next_base not in occupied_bases:
            return str(next_base)
    return None


def suggest_same_base_subplace(place: object, *, exclude_kid_id: int | None = None) -> str | None:
    parsed = parse_pool_place(place)
    if parsed is None:
        return None

    base, suffix, _ = parsed
    queryset = Kid.objects.all().order_by("id")
    if exclude_kid_id is not None:
        queryset = queryset.exclude(id=exclude_kid_id)

    occupied: set[str] = set()
    for raw_place in queryset.values_list("place", flat=True):
        parsed_place = parse_pool_place(raw_place)
        if parsed_place is None:
            continue
        current_base, _, normalized = parsed_place
        if current_base == base:
            occupied.add(normalized)

    next_suffix = _increment_suffix(suffix)
    while next_suffix:
        candidate = f"{base}{next_suffix}"
        if candidate not in occupied:
            return candidate
        next_suffix = _increment_suffix(next_suffix)
    return None


def list_available_pool_places(*, limit: int = 250, exclude_kid_id: int | None = None) -> list[str]:
    queryset = Kid.objects.all().order_by("id")
    if exclude_kid_id is not None:
        queryset = queryset.exclude(id=exclude_kid_id)

    occupied_exact_places: set[str] = set()
    highest_base = PLACE_POOL_MIN
    for raw_place in queryset.values_list("place", flat=True):
        parsed_place = parse_pool_place(raw_place)
        if parsed_place is None:
            continue
        base, _, normalized = parsed_place
        highest_base = max(highest_base, base)
        occupied_exact_places.add(normalized)

    candidates: list[str] = []
    scan_limit = max(PLACE_POOL_MIN + limit, highest_base + 1)
    for base in range(PLACE_POOL_MIN, min(scan_limit, PLACE_POOL_MAX) + 1):
        if str(base) not in occupied_exact_places:
            candidates.append(str(base))
            if len(candidates) >= limit:
                return candidates

    return candidates
