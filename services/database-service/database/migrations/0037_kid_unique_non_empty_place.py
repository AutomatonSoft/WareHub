from django.db import migrations, models
from django.db.models import Q


PLACE_POOL_MIN = 1
PLACE_POOL_MAX = 100000


def _parse_pool_place(raw: object) -> tuple[int, str, str] | None:
    text = str(raw or "").strip()
    if not text:
        return None
    base_part = ""
    suffix_part = ""
    for char in text:
        if char.isdigit() and not suffix_part:
            base_part += char
            continue
        suffix_part += char
    if not base_part or (suffix_part and (len(suffix_part) != 1 or not suffix_part.isalpha())):
        return None
    base = int(base_part)
    if base < PLACE_POOL_MIN or base > PLACE_POOL_MAX:
        return None
    suffix = suffix_part.upper()
    return base, suffix, f"{base}{suffix}"


def _next_suffix(suffix: str) -> str | None:
    normalized = str(suffix or "").strip().upper()
    if not normalized:
        return "A"
    if len(normalized) != 1 or not ("A" <= normalized <= "Z"):
        return None
    if normalized == "Z":
        return None
    return chr(ord(normalized) + 1)


def _deduplicate_existing_places(apps, schema_editor) -> None:
    Kid = apps.get_model("database", "Kid")
    db_alias = schema_editor.connection.alias

    rows = list(
        Kid.objects.using(db_alias)
        .exclude(place__isnull=True)
        .exclude(place="")
        .order_by("id")
        .values("id", "place")
    )

    occupied_exact: set[str] = set()
    occupied_bases: set[int] = set()
    updates: list[tuple[int, str]] = []

    for row in rows:
        kid_id = int(row["id"])
        raw_place = str(row["place"] or "").strip()
        parsed = _parse_pool_place(raw_place)

        if parsed is None:
            if raw_place not in occupied_exact:
                occupied_exact.add(raw_place)
            continue

        base, suffix, normalized = parsed
        occupied_bases.add(base)
        if normalized not in occupied_exact:
            occupied_exact.add(normalized)
            continue

        replacement = None
        next_suffix = _next_suffix(suffix)
        while next_suffix is not None:
            candidate = f"{base}{next_suffix}"
            if candidate not in occupied_exact:
                replacement = candidate
                break
            next_suffix = _next_suffix(next_suffix)

        if replacement is None:
            for next_base in range(base + 1, PLACE_POOL_MAX + 1):
                candidate = str(next_base)
                if next_base not in occupied_bases and candidate not in occupied_exact:
                    replacement = candidate
                    occupied_bases.add(next_base)
                    break

        if replacement is None:
            raise RuntimeError(f"Could not assign unique place for Kid id={kid_id} from duplicate place '{raw_place}'.")

        occupied_exact.add(replacement)
        parsed_replacement = _parse_pool_place(replacement)
        if parsed_replacement is not None:
            occupied_bases.add(parsed_replacement[0])
        updates.append((kid_id, replacement))

    for kid_id, replacement in updates:
        Kid.objects.using(db_alias).filter(id=kid_id).update(place=replacement)


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0036_merge_0035_alter_ean_jv_0035_alter_kid_place"),
    ]

    operations = [
        migrations.RunPython(_deduplicate_existing_places, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="kid",
            constraint=models.UniqueConstraint(
                fields=("place",),
                condition=Q(place__isnull=False) & ~Q(place=""),
                name="uniq_kid_non_empty_place",
            ),
        ),
    ]
