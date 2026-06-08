from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission

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

        if not isinstance(raw_items, list) or not raw_items:
            return Response(
                {"detail": "Передайте непустой список products."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
                    "logistics": validated_item.get("logistics") or {},
                    "compliance": validated_item.get("compliance") or {},
                    "raw_payload": original_item if isinstance(original_item, dict) else {},
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

        return Response(
            {
                "profile": normalized_profile,
                "received": len(raw_items),
                "created": created_count,
                "updated": updated_count,
                "items": result_items,
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
