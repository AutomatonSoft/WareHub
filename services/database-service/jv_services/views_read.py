import logging
import re

import mysql.connector
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission

from .models import ImportedProduct
from .serializers import ImportedProductDetailSerializer
from .source_client import (
    JV_LANGUAGE_ID_BY_CODE,
    fetch_source_product_snapshot_by_artikelnr,
    jv_site_catalog,
    source_db_config_for_site,
)
from .sync_utils import (
    add_jv_public_image_urls,
    build_source_payload,
    effective_ean_from_source,
    resolve_local_product_for_source,
)
from .source_connection import mysql_connect
from .source_values import fetch_jv_lieferzeit_options, jv_urlkey, process_uvp
from .view_helpers import (
    normalize_site as _normalize_site,
    normalize_site_key as _normalize_site_key,
)

logger = logging.getLogger(__name__)
JV_LANGUAGE_CODE_BY_ID = {int(value): str(key).lower() for key, value in JV_LANGUAGE_ID_BY_CODE.items()}


def _brief_row_from_snapshot(snapshot: dict) -> dict | None:
    product = (snapshot or {}).get("product") or {}
    if not product:
        return None

    descriptions = (snapshot or {}).get("descriptions") or []
    title = ""
    if descriptions:
        title = str((descriptions[0] or {}).get("name") or "").strip()

    return {
        "product_id": product.get("product_id"),
        "ean": product.get("ean"),
        "model": product.get("model"),
        "price": product.get("price"),
        "currency_code": (snapshot or {}).get("jv_fields", {}).get("currency_code"),
        "title": title,
    }

class JVProductByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, ean: str):
        site = _normalize_site(request.query_params.get("site"))
        site_key = _normalize_site_key(request.query_params.get("site_key"))
        if site is None:
            return Response(
                {"detail": "Передайте query-параметр ?site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        db_config = source_db_config_for_site(site, site_key=site_key)
        if not db_config:
            return Response(
                {
                    "detail": (
                        f"Не настроены credentials source DB для site={site}"
                        f"{f', site_key={site_key}' if site_key else ''}. "
                        "Ожидаются env: JV_SOURCE_<SITE>[_<SITE_KEY>]_DB_HOST/USER/PASSWORD/NAME[/PORT]."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            snapshot = fetch_source_product_snapshot_by_artikelnr(db_config, ean.strip())
        except Exception as exc:
            logger.exception(
                "JV_SOURCE_FETCH_FAILED code=jv_source_fetch_failed ean=%s site=%s site_key=%s",
                ean,
                site,
                site_key,
            )
            return Response(
                {
                    "code": "jv_source_fetch_failed",
                    "detail": "Failed to read product from source DB.",
                    "error": str(exc),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        if not snapshot:
            return Response(
                {"detail": f"Товар не найден в source DB по указанному artikelnr (site={site})."},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = build_source_payload(snapshot, site=site, site_key=site_key or "", query_ean=ean.strip())
        return Response(payload, status=status.HTTP_200_OK)


class JVSitesByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, ean: str):
        site = ImportedProduct.Site.JV
        normalized_ean = ean.strip()
        if not normalized_ean:
            return Response({"detail": "EAN is required."}, status=status.HTTP_400_BAD_REQUEST)

        found = []
        missing = []
        catalog = jv_site_catalog(_normalize_site_key)

        for site_info in catalog:
            site_key = site_info["site_key"]
            domain = site_info["domain"]
            db_config = source_db_config_for_site(site, site_key=site_key)
            if not db_config:
                missing.append({"site_key": site_key, "domain": domain, "reason": "not_configured"})
                continue

            try:
                snapshot = fetch_source_product_snapshot_by_artikelnr(
                    db_config,
                    normalized_ean,
                )
            except Exception as exc:
                logger.warning(
                    "JV_ALL_SITES_QUERY_ERROR code=jv_all_sites_query_error site=%s site_key=%s domain=%s error=%s",
                    site,
                    site_key,
                    domain,
                    str(exc),
                )
                missing.append(
                    {
                        "site_key": site_key,
                        "domain": domain,
                        "reason": "query_error",
                        "error": str(exc),
                    }
                )
                continue

            row = _brief_row_from_snapshot(snapshot)
            if not row:
                missing.append({"site_key": site_key, "domain": domain, "reason": "not_found"})
                continue

            effective_ean = effective_ean_from_source(row, fallback=normalized_ean)
            found.append(
                {
                    "site_key": site_key,
                    "domain": domain,
                    "product_id": row.get("product_id"),
                    "ean": effective_ean,
                    "price": row.get("price"),
                    "currency_code": row.get("currency_code"),
                    "title": row.get("title") or "",
                }
            )

        return Response(
            {
                "site": site,
                "query_ean": normalized_ean,
                "found": found,
                "missing": missing,
                "found_count": len(found),
                "missing_count": len(missing),
            },
            status=status.HTTP_200_OK,
        )




class JVLocalProductByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, ean: str):
        site = _normalize_site(request.query_params.get("site"))
        site_key = _normalize_site_key(request.query_params.get("site_key"))
        if site is None:
            return Response(
                {"detail": "Передайте query-параметр ?site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalized_ean = ean.strip()
        product = ImportedProduct.objects.filter(
            site=site,
            site_key=site_key or "",
            ean=normalized_ean,
        ).first()
        if product is not None:
            return Response(_serialize_local_jv_product(product, site_key=site_key or ""), status=status.HTTP_200_OK)

        product = None
        conflict_product = None
        normalized_site_key = site_key or ""
        snapshot = None

        db_config = source_db_config_for_site(site, site_key=site_key)
        if db_config:
            try:
                snapshot = fetch_source_product_snapshot_by_artikelnr(db_config, normalized_ean)
            except Exception as exc:
                logger.exception(
                    "JV_LOCAL_SOURCE_FETCH_FAILED code=jv_local_source_fetch_failed ean=%s site=%s site_key=%s",
                    normalized_ean,
                    site,
                    site_key,
                )
                return Response(
                    {
                        "code": "jv_source_fetch_failed",
                        "detail": "Failed to read product from source DB.",
                        "error": str(exc),
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            if snapshot:
                source_product_id = snapshot["product"]["product_id"]
                effective_ean = effective_ean_from_source(snapshot["product"], fallback=normalized_ean)
                product, conflict_product = resolve_local_product_for_source(
                    site=site,
                    site_key=normalized_site_key,
                    source_product_id=source_product_id,
                    effective_ean=effective_ean,
                )

        if product is None and conflict_product is None:
            product = ImportedProduct.objects.filter(
                site=site,
                site_key=normalized_site_key,
                ean=normalized_ean,
            ).first()

        if conflict_product is not None:
            return Response(
                {
                    "code": "jv_local_product_conflict",
                    "detail": "В локальной БД найден другой товар с таким EAN и другим source product_id.",
                    "local_id": conflict_product.id,
                    "local_source_product_id": conflict_product.source_product_id,
                },
                status=status.HTTP_409_CONFLICT,
            )

        if product is None:
            return Response({"detail": "Товар с таким ean не найден."}, status=status.HTTP_404_NOT_FOUND)

        result = ImportedProductDetailSerializer(product).data
        if site == ImportedProduct.Site.JV:
            result["jv_fields"] = (snapshot or {}).get("jv_fields") if isinstance((snapshot or {}).get("jv_fields"), dict) else None
            source_product = (snapshot or {}).get("product") if isinstance(snapshot, dict) else None
            source_images = (snapshot or {}).get("images") if isinstance(snapshot, dict) else None
            if isinstance(source_product, dict):
                if not str(result.get("image") or "").strip():
                    result["image"] = source_product.get("image") or ""
            if isinstance(snapshot, dict) and isinstance(snapshot.get("categories"), list):
                result["categories"] = snapshot.get("categories") or []
            if isinstance(source_images, list) and not (result.get("images") or []):
                result["images"] = source_images
            result = add_jv_public_image_urls(result, site_key=normalized_site_key)
        return Response(result, status=status.HTTP_200_OK)


def _serialize_local_jv_product(product: ImportedProduct, *, site_key: str) -> dict:
    result = ImportedProductDetailSerializer(product).data
    result["jv_fields"] = _build_local_jv_fields(product, serialized=result, site_key=site_key)
    return add_jv_public_image_urls(result, site_key=site_key)


def _build_local_jv_fields(product: ImportedProduct, *, serialized: dict, site_key: str) -> dict:
    descriptions = serialized.get("descriptions") if isinstance(serialized.get("descriptions"), list) else []
    content_by_language: list[dict] = []
    default_name = ""
    default_description = ""

    for row in descriptions:
        if not isinstance(row, dict):
            continue
        try:
            language_id = int(row.get("language_id") or 0)
        except (TypeError, ValueError):
            continue
        if language_id <= 0:
            continue

        language_code = JV_LANGUAGE_CODE_BY_ID.get(language_id)
        if not language_code:
            continue

        name = str(row.get("name") or "").strip()
        description_html = str(row.get("description") or "")
        meta_title = str(row.get("meta_title") or "").strip() or name
        meta_description = str(row.get("meta_description") or "").strip()
        meta_keyword = str(row.get("meta_keyword") or "").strip()
        plain_description = _plain_text(description_html)
        short_description = plain_description[:255]

        if language_code == "de":
            default_name = name or default_name
            default_description = description_html or default_description
        elif not default_name and name:
            default_name = name
            default_description = description_html

        content_by_language.append(
            {
                "language_id": language_id,
                "language_code": language_code,
                "name": name,
                "description": description_html,
                "bezeichnung": name or short_description,
                "meta_title": meta_title,
                "meta_description": meta_description or short_description,
                "meta_keyword": meta_keyword,
                "short_description_real": short_description,
                "kurzbeschreibung": short_description,
            }
        )

    fallback_name = default_name or str(product.source_model or "").strip() or str(product.ean or "").strip()
    fallback_description = default_description or ""
    try:
        uvp_value = str(process_uvp(float(product.price))) if product.price is not None else ""
    except Exception:
        uvp_value = ""

    return {
        "artikelnr": str(product.source_model or "").strip() or str(product.ean or "").strip(),
        "jfsku": str(product.source_sku or "").strip(),
        "ean": str(product.source_ean_field or "").strip() or str(product.ean or "").strip(),
        "inaktiv": 0 if bool(product.status) else 1,
        "is_sofort": 1,
        "lieferzeitid": 11,
        "uvp": uvp_value,
        "urlkey": _build_local_jv_urlkey(product=product, fallback_name=fallback_name),
        "site": product.site,
        "site_key": site_key,
        "content_by_language": content_by_language
        or [
            {
                "language_id": int(JV_LANGUAGE_ID_BY_CODE.get("de") or 1),
                "language_code": "de",
                "name": fallback_name,
                "description": fallback_description,
                "bezeichnung": fallback_name,
                "meta_title": fallback_name,
                "meta_description": _plain_text(fallback_description)[:255],
                "meta_keyword": "",
                "short_description_real": _plain_text(fallback_description)[:255],
                "kurzbeschreibung": _plain_text(fallback_description)[:255],
            }
        ],
    }


def _build_local_jv_urlkey(*, product: ImportedProduct, fallback_name: str) -> str:
    seo_url = str(product.seo_url or "").strip()
    if seo_url:
        return seo_url
    return jv_urlkey(fallback_name)


def _plain_text(value: str) -> str:
    text = re.sub(r"<[^>]*>", " ", str(value or ""))
    return re.sub(r"\s+", " ", text).strip()


class JVRubricsTreeAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        site = _normalize_site(request.query_params.get("site"))
        site_key = _normalize_site_key(request.query_params.get("site_key"))
        language = (request.query_params.get("language") or "de").strip().lower() or "de"

        if site is None:
            return Response(
                {"detail": "Передайте query-параметр ?site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if site != ImportedProduct.Site.JV:
            return Response(
                {"detail": "Этот endpoint сейчас поддерживает только site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        db_config = source_db_config_for_site(site, site_key=site_key)
        if not db_config:
            return Response(
                {
                    "detail": (
                        f"Не настроены credentials source DB для site={site}"
                        f"{f', site_key={site_key}' if site_key else ''}. "
                        "Ожидаются env: JV_SOURCE_<SITE>[_<SITE_KEY>]_DB_HOST/USER/PASSWORD/NAME[/PORT]."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        conn = None
        cur = None
        try:
            conn = mysql.connector.connect(
                host=db_config["host"],
                user=db_config["user"],
                password=db_config["password"],
                database=db_config["database"],
                port=db_config["port"],
            )
            cur = conn.cursor(dictionary=True)
            cur.execute("SHOW TABLES LIKE 'shoprubriken'")
            if cur.fetchone() is None:
                return Response(
                    {"detail": "В source DB не найдена таблица shoprubriken."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            cur.execute("SHOW TABLES LIKE 'shoprubrikencontent'")
            has_content = cur.fetchone() is not None

            if has_content:
                cur.execute(
                    """
                    SELECT
                        r.rubid,
                        r.parentid,
                        r.rub_parent,
                        r.rubnum,
                        r.ruborder,
                        r.ruburlkey,
                        rc.rubnam,
                        rc.urlkey
                    FROM shoprubriken r
                    LEFT JOIN shoprubrikencontent rc
                        ON rc.rubid = r.rubid
                       AND LOWER(TRIM(rc.rubsprache)) = %s
                    ORDER BY r.parentid ASC, r.ruborder ASC, r.rubid ASC
                    """,
                    (language,),
                )
            else:
                cur.execute(
                    """
                    SELECT
                        r.rubid,
                        r.parentid,
                        r.rub_parent,
                        r.rubnum,
                        r.ruborder,
                        r.ruburlkey,
                        NULL AS rubnam,
                        NULL AS urlkey
                    FROM shoprubriken r
                    ORDER BY r.parentid ASC, r.ruborder ASC, r.rubid ASC
                    """
                )

            rows = cur.fetchall() or []
            nodes = []
            by_parent = {}
            for row in rows:
                rubid = int(row.get("rubid") or 0)
                if rubid <= 0:
                    continue
                parentid = int(row.get("parentid") or 0)
                node = {
                    "id": rubid,
                    "category_id": rubid,
                    "parent_id": parentid,
                    "name": (row.get("rubnam") or "").strip() or (row.get("rubnum") or "").strip() or f"rubrik-{rubid}",
                    "rubnum": (row.get("rubnum") or "").strip(),
                    "rub_parent": (row.get("rub_parent") or "").strip(),
                    "urlkey": (row.get("urlkey") or "").strip() or (row.get("ruburlkey") or "").strip(),
                    "sort_order": int(row.get("ruborder") or 0),
                }
                nodes.append(node)
                by_parent.setdefault(parentid, []).append(node)

            for parent_nodes in by_parent.values():
                parent_nodes.sort(key=lambda x: (int(x.get("sort_order") or 0), int(x.get("id") or 0)))

            def build_tree(parent_id: int):
                items = []
                for node in by_parent.get(parent_id, []):
                    item = dict(node)
                    item["children"] = build_tree(int(node["id"]))
                    items.append(item)
                return items

            return Response(
                {
                    "site": site,
                    "site_key": site_key or "",
                    "language": language,
                    "count": len(nodes),
                    "items": nodes,
                    "tree": build_tree(0),
                },
                status=status.HTTP_200_OK,
            )
        except Exception as exc:
            logger.exception(
                "JV_RUBRICS_TREE_FAILED code=jv_rubrics_tree_failed site=%s site_key=%s",
                site,
                site_key,
            )
            return Response(
                {
                    "code": "jv_rubrics_tree_failed",
                    "detail": "Failed to load rubrics from source DB.",
                    "error": str(exc),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        finally:
            try:
                if cur is not None:
                    cur.close()
            finally:
                if conn is not None:
                    conn.close()


class JVDeliveryOptionsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        site = _normalize_site(request.query_params.get("site"))
        site_key = _normalize_site_key(request.query_params.get("site_key"))

        if site is None:
            return Response(
                {"detail": "Передайте query-параметр ?site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if site != ImportedProduct.Site.JV:
            return Response(
                {"detail": "Этот endpoint сейчас поддерживает только site=JV."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        db_config = source_db_config_for_site(site, site_key=site_key)
        conn = None
        cur = None
        source = "static"
        try:
            if db_config:
                conn = mysql_connect(db_config)
                cur = conn.cursor(dictionary=True)
                options = fetch_jv_lieferzeit_options(cur, site_key=site_key)
                source = "source_db"
            else:
                options = fetch_jv_lieferzeit_options(None, site_key=site_key)
            return Response(
                {
                    "site": site,
                    "site_key": site_key or "",
                    "count": len(options),
                    "items": options,
                    "source": source,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as exc:
            logger.exception(
                "JV_DELIVERY_OPTIONS_FAILED code=jv_delivery_options_failed site=%s site_key=%s",
                site,
                site_key,
            )
            return Response(
                {
                    "code": "jv_delivery_options_failed",
                    "detail": "Failed to load JV delivery options from source DB.",
                    "error": str(exc),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        finally:
            try:
                if cur is not None:
                    cur.close()
            finally:
                if conn is not None:
                    conn.close()
