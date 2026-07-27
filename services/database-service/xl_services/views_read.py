import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission
from xl_services.models import ImportedProduct
from xl_services.serializers import ImportedProductDetailSerializer
from xl_services.source_client import (
    fetch_xl_manufacturers,
    fetch_xl_product_brief_by_ean,
    fetch_xl_product_snapshot_by_ean,
    source_db_config_for_xl,
    xl_site_catalog,
)
from xl_services.sync_utils import (
    build_xl_source_payload,
    effective_xl_ean_from_source,
    resolve_xl_local_product_for_source,
)
from xl_services.views_common import force_xl_site, normalize_site_key

logger = logging.getLogger(__name__)


class XLProductByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, ean: str):
        force_xl_site(request)
        site = ImportedProduct.Site.XL
        site_key = str(request.query_params.get("site_key") or "").strip().upper() or None
        db_config = source_db_config_for_xl(site_key=site_key)
        if not db_config:
            return Response(
                {
                    "detail": (
                        f"Не настроены credentials source DB для site={site}"
                        f"{f', site_key={site_key}' if site_key else ''}. "
                        "Ожидаются env: XL_SOURCE_<SITE>[_<SITE_KEY>]_DB_HOST/USER/PASSWORD/NAME[/PORT] "
                        "."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        try:
            snapshot = fetch_xl_product_snapshot_by_ean(db_config, ean.strip())
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "XL_SOURCE_FETCH_FAILED code=xl_source_fetch_failed ean=%s site_key=%s",
                ean,
                site_key,
            )
            return Response(
                {
                    "code": "xl_source_fetch_failed",
                    "detail": "Failed to read product from XL source DB.",
                    "error": str(exc),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        if not snapshot:
            return Response(
                {"detail": "Товар не найден в XL source DB по указанному ean."},
                status=status.HTTP_404_NOT_FOUND,
            )
        payload = build_xl_source_payload(snapshot, site=site, site_key=site_key or "", query_ean=ean.strip())
        return Response(payload, status=status.HTTP_200_OK)


class XLSitesByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def _lookup_site(self, site_info: dict, normalized_ean: str) -> tuple[str, dict]:
        site_key = site_info["site_key"]
        domain = site_info["domain"]
        db_config = source_db_config_for_xl(site_key=site_key)
        if not db_config:
            return "missing", {"site_key": site_key, "domain": domain, "reason": "not_configured"}
        try:
            row = fetch_xl_product_brief_by_ean(db_config, normalized_ean)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "XL_ALL_SITES_QUERY_ERROR code=xl_all_sites_query_error site_key=%s domain=%s error=%s",
                site_key,
                domain,
                exc,
            )
            return (
                "missing",
                {
                    "site_key": site_key,
                    "domain": domain,
                    "reason": "query_error",
                    "error": str(exc),
                },
            )
        if not row:
            return "missing", {"site_key": site_key, "domain": domain, "reason": "ean_not_found"}
        return (
            "found",
            {
                "site_key": site_key,
                "domain": domain,
                "product_id": row.get("product_id"),
                "ean": row.get("ean") or normalized_ean,
                "price": row.get("price"),
                "currency_code": row.get("currency_code"),
                "title": row.get("title") or "",
            },
        )

    def get(self, request, ean: str):
        force_xl_site(request)
        normalized_ean = ean.strip()
        if not normalized_ean:
            return Response({"detail": "EAN is required."}, status=status.HTTP_400_BAD_REQUEST)

        site = ImportedProduct.Site.XL
        found = []
        missing = []
        requested_site_key = normalize_site_key(request.query_params.get("site_key"))
        catalog = xl_site_catalog(lambda x: x)
        if requested_site_key:
            catalog = [site_info for site_info in catalog if str(site_info.get("site_key") or "").strip().upper() == requested_site_key]
            if not catalog:
                return Response(
                    {
                        "detail": "Requested XL site_key is not supported.",
                        "site_key": requested_site_key,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(self._lookup_site, site_info, normalized_ean) for site_info in catalog]
            for future in as_completed(futures):
                result_type, row = future.result()
                if result_type == "found":
                    found.append(row)
                else:
                    missing.append(row)

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


class XLDeliveryOptionsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        force_xl_site(request)
        return Response(
            {
                "detail": "XL does not use JV delivery-options endpoint.",
                "site": ImportedProduct.Site.XL,
                "items": [],
                "source": "static",
            },
            status=status.HTTP_200_OK,
        )


class XLManufacturersAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        force_xl_site(request)
        site_key = normalize_site_key(request.query_params.get("site_key"))
        db_config = source_db_config_for_xl(site_key=site_key)
        if not db_config:
            return Response(
                {"detail": "XL source DB is not configured for the requested site."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            rows = fetch_xl_manufacturers(db_config)
        except Exception:  # noqa: BLE001
            logger.exception("XL_MANUFACTURERS_FETCH_FAILED site_key=%s", site_key)
            return Response(
                {"detail": "Failed to read XL manufacturers from source DB."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        items = [
            {
                "manufacturer_id": row.get("manufacturer_id"),
                "name": str(row.get("name") or "").strip(),
                "delivery_time": str(row.get("delivery_time") or "").strip(),
            }
            for row in rows
            if row.get("manufacturer_id") is not None
        ]
        return Response(
            {
                "site": ImportedProduct.Site.XL,
                "site_key": site_key,
                "items": items,
            },
            status=status.HTTP_200_OK,
        )


class XLLocalProductByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, ean: str):
        force_xl_site(request)
        site = ImportedProduct.Site.XL
        site_key = normalize_site_key(request.query_params.get("site_key"))
        normalized_ean = ean.strip()
        product = None
        conflict_product = None
        normalized_site_key = site_key or ""
        snapshot = None

        db_config = source_db_config_for_xl(site_key=site_key)
        if db_config:
            try:
                snapshot = fetch_xl_product_snapshot_by_ean(db_config, normalized_ean)
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "XL_LOCAL_SOURCE_FETCH_FAILED code=xl_local_source_fetch_failed ean=%s site_key=%s",
                    normalized_ean,
                    site_key,
                )
                return Response(
                    {
                        "code": "xl_source_fetch_failed",
                        "detail": "Failed to read product from XL source DB.",
                        "error": str(exc),
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            if snapshot:
                source_product_id = snapshot["product"]["product_id"]
                effective_ean = effective_xl_ean_from_source(snapshot["product"], fallback=normalized_ean)
                product, conflict_product = resolve_xl_local_product_for_source(
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
                    "code": "xl_local_product_conflict",
                    "detail": "В локальной БД найден другой товар с таким EAN и другим source product_id.",
                    "local_id": conflict_product.id,
                    "local_source_product_id": conflict_product.source_product_id,
                },
                status=status.HTTP_409_CONFLICT,
            )

        if product is None:
            return Response(
                {"detail": "Товар с таким ean не найден."},
                status=status.HTTP_404_NOT_FOUND,
            )

        result = ImportedProductDetailSerializer(product).data
        if isinstance(snapshot, dict):
            result["xl_attribute_fields"] = snapshot.get("attributes") if isinstance(snapshot.get("attributes"), list) else []
        return Response(result, status=status.HTTP_200_OK)
