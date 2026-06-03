import re
from datetime import date, datetime

from django.db import models
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from database.models import EANPool, EANUsage

from .models import ImportedProduct
from .source_client import JV_LANGUAGE_ID_BY_CODE


def normalize_site(site_raw: str | None) -> str | None:
    if site_raw in (None, ""):
        return None
    value = str(site_raw).strip().upper()
    if value != ImportedProduct.Site.JV:
        return None
    return value


def normalize_site_key(site_key_raw: str | None) -> str | None:
    if site_key_raw in (None, ""):
        return None
    value = str(site_key_raw).strip().upper()
    value = re.sub(r"[^A-Z0-9]+", "_", value)
    value = value.strip("_")
    if not value:
        return None
    return value


def resolve_product_by_ean(ean: str, site_raw: str | None, site_key_raw: str | None):
    site = normalize_site(site_raw)
    if site_raw and site is None:
        return None, Response(
            {"detail": "site должен быть 'JV'."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    site_key = normalize_site_key(site_key_raw) or ""

    queryset = ImportedProduct.objects.filter(ean=ean.strip())
    if site:
        queryset = queryset.filter(site=site)
    queryset = queryset.filter(site_key=site_key)

    if not queryset.exists():
        return None, Response(
            {"detail": "Товар с таким ean не найден."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return queryset.first(), None


def session_actor(request) -> str:
    return str(
        request.session.get("username")
        or request.session.get("user")
        or request.session.get("email")
        or request.session.get("role")
        or "system_import"
    )


def request_body_for_hash(request):
    data = getattr(request, "data", None)
    if data is None:
        return {}
    if isinstance(data, dict):
        return data
    if hasattr(data, "dict"):
        return data.dict()
    return str(data)


def to_date_or_none(value):
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


def to_datetime_or_none(value):
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


def next_temp_source_product_id(site: str, site_key: str) -> int:
    min_value = (
        ImportedProduct.all_objects.filter(site=site, site_key=site_key)
        .aggregate(models.Min("source_product_id"))
        .get("source_product_id__min")
    )
    if min_value is None or int(min_value) >= 0:
        return -1
    return int(min_value) - 1


def take_free_ean_from_pool(*, site: str, site_key: str, actor: str) -> tuple[str | None, str | None]:
    pool_item = (
        EANPool.objects.select_for_update()
        .filter(status="free")
        .order_by("ean", "id")
        .first()
    )
    if pool_item is None:
        return None, "jv_ean_pool_empty"
    pool_item.status = "used"
    pool_item.reserved_by = str(actor or "")
    pool_item.reserved_at = timezone.now()
    pool_item.used_at = timezone.now()
    pool_item.save(update_fields=["status", "reserved_by", "reserved_at", "used_at", "updated_at"])
    EANUsage.objects.update_or_create(
        ean=pool_item,
        site=site,
        site_key=site_key,
        defaults={},
    )
    return str(pool_item.ean), None


def apply_jv_fields_to_payload(payload: dict, *, site: str, existing_descriptions=None):
    if site != ImportedProduct.Site.JV:
        payload.pop("jv_fields", None)
        return
    jv_fields = payload.pop("jv_fields", None)
    if not isinstance(jv_fields, dict):
        return
    payload["_jv_fields"] = dict(jv_fields)

    if "artikelnr" in jv_fields and jv_fields.get("artikelnr") is not None:
        payload["source_model"] = str(jv_fields.get("artikelnr") or "").strip()
    if "jfsku" in jv_fields and jv_fields.get("jfsku") is not None:
        payload["source_sku"] = str(jv_fields.get("jfsku") or "").strip()
    if "ean" in jv_fields and jv_fields.get("ean") is not None:
        payload["source_ean_field"] = str(jv_fields.get("ean") or "").strip()
    if "inaktiv" in jv_fields:
        try:
            payload["status"] = int(jv_fields.get("inaktiv") or 0) != 1
        except (TypeError, ValueError):
            pass

    content_rows = jv_fields.get("content_by_language")
    if not isinstance(content_rows, list):
        return

    existing_by_lang = {}
    for row in (existing_descriptions or []):
        lang_id = int(getattr(row, "language_id", 0) or 0)
        if lang_id > 0:
            existing_by_lang[lang_id] = row

    descriptions = []
    for row in content_rows:
        if not isinstance(row, dict):
            continue
        lang_code = str(row.get("language_code") or "").strip().lower()
        if not lang_code:
            continue
        lang_id = JV_LANGUAGE_ID_BY_CODE.get(lang_code)
        if not lang_id:
            continue

        existing = existing_by_lang.get(int(lang_id))
        name = str(row.get("name") or "")
        keywords = str(row.get("keywords") or "")
        description_html = str(row.get("description") or row.get("bezeichnung_html") or "")
        meta_title = str(row.get("meta_title") or "")
        meta_description = str(row.get("meta_description") or "")
        meta_keyword = str(row.get("meta_keyword") or "")

        descriptions.append(
            {
                "language_id": int(lang_id),
                "name": name or (getattr(existing, "name", "") if existing else ""),
                "description": description_html or (getattr(existing, "description", "") if existing else ""),
                "tag": getattr(existing, "tag", "") if existing else "",
                "meta_title": meta_title or name or (getattr(existing, "meta_title", "") if existing else ""),
                "meta_description": meta_description or (getattr(existing, "meta_description", "") if existing else ""),
                "meta_keyword": meta_keyword or keywords or (getattr(existing, "meta_keyword", "") if existing else ""),
                "is_modified_locally": True,
            }
        )

    if descriptions:
        payload["descriptions"] = descriptions
