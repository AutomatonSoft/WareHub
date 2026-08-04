import os
from datetime import datetime

from django.db import transaction
from django.shortcuts import get_object_or_404
from pymongo.errors import PyMongoError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission

from .external_requests import OttoExternalAPIError, OttoExternalProductsClient
from .category_cache import OttoCategoryCache
from .full_cache_sync import get_otto_full_cache_sync_service
from .image_resolver import get_otto_image_resolver, resolve_cached_or_otto_image
from .models import OttoProductJV, OttoProductXL
from .product_mapper import enrich_otto_product
from .serializers import (
    OttoProductJVSerializer,
    OttoProductPayloadSerializer,
    OttoProductXLSerializer,
)


PROFILE_TO_MODEL = {
    "jv": OttoProductJV,
    "xl": OttoProductXL,
}

PROFILE_TO_SERIALIZER = {
    "jv": OttoProductJVSerializer,
    "xl": OttoProductXLSerializer,
}


def _serialize_otto_full_sync_status(job: dict) -> dict:
    total = int(job.get("total") or 0)
    completed = int(job.get("completed") or 0)
    progress_percent = round((completed / total) * 100, 1) if total else 0

    def timestamp(name: str) -> str | None:
        value = job.get(name)
        return value.isoformat() if isinstance(value, datetime) else None

    return {
        "status": str(job.get("status") or "idle"),
        "phase": str(job.get("phase") or "idle"),
        "total": total,
        "completed": completed,
        "cached": int(job.get("cached") or 0),
        "failed": int(job.get("failed") or 0),
        "categoryCount": int(job.get("category_count") or 0),
        "progressPercent": progress_percent,
        "message": str(job.get("message") or ""),
        "error": str(job.get("error") or ""),
        "startedAt": timestamp("started_at"),
        "finishedAt": timestamp("finished_at"),
    }


def _normalize_profile(profile: str | None) -> str:
    return (profile or "jv").strip().lower()


def _resolve_profile(profile: str | None):
    normalized = _normalize_profile(profile)
    model = PROFILE_TO_MODEL.get(normalized)
    serializer = PROFILE_TO_SERIALIZER.get(normalized)
    return normalized, model, serializer


def _upsert_products(model_cls, raw_items: list[dict]) -> tuple[int, int, list[dict]]:
    serializer = OttoProductPayloadSerializer(data=raw_items, many=True)
    serializer.is_valid(raise_exception=True)

    created_count = 0
    updated_count = 0
    result_items: list[dict] = []

    with transaction.atomic():
        for original_item, validated_item in zip(raw_items, serializer.validated_data):
            product_reference = validated_item["productReference"]
            defaults = {
                "sku": validated_item.get("sku") or None,
                "ean": validated_item.get("ean") or None,
                "pzn": validated_item.get("pzn") or None,
                "mpn": validated_item.get("mpn") or None,
                "moin": validated_item.get("moin") or None,
                "release_date": validated_item.get("releaseDate"),
                "product_description": validated_item.get("productDescription") or {},
                "media_assets": validated_item.get("mediaAssets") or [],
                "order_data": validated_item.get("order") or {},
                "pricing": validated_item.get("pricing") or {},
                "logistics": validated_item.get("logistics") or original_item.get("delivery") or {},
                "compliance": validated_item.get("compliance") or {},
                "raw_payload": original_item,
            }
            image_url = str(original_item.get("imageUrl") or "").strip()
            if image_url:
                defaults["otto_image_url"] = image_url
            product, created = model_cls.objects.update_or_create(
                product_reference=product_reference,
                defaults=defaults,
            )
            if created:
                created_count += 1
            else:
                updated_count += 1
            result_items.append(
                {
                    "id": product.id,
                    "product_reference": product.product_reference,
                    "created": created,
                }
            )

    return created_count, updated_count, result_items


def _enrich_products_with_image_urls(model_cls, raw_items: list[dict]) -> list[dict]:
    product_references = [str(item.get("productReference") or "").strip() for item in raw_items]
    cached_urls = {
        product_reference: image_url
        for product_reference, image_url in model_cls.objects.filter(
            product_reference__in=[reference for reference in product_references if reference],
            otto_image_url__isnull=False,
        ).exclude(otto_image_url="").values_list("product_reference", "otto_image_url")
    }
    resolver = get_otto_image_resolver()
    enriched_items: list[dict] = []

    for raw_item in raw_items:
        item = dict(raw_item)
        product_reference = str(item.get("productReference") or "").strip()
        image_url = resolve_cached_or_otto_image(
            cached_urls.get(product_reference),
            str(item.get("ottoUrl") or "").strip(),
            resolver,
        )
        item["imageUrl"] = image_url
        enriched_items.append(item)

    return enriched_items


