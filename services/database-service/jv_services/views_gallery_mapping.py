import logging

from django.middleware.csrf import get_token
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from .gallery_mapping_jobs import enqueue_mapping, mapping_database, mapping_status, missing_configuration

logger = logging.getLogger(__name__)


class MappingAdminPermission(BasePermission):
    def has_permission(self, request, view):
        if request.session.get("role") != "admin":
            return False
        if request.method == "POST":
            SessionAuthentication().enforce_csrf(request)
        return True


class GalleryMappingAPIView(APIView):
    permission_classes = [MappingAdminPermission]

    def get(self, request):
        response = self._response(False)
        response.data["csrf_token"] = get_token(request)
        return response

    def post(self, request):
        if request.data:
            return Response({"message": "This operation does not accept parameters."}, status=400)
        return self._response(True)

    @staticmethod
    def _response(start):
        missing = missing_configuration()
        if missing:
            return Response({"configured": False, "missing": missing, "job": None}, status=503 if start else 200)
        try:
            with mapping_database() as database:
                created = enqueue_mapping(database) if start else False
                job = mapping_status(database)
            return Response({"configured": True, "missing": [], "job": job},
                            status=(202 if created else 409) if start else 200)
        except Exception as exc:
            logger.error("AFTERCOOL_MAPPING_API_FAILED error_type=%s", type(exc).__name__)
            return Response({"message": "Aftercool mapping storage is unavailable."}, status=503)
