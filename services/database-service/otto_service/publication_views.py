from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission
from .external_requests import OttoExternalAPIError, OttoExternalProductsClient
from .publication_service import reconcile_next_publication


class OttoJobStatusAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, job_id):
        controller = str(request.query_params.get("controller", "")).strip().lower()
        if controller not in ("jv", "xl"):
            return Response({"detail": "controller must be jv or xl."}, status=400)
        try:
            payload = OttoExternalProductsClient().fetch_update_task(task_id=str(job_id), controller=controller)
        except OttoExternalAPIError as error:
            return Response({"detail": str(error), "upstream_status": error.status_code}, status=502)
        return Response({
            "job_id": str(job_id), "controller": controller,
            **{key: payload.get(key) for key in (
                "state", "total", "progress", "succeeded", "failed", "unchanged",
                "failures", "succeeded_items", "message",
            )},
        })


class OttoPublicationSyncAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        return Response({"publication": reconcile_next_publication()})
