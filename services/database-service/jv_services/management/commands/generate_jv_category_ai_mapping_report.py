import json
from difflib import SequenceMatcher
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from catalog_core.translation_openai import translate_fields_batch
from jv_services.source_categories import (
    _build_unique_category_signature_map,
    _category_signatures,
    _fetch_category_rows,
    _normalize_category_token,
)
from jv_services.source_config import source_db_config_for_site
from jv_services.source_connection import mysql_connect


def _category_parent_id(row: dict) -> int:
    for key in ("parentid", "parent_id"):
        try:
            return int(row.get(key) or 0)
        except (TypeError, ValueError):
            continue
    return 0


def _category_name(row: dict) -> str:
    names = row.get("content_names") or []
    if names:
        return str(names[0] or "").strip()
    return str(row.get("rubnum") or "").strip()


def _category_path(row: dict, rows_by_id: dict[int, dict]) -> list[dict]:
    path = []
    current = row
    seen = set()
    while current:
        try:
            rubid = int(current.get("rubid") or 0)
        except (TypeError, ValueError):
            break
        if rubid <= 0 or rubid in seen:
            break
        seen.add(rubid)
        path.append(
            {
                "rubid": rubid,
                "rubnum": str(current.get("rubnum") or ""),
                "name": _category_name(current),
            }
        )
        parent_id = _category_parent_id(current)
        if parent_id <= 0:
            break
        current = rows_by_id.get(parent_id)
    path.reverse()
    return path


def _root_key(row: dict) -> str:
    rubnum = str(row.get("rubnum") or "").strip()
    if not rubnum:
        return ""
    return _normalize_category_token(rubnum.split(".", 1)[0]).replace(" ", "")


def _score(left: str, right: str) -> float:
    left_norm = _normalize_category_token(left).replace("&", "and")
    right_norm = _normalize_category_token(right).replace("&", "and")
    if not left_norm or not right_norm:
        return 0.0
    if left_norm == right_norm:
        return 1.0
    return SequenceMatcher(None, left_norm, right_norm).ratio()


def _load_rows(site: str, site_key: str) -> dict[int, dict]:
    db_config = source_db_config_for_site(site, site_key=site_key)
    if not db_config:
        raise CommandError(f"JV source DB is not configured for site={site}, site_key={site_key}.")
    conn = mysql_connect(db_config)
    try:
        cur = conn.cursor(dictionary=True)
        return _fetch_category_rows(cur)
    finally:
        conn.close()


def _translate_names(names: list[str], *, chunk_size: int) -> dict[str, str]:
    translated_by_name: dict[str, str] = {}
    for start in range(0, len(names), chunk_size):
        chunk = names[start:start + chunk_size]
        fields = {f"k{idx}": name for idx, name in enumerate(chunk)}
        translated = translate_fields_batch(
            source_fields=fields,
            source_lang="de",
            target_lang="en",
            translatable_fields=tuple(fields.keys()),
        )
        for idx, name in enumerate(chunk):
            translated_by_name[name] = str(translated.get(f"k{idx}") or name).strip()
    return translated_by_name


