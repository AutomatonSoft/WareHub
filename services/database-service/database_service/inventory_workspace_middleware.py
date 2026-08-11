from __future__ import annotations

from django.conf import settings
from django.http import JsonResponse

from database.workspace import (
    BENIM_DEPOM_DATABASE_ALIAS,
    BENIM_DEPOM_WORKSPACE,
    InvalidInventoryWorkspace,
    WORKSPACE_HEADER,
    WORKSPACE_QUERY_PARAM,
    normalize_workspace,
    reset_active_workspace,
    set_active_workspace,
)


class InventoryWorkspaceMiddleware:
    """Selects the inventory database once for the lifetime of each request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        requested_workspace = request.headers.get(WORKSPACE_HEADER) or request.GET.get(WORKSPACE_QUERY_PARAM)
        try:
            workspace = normalize_workspace(requested_workspace)
        except InvalidInventoryWorkspace:
            return JsonResponse(
                {
                    "code": "inventory_workspace_invalid",
                    "message": "Unsupported inventory workspace.",
                },
                status=400,
            )

        if workspace == BENIM_DEPOM_WORKSPACE and BENIM_DEPOM_DATABASE_ALIAS not in settings.DATABASES:
            return JsonResponse(
                {
                    "code": "inventory_workspace_unavailable",
                    "message": "Benim Depom database is not configured.",
                },
                status=503,
            )

        request.inventory_workspace = workspace
        token = set_active_workspace(workspace)
        try:
            response = self.get_response(request)
        finally:
            reset_active_workspace(token)
        response[WORKSPACE_HEADER] = workspace
        return response
