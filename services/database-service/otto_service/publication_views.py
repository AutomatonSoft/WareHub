from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission
from .publication_service import reconcile_next_publication


class OttoPublicationSyncAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        return Response({"publication": reconcile_next_publication()})
