from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission
from database.serializers import (
    MarketplaceDeactivateByEANSerializer,
    MarketplaceDeactivateByKidSerializer,
    MarketplaceHoodDeactivateByKidSerializer,
    MarketplaceJVDeactivateByKidSerializer,
)
from database.marketplace_deactivate_service import (
    deactivate_marketplaces_by_explicit_sites,
    deactivate_hood_by_kid_number,
    deactivate_jv_sofort_by_kid_number,
    deactivate_marketplaces_by_kid_number,
)
from jv_services.view_helpers import session_actor


class MarketplaceDeactivateByKidAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        actor = session_actor(request)
        body = request.data or {}

        if isinstance(body, dict) and str(body.get("kid_number") or "").strip():
            serializer = MarketplaceDeactivateByKidSerializer(data=body)
            serializer.is_valid(raise_exception=True)
            validated = serializer.validated_data
            result = deactivate_marketplaces_by_kid_number(
                kid_number=str(validated["kid_number"]).strip(),
                inactive=bool(validated.get("inactive", True)),
                actor=actor,
                payloads_by_site_key=validated.get("payloads") or {},
            )
            return Response(result["payload"], status=result["status_code"])

        serializer = MarketplaceDeactivateByEANSerializer(data=body)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        result = deactivate_marketplaces_by_explicit_sites(
            ean=str(validated["ean"]).strip(),
            site_keys=validated["site_keys"],
            inactive=bool(validated.get("inactive", True)),
            actor=actor,
            payloads_by_site_key=validated.get("payloads") or {},
        )
        return Response(result["payload"], status=result["status_code"])


class MarketplaceJVDeactivateSofortByKidAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        actor = session_actor(request)
        serializer = MarketplaceJVDeactivateByKidSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        result = deactivate_jv_sofort_by_kid_number(
            kid_number=str(validated["kid_number"]).strip(),
            inactive=bool(validated.get("inactive", True)),
            actor=actor,
        )
        return Response(result["payload"], status=result["status_code"])


class MarketplaceHoodDeactivateByKidAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        actor = session_actor(request)
        serializer = MarketplaceHoodDeactivateByKidSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        result = deactivate_hood_by_kid_number(
            kid_number=str(validated["kid_number"]).strip(),
            inactive=bool(validated.get("inactive", True)),
            actor=actor,
        )
        return Response(result["payload"], status=result["status_code"])
