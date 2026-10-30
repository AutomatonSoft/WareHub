from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission
from .publication_service import reconcile_next_publication


class KauflandPublicationSyncAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        results = []
        for _ in range(10):
            result = reconcile_next_publication()
            if result is None:
                break
            results.append(result)
        return Response({"results": results})
