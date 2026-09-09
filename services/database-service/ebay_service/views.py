from django.core import signing
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission

from .client import EbayApiError, EbayOAuthClient, EbayTaxonomyClient


_OAUTH_STATE_SALT = "ebay-oauth-state"


class EbayOAuthAuthorizationUrlAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        account = _account(request.query_params.get("account"))
        if account is None:
            return Response({"code": "ebay_oauth_invalid_account", "detail": "account must be jv or xl."}, status=400)
        try:
            state = signing.dumps({"account": account}, salt=_OAUTH_STATE_SALT, compress=True)
            return Response({"account": account, "authorization_url": EbayOAuthClient().authorization_url(state=state)})
        except EbayApiError as error:
            return _oauth_error_response(error)


class EbayOAuthCodeExchangeAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        return _exchange_code_response(code=request.data.get("code"), state=request.data.get("state"))


class EbayOAuthCallbackAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return _exchange_code_response(code=request.query_params.get("code"), state=request.query_params.get("state"))


class EbayCategorySuggestionsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        query = str(request.query_params.get("q") or "").strip()
        marketplace_id = str(request.query_params.get("marketplace_id") or "").strip()
        if not query or not marketplace_id:
            return Response({"code": "ebay_taxonomy_invalid_request", "detail": "q and marketplace_id are required."}, status=400)
        if len(query) > 200 or len(marketplace_id) > 64:
            return Response({"code": "ebay_taxonomy_invalid_request", "detail": "q or marketplace_id is too long."}, status=400)
        try:
            return Response(EbayTaxonomyClient().category_suggestions(marketplace_id=marketplace_id, query=query))
        except EbayApiError as error:
            return _error_response(error)


class EbayCategoryAspectsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        marketplace_id = str(request.query_params.get("marketplace_id") or "").strip()
        category_id = str(request.query_params.get("category_id") or "").strip()
        if not marketplace_id or not category_id:
            return Response(
                {"code": "ebay_taxonomy_invalid_request", "detail": "marketplace_id and category_id are required."},
                status=400,
            )
        if len(marketplace_id) > 64 or len(category_id) > 64:
            return Response({"code": "ebay_taxonomy_invalid_request", "detail": "marketplace_id or category_id is too long."}, status=400)
        try:
            return Response(EbayTaxonomyClient().category_aspects(marketplace_id=marketplace_id, category_id=category_id))
        except EbayApiError as error:
            return _error_response(error)


def _error_response(error: EbayApiError) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    code = "ebay_taxonomy_not_configured" if error.status_code is None and "credentials" in str(error).lower() else "ebay_taxonomy_request_failed"
    payload = {"code": code, "detail": str(error)}
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _oauth_error_response(error: EbayApiError) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    code = "ebay_oauth_not_configured" if error.status_code is None and "not configured" in str(error).lower() else "ebay_oauth_request_failed"
    return Response({"code": code, "detail": str(error)}, status=status_code)


def _exchange_code_response(*, code: object, state: object) -> Response:
    normalized_code = str(code or "").strip()
    normalized_state = str(state or "").strip()
    if not normalized_code or not normalized_state:
        return Response({"code": "ebay_oauth_invalid_request", "detail": "code and state are required."}, status=400)
    try:
        payload = signing.loads(normalized_state, salt=_OAUTH_STATE_SALT, max_age=600)
        account = _account(payload.get("account") if isinstance(payload, dict) else None)
        if account is None:
            raise signing.BadSignature
    except signing.BadSignature:
        return Response({"code": "ebay_oauth_invalid_state", "detail": "OAuth state is invalid or expired."}, status=400)

    try:
        token_payload = EbayOAuthClient().exchange_code(code=normalized_code)
    except EbayApiError as error:
        return _oauth_error_response(error)

    refresh_token = str(token_payload.get("refresh_token") or "").strip()
    if not refresh_token:
        return Response({"code": "ebay_oauth_missing_refresh_token", "detail": "eBay did not return a refresh token."}, status=502)
    response = Response({"account": account, "env_key": f"EBAY_{account.upper()}_REFRESH_TOKEN", "refresh_token": refresh_token})
    response["Cache-Control"] = "no-store"
    return response


def _account(value: object) -> str | None:
    account = str(value or "").strip().lower()
    return account if account in {"jv", "xl"} else None
