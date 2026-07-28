from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission

from .external_requests import OttoExternalAPIError, OttoExternalProductsClient
from .models import OttoProductJV, OttoProductXL
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


def _normalize_products_for_local_storage(raw_items: list[dict]) -> list[dict]:
    normalized_items: list[dict] = []
    for raw_item in raw_items:
        normalized_item = dict(raw_item)
        if "productDescription" not in normalized_item and "productDescriprion" in normalized_item:
            normalized_item["productDescription"] = normalized_item["productDescriprion"]
        if "compliance" not in normalized_item and "compliace" in normalized_item:
            normalized_item["compliance"] = normalized_item["compliace"]
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

        raw_items = external_payload["productVariations"]
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

        created_count, updated_count, result_items = _upsert_products(model_cls, raw_items)
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
                "product_variations": raw_items,
                "links": external_payload.get("links", []),
            },
            status=status.HTTP_200_OK,
        )


class OttoCategoriesAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        try:
            page = int(request.query_params.get("page", 0))
            limit = int(request.query_params.get("limit", 10))
        except (TypeError, ValueError):
            return Response(
                {"detail": "page и limit должны быть целыми числами."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if page < 0 or not 1 <= limit <= 2000:
            return Response(
                {"detail": "page должен быть неотрицательным, limit — от 1 до 2000."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        category = str(request.query_params.get("category") or "").strip() or None

        try:
            external_payload = OttoExternalProductsClient().fetch_categories(
                page=page,
                limit=limit,
                category=category,
            )
        except OttoExternalAPIError as error:
            return Response(
                {
                    "code": "otto_external_categories_fetch_failed",
                    "detail": str(error),
                    "upstream_status_code": error.status_code,
                    "upstream_response": error.details,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "page": page,
                "limit": limit,
                "category": category,
                "categories": external_payload["categories"],
            },
            status=status.HTTP_200_OK,
        )


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
            external_payload = OttoExternalProductsClient().fetch_attributes(category_id=category_id)
        except OttoExternalAPIError as error:
            return Response(
                {
                    "code": "otto_external_attributes_fetch_failed",
                    "detail": str(error),
                    "upstream_status_code": error.status_code,
                    "upstream_response": error.details,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "categoryId": category_id,
                "attributes": external_payload["attributes"],
            },
            status=status.HTTP_200_OK,
        )


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
