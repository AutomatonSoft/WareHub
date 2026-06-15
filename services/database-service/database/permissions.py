import os
from hmac import compare_digest

from django.conf import settings
from django.core.exceptions import DisallowedHost
from rest_framework.permissions import SAFE_METHODS, BasePermission


class SessionRolePermission(BasePermission):
    message = "Недостаточно прав для выполнения действия."

    def _role(self, request):
        session = getattr(request, "session", None)
        if session is None:
            return ""
        return (session.get("role") or "").lower()

    def _is_allowed_service_request(self, request) -> bool:
        expected_token = str(getattr(settings, "ORCHESTRATOR_SERVICE_AUTH_TOKEN", "") or "").strip()
        if not expected_token:
            return False
        provided_token = str(request.headers.get("x-warehub-service-token") or "").strip()
        if not provided_token or not compare_digest(provided_token, expected_token):
            return False
        try:
            host = str(request.get_host() or "").split(":", 1)[0].strip().lower()
        except DisallowedHost:
            return False
        allowed_hosts = set(getattr(settings, "ORCHESTRATOR_SERVICE_ALLOWED_HOSTS", []))
        return host in allowed_hosts

    def has_permission(self, request, view):
        if getattr(settings, "DEBUG", False) and os.getenv("DEV_ALLOW_ALL", "false").lower() == "true":
            return True
        if self._is_allowed_service_request(request):
            return True
        role = self._role(request)
        if role == "admin":
            return True
        if role == "user":
            return request.method in SAFE_METHODS
        return False

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