def _normalize_products_for_local_storage(raw_items: list[dict]) -> list[dict]:
    normalized_items: list[dict] = []
    for raw_item in raw_items:
        normalized_item = dict(raw_item)
        if "productDescription" not in normalized_item and "productDescription" in normalized_item:
            normalized_item["productDescription"] = normalized_item["productDescription"]
        if "compliance" not in normalized_item and "compliance" in normalized_item:
            normalized_item["compliance"] = normalized_item["compliance"]
        if "order" not in normalized_item and "maxOrderQuantity" in normalized_item:
            normalized_item["order"] = {"maxOrderQuantity": normalized_item["maxOrderQuantity"]}
        normalized_items.append(normalized_item)
    return normalized_items


class OttoProductUpsertAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request, profile: str = "jv"):
        normalized_profile, model_cls, _ = _resolve_profile(profile)
        if model_cls is None:
            return Response(
                {"detail": "profile должен быть 'jv' или 'xl'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = request.data
        if isinstance(payload, dict) and "items" in payload:
            raw_items = payload["items"]
        elif isinstance(payload, list):
            raw_items = payload
        elif isinstance(payload, dict):
            raw_items = [payload]
        else:
            return Response(
                {
                    "detail": (
                        "Body должен быть объектом OTTO product, "
                        "массивом объектов или объектом с ключом items."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(raw_items, list) or not raw_items or not all(isinstance(item, dict) for item in raw_items):
            return Response(
                {"detail": "Передайте непустой список объектов products."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        local_items = _normalize_products_for_local_storage(raw_items)
        serializer = OttoProductPayloadSerializer(data=local_items, many=True)
        serializer.is_valid(raise_exception=True)

        try:
            upstream_response = OttoExternalProductsClient().create_or_update_products(
                controller=normalized_profile,
                products=raw_items,
            )
        except OttoExternalAPIError as error:
            upstream_status = error.status_code or status.HTTP_502_BAD_GATEWAY
            response_status = upstream_status if 400 <= upstream_status < 500 else status.HTTP_502_BAD_GATEWAY
            return Response(
                {
                    "code": "otto_external_upsert_failed",
                    "detail": str(error),
                    "upstream_status_code": error.status_code,
                    "upstream_response": error.details,
                },
                status=response_status,
            )

        created_count, updated_count, result_items = _upsert_products(model_cls, local_items)

        return Response(
            {
                "profile": normalized_profile,
                "received": len(raw_items),
                "created": created_count,
                "updated": updated_count,
                "items": result_items,
                "upstream_response": upstream_response,
            },
            status=status.HTTP_200_OK,
        )


class OttoProductFetchBySKUAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, profile: str, sku: str):
        normalized_profile, model_cls, _ = _resolve_profile(profile)
        if model_cls is None:
            return Response(
                {"detail": "profile должен быть 'jv' или 'xl'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            page = int(request.query_params.get("page", 0))
            limit = int(request.query_params.get("limit", 10))
        except (TypeError, ValueError):
            return Response(
                {"detail": "page и limit должны быть целыми числами."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if page < 0 or not 1 <= limit <= 100:
            return Response(
                {"detail": "page должен быть неотрицательным, limit — от 1 до 100."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            external_payload = OttoExternalProductsClient().fetch_products(
                sku=sku,
                controller=normalized_profile,
                page=page,
                limit=limit,
            )
        except OttoExternalAPIError as error:
            return Response(
                {
                    "code": "otto_external_fetch_failed",
                    "detail": str(error),
                    "upstream_status_code": error.status_code,
                    "upstream_response": error.details,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        raw_items = [enrich_otto_product(item) for item in external_payload["productVariations"]]
        if not raw_items:
            return Response(
                {
                    "code": "otto_product_not_found",
                    "detail": "OTTO product was not found for the supplied SKU.",
                    "sku": sku,
                    "profile": normalized_profile,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        enriched_items = _enrich_products_with_image_urls(model_cls, raw_items)
        created_count, updated_count, result_items = _upsert_products(model_cls, enriched_items)
        return Response(
            {
                "profile": normalized_profile,
                "sku": sku,
                "page": page,
                "limit": limit,
                "received": len(raw_items),
                "created": created_count,
                "updated": updated_count,
                "items": result_items,
                "product_variations": enriched_items,
                "links": external_payload.get("links", []),
            },
            status=status.HTTP_200_OK,
        )


class OttoCategoriesAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        try:
            raw_limit = request.query_params.get("limit", "50")
            try:
                limit = min(max(int(raw_limit), 1), 50)
            except (TypeError, ValueError):
                limit = 50

            categories = OttoCategoryCache().search_categories(
                query=str(request.query_params.get("q") or ""),
                selected_category_id=str(request.query_params.get("selectedId") or ""),
                limit=limit,
            )
            return Response({"categories": categories}, status=status.HTTP_200_OK)
        except (RuntimeError, PyMongoError):
            return Response(
                {"detail": "OTTO category cache is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class OttoCategoriesSyncAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        try:
            cache = OttoCategoryCache()
            if not cache.categories_due() and not bool(request.data.get("force")):
                return Response({"status": "fresh"}, status=status.HTTP_200_OK)
            page_size = int(os.getenv("OTTO_CATEGORY_SYNC_PAGE_SIZE", "2000"))
            max_pages = int(os.getenv("OTTO_CATEGORY_SYNC_MAX_PAGES", "1000"))
            categories = OttoExternalProductsClient().fetch_all_categories(
                page_size=page_size,
                max_pages=max_pages,
            )
            count = cache.replace_categories(categories)
        except (RuntimeError, PyMongoError):
            return Response(
                {"detail": "OTTO category cache is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except OttoExternalAPIError:
            return Response(
                {"detail": "OTTO categories could not be refreshed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"status": "refreshed", "count": count}, status=status.HTTP_200_OK)


class OttoFullCacheSyncAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        try:
            job = get_otto_full_cache_sync_service().status()
        except (RuntimeError, ValueError, PyMongoError):
            return Response(
                {"detail": "OTTO category cache is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(_serialize_otto_full_sync_status(job), status=status.HTTP_200_OK)

    def post(self, request):
        try:
            started, job = get_otto_full_cache_sync_service().start()
        except (RuntimeError, ValueError, PyMongoError):
            return Response(
                {"detail": "OTTO category cache is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        response_status = status.HTTP_202_ACCEPTED if started else status.HTTP_200_OK
        return Response(_serialize_otto_full_sync_status(job), status=response_status)


class OttoCategoryAttributesAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        category_id = str(request.query_params.get("categoryId") or "").strip()
        if not category_id:
            return Response(
                {"detail": "categoryId is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            attributes = OttoCategoryCache().attributes(category_id)
        except (RuntimeError, PyMongoError):
            return Response(
                {"detail": "OTTO category cache is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if attributes is None:
            return Response({"detail": "OTTO category attributes are not cached."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"categoryId": category_id, "attributes": attributes}, status=status.HTTP_200_OK)

    def post(self, request):
        category_id = str(request.data.get("categoryId") or "").strip()
        if not category_id:
            return Response({"detail": "categoryId is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            cache = OttoCategoryCache()
            attributes = cache.attributes(category_id)
            if attributes is None:
                payload = OttoExternalProductsClient().fetch_attributes(category_id=category_id)
                attributes = payload["attributes"]
                cache.store_attributes(category_id, attributes)
        except (RuntimeError, PyMongoError):
            return Response(
                {"detail": "OTTO category cache is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except OttoExternalAPIError:
            return Response(
                {"detail": "OTTO category attributes could not be refreshed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"categoryId": category_id, "attributes": attributes}, status=status.HTTP_200_OK)


class OttoProductListAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, profile: str = "jv"):
        _, model_cls, serializer_cls = _resolve_profile(profile)
        if model_cls is None or serializer_cls is None:
            return Response(
                {"detail": "profile должен быть 'jv' или 'xl'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset = model_cls.objects.all().order_by("-updated_at")
        serializer = serializer_cls(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class OttoProductRetrieveAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, pk: int, profile: str = "jv"):
        _, model_cls, serializer_cls = _resolve_profile(profile)
        if model_cls is None or serializer_cls is None:
            return Response(
                {"detail": "profile должен быть 'jv' или 'xl'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        product = get_object_or_404(model_cls, pk=pk)
        serializer = serializer_cls(product)
        return Response(serializer.data, status=status.HTTP_200_OK)