class Command(BaseCommand):
    help = "Generate an offline AI-assisted JV category mapping report. Read-only for source DBs."

    def add_arguments(self, parser):
        parser.add_argument("--site", default="JV")
        parser.add_argument("--source-site-key", default="JV_DE")
        parser.add_argument("--target-site-key", default="JV_CO_UK")
        parser.add_argument("--output", required=True)
        parser.add_argument("--top", type=int, default=5)
        parser.add_argument("--chunk-size", type=int, default=60)
        parser.add_argument("--auto-score", type=float, default=0.90)
        parser.add_argument("--auto-gap", type=float, default=0.04)
        parser.add_argument(
            "--no-openai",
            action="store_true",
            help="Skip translation and compare source names as-is.",
        )

    def handle(self, *args, **options):
        site = str(options["site"] or "JV").strip().upper()
        source_site_key = str(options["source_site_key"] or "JV_DE").strip().upper()
        target_site_key = str(options["target_site_key"] or "JV_CO_UK").strip().upper()
        top_limit = max(1, int(options["top"] or 5))
        chunk_size = max(1, min(int(options["chunk_size"] or 60), 100))
        auto_score = float(options["auto_score"])
        auto_gap = float(options["auto_gap"])
        output_path = Path(str(options["output"]))

        source_rows = _load_rows(site, source_site_key)
        target_rows = _load_rows(site, target_site_key)
        target_signature_map = _build_unique_category_signature_map(target_rows)

        target_candidates = []
        for target_id, target_row in target_rows.items():
            target_candidates.append(
                {
                    "rubid": int(target_id),
                    "rubnum": str(target_row.get("rubnum") or ""),
                    "name": _category_name(target_row),
                    "root_key": _root_key(target_row),
                    "path": _category_path(target_row, target_rows),
                }
            )

        exact_mapped = []
        missing = []
        for source_id, source_row in source_rows.items():
            source_signatures = _category_signatures(source_row, source_rows)
            matched_target_id = None
            matched_by = ""
            for signature in source_signatures:
                matched_target_id = target_signature_map.get(signature)
                if matched_target_id is not None:
                    matched_by = signature[0]
                    break
            if matched_target_id is not None:
                exact_mapped.append(
                    {
                        "source_rubid": int(source_id),
                        "target_rubid": int(matched_target_id),
                        "matched_by": matched_by,
                    }
                )
                continue
            missing.append(
                {
                    "source_rubid": int(source_id),
                    "source_rubnum": str(source_row.get("rubnum") or ""),
                    "source_name": _category_name(source_row),
                    "source_root_key": _root_key(source_row),
                    "source_path": _category_path(source_row, source_rows),
                }
            )

        unique_source_names = []
        seen_names = set()
        for item in missing:
            name = item["source_name"]
            if name and name not in seen_names:
                seen_names.add(name)
                unique_source_names.append(name)

        translations = {}
        if options["no_openai"]:
            translations = {name: name for name in unique_source_names}
        else:
            translations = _translate_names(unique_source_names, chunk_size=chunk_size)

        accepted = []
        review = []
        for item in missing:
            translated_name = translations.get(item["source_name"], item["source_name"])
            candidates = []
            for target in target_candidates:
                same_root = item["source_root_key"] and item["source_root_key"] == target["root_key"]
                name_score = _score(translated_name, target["name"])
                if name_score <= 0:
                    continue
                weighted_score = name_score + (0.08 if same_root else 0.0)
                if name_score < 0.72 and not same_root:
                    continue
                candidates.append(
                    {
                        "target_rubid": target["rubid"],
                        "target_rubnum": target["rubnum"],
                        "target_name": target["name"],
                        "target_path": target["path"],
                        "same_root": bool(same_root),
                        "name_score": round(name_score, 4),
                        "weighted_score": round(weighted_score, 4),
                    }
                )
            candidates.sort(key=lambda row: row["weighted_score"], reverse=True)
            candidates = candidates[:top_limit]

            top = candidates[0] if candidates else None
            second = candidates[1] if len(candidates) > 1 else None
            is_auto_accepted = bool(
                top
                and top["same_root"]
                and top["name_score"] >= auto_score
                and (second is None or top["weighted_score"] - second["weighted_score"] >= auto_gap)
            )
            report_item = {
                **item,
                "translated_name": translated_name,
                "candidates": candidates,
            }
            if is_auto_accepted:
                accepted.append(
                    {
                        **report_item,
                        "suggested_target_rubid": top["target_rubid"],
                        "suggested_target_name": top["target_name"],
                        "confidence": "high",
                    }
                )
            else:
                review.append(report_item)

        report = {
            "mode": "ai_assisted_offline_mapping_report",
            "source_site_key": source_site_key,
            "target_site_key": target_site_key,
            "summary": {
                "source_rows": len(source_rows),
                "target_rows": len(target_rows),
                "exact_mapped": len(exact_mapped),
                "missing_after_exact": len(missing),
                "ai_high_confidence": len(accepted),
                "needs_review": len(review),
            },
            "exact_mapped": exact_mapped,
            "ai_high_confidence": accepted,
            "needs_review": review,
        }

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        self.stdout.write(json.dumps(report["summary"], ensure_ascii=False, indent=2))
        self.stdout.write(f"Report written to {output_path}")
