import os

from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission


class SessionRolePermission(BasePermission):
    message = "Недостаточно прав для выполнения действия."

    def _role(self, request):
        return (request.session.get("role") or "").lower()

    def has_permission(self, request, view):
        if getattr(settings, "DEBUG", False) and os.getenv("DEV_ALLOW_ALL", "false").lower() == "true":
            return True
        role = self._role(request)
        if role == "admin":
            return True
        if role == "user":
            return request.method in SAFE_METHODS
        return False

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
