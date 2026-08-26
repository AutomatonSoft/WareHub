from django.conf import settings
from django.core.exceptions import DisallowedHost
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.db import transaction, connections
from django.db.utils import OperationalError, ProgrammingError
from django.db.models import BooleanField, Case, F, Prefetch, When
from django.utils import timezone
from datetime import date, datetime, time, timedelta
from queue import Queue
import logging
import ast
import re
import threading
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import SAFE_METHODS
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
import json
import requests
import urllib.error
import urllib.request
from urllib.parse import urlparse, unquote
from uuid import uuid4

from .models import Client, EANPool, EANUsage, Ean, EanStatus, InventoryChangeLog, Kid, OrderItem, Orders, ProductAttributes, StatusProductInStock
from .order_amounts import parse_order_amount
from .inventory_audit_service import changed_fields, list_inventory_change_history, list_inventory_change_history_actors, purge_expired_inventory_change_history, record_inventory_change, request_actor, retained_inventory_history_photo_urls
from .kid_number_utils import primary_kid_number
from .inventory_service import build_critical_inventory_rows, build_inventory_dashboard_summary, build_inventory_rows, build_kid_ean_summary
from .place_rules import (
    find_place_conflict,
    list_available_pool_places,
    normalize_place,
    parse_pool_place,
    suggest_nearest_free_place,
    suggest_next_free_base_place,
    suggest_same_base_subplace,
)
from .kid_green_import_service import (
    KidGreenImportOptions,
    import_kid_green_json_bytes,
)
from .ftp_upload import (
    FtpUploadConfigError,
    FtpUploadCorruptedFileError,
    collect_uploaded_files,
    delete_uploaded_photo_urls,
    normalize_managed_public_photo_value,
    upload_kid_photo_file,
    upload_jv_product_file_for_site,
    upload_public_file,
    upload_public_file_for_site,
    upload_public_file_for_site_payload,
)
from .permissions import SessionRolePermission
from .marketplace_ean_mapping_service import MarketplaceEanMappingError, confirm_marketplace_ean_mapping
from .serializers import (
    EANPoolImportSerializer,
    EANPoolReserveSerializer,
    EANPoolClaimForJobSerializer,
    EANPoolTakeNextSerializer,
    EANPoolSerializer,
    EANUsageMarkSerializer,
    EANUsageSerializer,
    EanPatchSerializer,
    EanStatusReadSerializer,
    KidMarketplaceStatusUpdateSerializer,
    MarketplaceEanMappingConfirmSerializer,
    KidCompositePatchSerializer,
    KidCompositeUpdateRequestSerializer,
    ClientDetailViewSerializer,
    KidModelSerializer,
    KidUserReadSerializer,
    OrderDetailViewSerializer,
    OrderModelSerializer,
    OrderUserReadSerializer,
    ProductAttributesPatchSerializer,
)
from orders_pars.service import (
    collapse_items_to_orders,
    parse_afterbuy_datetime,
    search_items_auktionsliste,
)
from afterbuy_service.memo_sync import AfterbuyOrderMemoSyncService


logger = logging.getLogger(__name__)
DEFAULT_EAN_PLACEHOLDER = "0000000000000"


class MarketplaceEanMappingConfirmAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        serializer = MarketplaceEanMappingConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            mapping = confirm_marketplace_ean_mapping(**serializer.validated_data)
        except MarketplaceEanMappingError as exc:
            return Response(
                {"code": "marketplace_ean_mapping_not_confirmed", "detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"confirmed": True, "mapping": mapping}, status=status.HTTP_200_OK)


class KidMarketplaceStatusUpdateAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def patch(self, request, pk: int):
        serializer = KidMarketplaceStatusUpdateSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        kid = get_object_or_404(Kid, pk=pk)
        marketplace = serializer.validated_data["marketplace"]
        next_status = serializer.validated_data["status"]

        with transaction.atomic():
            ean_status, _ = EanStatus.objects.get_or_create(ean=kid)
            previous_status = bool(getattr(ean_status, marketplace))
            if previous_status != next_status:
                setattr(ean_status, marketplace, next_status)
                ean_status.save(update_fields=[marketplace])
                record_inventory_change(
                    kid=kid,
                    actor=request_actor(request),
                    action="marketplace_status_updated",
                    changes=[{"field": f"ean_status.{marketplace}", "before": previous_status, "after": next_status}],
                )

        return Response(
            {
                "kid_id": kid.id,
                "marketplace": marketplace,
                "status": next_status,
            },
            status=status.HTTP_200_OK,
        )


class KidMarkOutOfStockAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        place = normalize_place(payload.get("place"))
        section = str(payload.get("section") or "").strip().upper()
        requested_stock_status = str(payload.get("stock_status") or StatusProductInStock.OUT).strip().lower()

        if not place:
            return Response({"detail": "place is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(section) != 1:
            return Response(
                {"detail": "section must contain exactly one character."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if requested_stock_status not in StatusProductInStock.values:
            return Response(
                {
                    "detail": "stock_status must be one of: in_stock, returned, out.",
                    "allowed_stock_statuses": list(StatusProductInStock.values),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            kid = Kid.objects.filter(place__iexact=place, section__iexact=section).first()
            if kid is None:
                return Response(
                    {"detail": "Kid was not found for the specified place and section."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            previous_stock_status = kid.stock_status or StatusProductInStock.IN_STOCK
            status_changed = previous_stock_status != requested_stock_status
            if status_changed:
                kid.stock_status = requested_stock_status
                kid.save(update_fields=["stock_status"])

        if status_changed:
            record_inventory_change(
                kid=kid,
                actor=request_actor(request),
                action="inventory_status_updated",
                changes=[{"field": "stock_status", "before": previous_stock_status, "after": requested_stock_status}],
            )

        return Response(
            {
                "kid_id": kid.id,
                "place": kid.place,
                "section": kid.section,
                "stock_status": requested_stock_status,
                "updated": status_changed,
            },
            status=status.HTTP_200_OK,
        )


def _delete_uploaded_photo_urls_safe(photo_urls: list[str], *, context: str, kid_id: int | None = None) -> None:
    if not photo_urls:
        return
    retained_urls = retained_inventory_history_photo_urls(photo_urls)
    photo_urls = [url for url in photo_urls if url not in retained_urls]
    if not photo_urls:
        logger.info(
            "KID_PHOTO_CLEANUP_DEFERRED_FOR_INVENTORY_HISTORY context=%s kid_id=%s photo_count=%s",
            context,
            kid_id,
            len(retained_urls),
        )
        return
    try:
        delete_uploaded_photo_urls(photo_urls)
    except Exception:
        logger.exception(
            "KID_PHOTO_CLEANUP_FAILED context=%s kid_id=%s photo_count=%s",
            context,
            kid_id,
            len(photo_urls),
        )
KID_GREEN_IMPORT_JOBS: dict[str, dict] = {}
KID_GREEN_IMPORT_JOBS_LOCK = threading.Lock()


def _kid_green_job_snapshot(job_id: str) -> dict | None:
    with KID_GREEN_IMPORT_JOBS_LOCK:
        job = KID_GREEN_IMPORT_JOBS.get(job_id)
        return dict(job) if job is not None else None


def _kid_green_job_update(job_id: str, **changes) -> None:
    with KID_GREEN_IMPORT_JOBS_LOCK:
        job = KID_GREEN_IMPORT_JOBS.get(job_id)
        if job is None:
            return
        job.update(changes)


def _kid_green_progress_percent(job: dict) -> int:
    upload_percent = 15
    total = int(job.get("total") or 0)
    completed = int(job.get("completed") or 0)
    stage = str(job.get("stage") or "")
    if stage == "queued":
        return upload_percent
    if stage == "fetching":
        ratio = completed / total if total > 0 else 0
        return max(18, min(55, 20 + round(ratio * 35)))
    if stage == "processing":
        ratio = completed / total if total > 0 else 0
        return max(55, min(95, 55 + round(ratio * 40)))
    if stage == "completed":
        return 100
    if stage == "failed":
        return max(18, min(95, int(job.get("progress_percent") or 95)))
    return upload_percent


def _classify_afterbuy_sync_exception(exc: Exception) -> tuple[str, str]:
    message = str(exc or "").strip()
    normalized = message.lower()

    if isinstance(exc, requests.RequestException):
        return "afterbuy_network_failed", message or exc.__class__.__name__

    if isinstance(exc, (urllib.error.URLError, TimeoutError)):
        return "afterbuy_network_failed", message or exc.__class__.__name__

    if isinstance(exc, RuntimeError):
        if "missing afterbuy login credentials" in normalized or "missing required env vars" in normalized:
            return "missing_afterbuy_credentials", message or "Missing Afterbuy credentials."
        if "login failed" in normalized or "missing login credentials" in normalized:
            return "afterbuy_login_failed", message or "Afterbuy login failed."

    return "afterbuy_sync_failed", message or exc.__class__.__name__


def _normalize_photo_list(value: object) -> list[str]:
    normalized = normalize_managed_public_photo_value(value)
    if isinstance(normalized, list):
        return [str(item or "").strip() for item in normalized if str(item or "").strip()]
    if isinstance(normalized, str):
        text = normalized.strip()
        return [text] if text else []
    return []


def _normalize_search_text(value: object) -> str:
    return str(value or "").strip().lower()


def _inventory_row_search_haystacks(row: dict) -> dict[str, str]:
    location_value = "store" if row.get("store") else "warehouse"
    ean_values = " ".join(
        _normalize_search_text(value)
        for value in (
            row.get("ean"),
            row.get("main_ean_jv"),
            row.get("main_ean_xl"),
            row.get("jv_ean"),
            row.get("xl_ean"),
            row.get("otto_jv_ean"),
            row.get("otto_xl_ean"),
            row.get("ebay_jv_ean"),
            row.get("ebay_xl_ean"),
            row.get("kaufland_jv_ean"),
            row.get("kaufland_xl_ean"),
            row.get("hood_jv_ean"),
            row.get("hood_xl_ean"),
            " ".join(str(value or "") for value in (row.get("sku_eans") or [])),
        )
        if _normalize_search_text(value)
    )
    order_values = " ".join(
        _normalize_search_text(value)
        for value in (
            row.get("order_db_id"),
            row.get("order_id"),
            row.get("parent_order_id"),
            row.get("additional_order_ids_text"),
            row.get("platform"),
            row.get("buyer"),
            row.get("title"),
            row.get("memo"),
            row.get("sku"),
            row.get("global_price"),
            row.get("status"),
        )
        if _normalize_search_text(value)
    )

    field_map = {
        "kid": " ".join(
            value
            for value in (
                _normalize_search_text(row.get("kid_number")),
                _normalize_search_text(row.get("kid_id")),
                _normalize_search_text(row.get("kid_account")),
            )
            if value
        ),
        "kid_number": _normalize_search_text(row.get("kid_number")),
        "kid_id": _normalize_search_text(row.get("kid_id")),
        "account": _normalize_search_text(row.get("kid_account")),
        "place": _normalize_search_text(row.get("place")),
        "section": _normalize_search_text(row.get("section")),
        "location": location_value,
        "room": _normalize_search_text(row.get("room")),
        "type": _normalize_search_text(row.get("type")),
        "commentary": _normalize_search_text(row.get("commentary")),
        "quantity": _normalize_search_text(row.get("quantity")),
        "company": _normalize_search_text(row.get("company")),
        "color": _normalize_search_text(row.get("color")),
        "size": _normalize_search_text(row.get("size")),
        "material": _normalize_search_text(row.get("material")),
        "price": " ".join(
            value
            for value in (
                _normalize_search_text(row.get("price")),
                _normalize_search_text(row.get("price_currency")),
                _normalize_search_text(row.get("global_price")),
            )
            if value
        ),
        "order": order_values,
        "ean": ean_values,
    }
    field_map["global"] = " ".join(value for value in field_map.values() if value)
    return field_map


def _inventory_row_text_filter_value(row: dict, field_name: str) -> str:
    haystacks = _inventory_row_search_haystacks(row)
    return haystacks.get(field_name, "")


def _inventory_row_matches_text_filter(row: dict, field_name: str, raw_value: str) -> bool:
    normalized = _normalize_search_text(raw_value)
    if not normalized:
        return True
    return normalized in _inventory_row_text_filter_value(row, field_name)


def _inventory_row_matches_exact_text_filter(row: dict, field_name: str, raw_value: str) -> bool:
    normalized = _normalize_search_text(raw_value)
    if not normalized:
        return True
    return _inventory_row_text_filter_value(row, field_name) == normalized


def _inventory_filter_option_values(rows: list[dict], field_name: str) -> list[str]:
    values = {
        str(row.get(field_name) or "").strip()
        for row in rows
        if str(row.get(field_name) or "").strip()
    }
    if field_name == "place":
        return sorted(values, key=_inventory_place_sort_key)
    return sorted(values, key=lambda value: value.lower())


def _inventory_filter_quantity_values(rows: list[dict]) -> list[str]:
    values = {
        str(int(row.get("quantity") or 0))
        for row in rows
        if row.get("quantity") not in (None, "")
    }
    return sorted(values, key=lambda value: int(value))


def _inventory_place_sort_key(value: str) -> tuple[tuple[int, int | str], ...]:
    normalized = str(value or "").strip()
    if not normalized:
        return ((1, ""),)

    chunks = re.findall(r"\d+|[^\d]+", normalized)
    key: list[tuple[int, int | str]] = []
    for chunk in chunks:
        if chunk.isdigit():
            key.append((0, int(chunk)))
        else:
            key.append((1, chunk.lower()))
    return tuple(key)


def _sort_inventory_rows_by_place(rows: list[dict], descending: bool = False) -> list[dict]:
    populated_rows = [row for row in rows if str(row.get("place") or "").strip()]
    empty_rows = [row for row in rows if not str(row.get("place") or "").strip()]
    populated_rows.sort(
        key=lambda row: _inventory_place_sort_key(str(row.get("place") or "").strip()),
        reverse=descending,
    )
    return [*populated_rows, *empty_rows]


INVENTORY_QUERY_PREFIXES: tuple[tuple[str, str], ...] = (
    ("kid number", "kid_number"),
    ("kid id", "kid_id"),
    ("kid", "kid"),
    ("account", "account"),
    ("place", "place"),
    ("location", "location"),
    ("room", "room"),
    ("type", "type"),
    ("commentary", "commentary"),
    ("quantity", "quantity"),
    ("company", "company"),
    ("color", "color"),
    ("size", "size"),
    ("material", "material"),
    ("price", "price"),
    ("order", "order"),
    ("ean", "ean"),
)


def _find_kid_by_number(kid_number: str):
    normalized = str(kid_number or "").strip()
    if not normalized:
        return None
    return Kid.objects.filter(kid_number__contains=[normalized]).order_by("id").first()


def _find_kid_by_place(place: object):
    normalized = normalize_place(place)
    if not normalized:
        return None
    return Kid.objects.filter(place=normalized).order_by("id").first()


def _place_conflict_error(place: object, *, exclude_kid_id: int | None = None) -> dict:
    normalized = normalize_place(place)
    same_base_subplace = suggest_same_base_subplace(normalized, exclude_kid_id=exclude_kid_id)
    next_free_base_place = suggest_next_free_base_place(
        exclude_kid_id=exclude_kid_id,
        start_from=(parse_pool_place(normalized)[0] + 1) if parse_pool_place(normalized) is not None else 1,
    )
    suggested_place = same_base_subplace or next_free_base_place or suggest_nearest_free_place(normalized, exclude_kid_id=exclude_kid_id)
    message_parts = [f"Place '{normalized}' is already occupied."]
    if same_base_subplace:
        message_parts.append(f"Nearest free subplace: '{same_base_subplace}'.")
    if next_free_base_place:
        message_parts.append(f"Nearest free base place: '{next_free_base_place}'.")
    message = " ".join(message_parts)
    return {
        "code": "place_occupied",
        "message": message,
        "place": [message],
        "details": {
            "requested_place": normalized,
            "suggested_place": suggested_place,
            "same_base_subplace": same_base_subplace,
            "next_free_base_place": next_free_base_place,
        },
    }


def _existing_kid_requires_place_error(existing, *, exclude_kid_id: int | None = None) -> dict:
    current_place = normalize_place(getattr(existing, "place", None))
    same_base_subplace = suggest_same_base_subplace(current_place, exclude_kid_id=exclude_kid_id)
    parsed_place = parse_pool_place(current_place)
    next_free_base_place = suggest_next_free_base_place(
        exclude_kid_id=exclude_kid_id,
        start_from=(parsed_place[0] + 1) if parsed_place is not None else 1,
    )
    message_parts = [f"This kid already exists under place '{current_place}'."]
    if same_base_subplace:
        message_parts.append(f"Nearest free subplace: '{same_base_subplace}'.")
    if next_free_base_place:
        message_parts.append(f"Nearest free base place: '{next_free_base_place}'.")
    message = " ".join(message_parts)
    return {
        "code": "kid_already_exists_place_required",
        "message": message,
        "place": [message],
        "details": {
            "kid_id": getattr(existing, "id", None),
            "kid_number": primary_kid_number(getattr(existing, "kid_number", None)),
            "current_place": current_place,
            "same_base_subplace": same_base_subplace,
            "next_free_base_place": next_free_base_place,
            "suggested_place": same_base_subplace or next_free_base_place,
        },
    }


class ServiceHealthAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok", "service": "database_service"}, status=status.HTTP_200_OK)


class ServiceReadyAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except (OperationalError, ProgrammingError) as exc:
            return Response(
                {
                    "status": "not_ready",
                    "service": "database_service",
                    "reason": str(exc),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"status": "ready", "service": "database_service"}, status=status.HTTP_200_OK)


def _request_id_from_request(request) -> str:
    return (
        request.headers.get("x-request-id")
        or request.META.get("HTTP_X_REQUEST_ID")
        or request.META.get("REQUEST_ID")
        or ""
    )


def _session_role_from_view(view) -> str:
    request = getattr(view, "request", None)
    session = getattr(request, "session", None)
    if session is None:
        return ""
    return str(session.get("role") or "").lower()


def _extract_bearer_header(request) -> str | None:
    auth_header = str(request.headers.get("authorization") or request.META.get("HTTP_AUTHORIZATION") or "").strip()
    if not auth_header.lower().startswith("bearer "):
        return None
    return auth_header


def _normalize_remote_source_urls(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item or "").strip() for item in value if str(item or "").strip()]
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return [text]
        if isinstance(parsed, list):
            return [str(item or "").strip() for item in parsed if str(item or "").strip()]
    return []


def _simple_uploaded_file_from_remote_url(source_url: str, index: int):
    response = requests.get(
        source_url,
        timeout=20,
        headers={
            "User-Agent": "WareHub/1.0 image-relay",
            "Accept": "image/*,*/*;q=0.8",
        },
    )
    response.raise_for_status()
    raw_name = unquote(urlparse(source_url).path.split("/")[-1] or "").strip() or f"remote-image-{index + 1}.jpg"
    content_type = str(response.headers.get("Content-Type") or "").strip() or "application/octet-stream"
    return SimpleUploadedFile(raw_name, response.content, content_type=content_type)


def _is_backend_session_bridge_enabled(request) -> bool:
    try:
        host = str(request.get_host() or "").split(":", 1)[0].strip().lower()
    except DisallowedHost:
        return False
    return host in set(getattr(settings, "BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS", []))


def _fetch_backend_auth_user(auth_header: str, request_id: str) -> tuple[int, dict]:
    target_url = f"{settings.BACKEND_AUTH_BASE_URL}/auth/me"
    headers = {
        "Accept": "application/json",
        "Authorization": auth_header,
    }
    if request_id:
        headers["X-Request-Id"] = request_id

    req = urllib.request.Request(target_url, method="GET", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = resp.read()
            payload = json.loads(raw.decode("utf-8")) if raw else {}
            return resp.status, payload
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        payload = {}
        if raw:
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"message": raw[:2000]}
        return exc.code, payload


class DevBackendSessionSyncAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not _is_backend_session_bridge_enabled(request):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        request_id = _request_id_from_request(request)
        auth_header = _extract_bearer_header(request)
        if not auth_header:
            return Response(
                {
                    "code": "services_session_authorization_required",
                    "message": "Authorization Bearer token is required to sync database_service session.",
                    "request_id": request_id,
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            upstream_status, payload = _fetch_backend_auth_user(auth_header, request_id)
        except (urllib.error.URLError, TimeoutError) as exc:
            return Response(
                {
                    "code": "services_session_backend_unreachable",
                    "message": "Unable to reach backend auth service.",
                    "request_id": request_id,
                    "details": {"error": str(exc)},
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if upstream_status != status.HTTP_200_OK:
            return Response(
                {
                    "code": "services_session_backend_auth_failed",
                    "message": str(payload.get("message") or "Backend auth validation failed."),
                    "request_id": str(payload.get("request_id") or request_id),
                    "details": payload if isinstance(payload, dict) else None,
                },
                status=upstream_status,
            )

        role = str(payload.get("role") or "").strip().lower()
        account_status = str(payload.get("status") or "").strip().lower()
        login = str(payload.get("login") or "").strip()
        username = str(payload.get("username") or "").strip()
        email = str(payload.get("email") or "").strip()
        first_name = str(payload.get("first_name") or "").strip()
        last_name = str(payload.get("last_name") or "").strip()
        display_name = " ".join(value for value in (first_name, last_name) if value)

        if account_status != "approved":
            return Response(
                {
                    "code": "services_session_account_not_approved",
                    "message": "Backend account is not approved for database_service session sync.",
                    "request_id": request_id,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if role not in {"admin", "user"}:
            return Response(
                {
                    "code": "services_session_role_invalid",
                    "message": "Backend role is not allowed for database_service session sync.",
                    "request_id": request_id,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        request.session["role"] = role
        request.session["user"] = login or username or role
        request.session["username"] = username or login or role
        request.session["login"] = login or username or role
        request.session["email"] = email
        request.session["first_name"] = first_name
        request.session["last_name"] = last_name
        request.session["display_name"] = display_name or login or username or role
        request.session["auth_source"] = "backend_token_bridge"
        request.session["auth_request_id"] = request_id
        request.session.modified = True
        request.session.save()

        return Response(
            {
                "status": "ok",
                "role": role,
                "login": login or username or None,
                "request_id": request_id,
            },
            status=status.HTTP_200_OK,
        )


class InventoryRowsPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500

    def get_paginated_response(self, data):
        page_number = 1
        raw_page = self.request.query_params.get(self.page_query_param, "1")
        try:
            page_number = int(raw_page)
        except (TypeError, ValueError):
            page_number = 1

        resolved_page_size = self.get_page_size(self.request) or self.page_size
        return Response(
            {
                "count": self.page.paginator.count,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "page": page_number,
                "page_size": resolved_page_size,
                "results": data,
            }
        )


def _status_by_amounts(zahlungssumme: str, rechnungssumme: str) -> str:
    zahlung = parse_order_amount(zahlungssumme)
    rechnung = parse_order_amount(rechnungssumme)
    if zahlung is not None and rechnung is not None and zahlung == rechnung:
        return "paid"
    return "no_paid"


class KidListCreateAPIView(generics.ListCreateAPIView):
    queryset = Kid.objects.all().order_by("id")
    serializer_class = KidModelSerializer
    permission_classes = [SessionRolePermission]

    def get_serializer_class(self):
        role = _session_role_from_view(self)
        if role == "user" and self.request.method in SAFE_METHODS:
            return KidUserReadSerializer
        return KidModelSerializer

    @staticmethod
    def _normalize_raw_afterbuy_items(raw_items):
        if isinstance(raw_items, list):
            return [item for item in raw_items if isinstance(item, dict)]
        if isinstance(raw_items, dict):
            for key in ("items", "response_data", "data", "results"):
                value = raw_items.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]
        return []

    def _sync_orders_for_kid(self, kid):
        kid_number = primary_kid_number(kid.kid_number)
        if not kid_number:
            raise ValidationError({"kid_number": "KID обязателен"})

        summary = {
            "kid_number": kid_number,
            "fetched_items": 0,
            "collapsed_items": 0,
            "created": 0,
            "updated": 0,
            "skipped_without_order_id": 0,
            "error": None,
            "error_detail": None,
        }

        # Best-effort sync with Afterbuy: Kid creation should not fail
        # if external parser is unavailable.
        try:
            raw_items = search_items_auktionsliste(
                kundennummer=kid_number,
                max_total=100,
                max_items_per_page=100,
            )
            normalized_raw_items = self._normalize_raw_afterbuy_items(raw_items)
            items, _ = collapse_items_to_orders(normalized_raw_items)
            if not items and normalized_raw_items:
                # Fallback: keep raw items when collapse returns nothing.
                items = normalized_raw_items
        except Exception as exc:  # noqa: BLE001
            logger.exception("KID_AFTERBUY_SYNC_FAILED kid_number=%s", kid_number)
            error_code, error_detail = _classify_afterbuy_sync_exception(exc)
            summary["error"] = error_code
            summary["error_detail"] = error_detail
            return summary

        summary["fetched_items"] = len(normalized_raw_items)
        summary["collapsed_items"] = len(items)

        try:
            for item in items:
                raw_order_id = str(
                    item.get("order_id")
                    or item.get("OrderID")
                    or item.get("orderId")
                    or item.get("orderid")
                    or ""
                ).strip()
                main_order_id = str(item.get("main_order_id") or "").strip()
                source_order_ids = [
                    str(x).strip()
                    for x in (item.get("source_order_ids") or [])
                    if str(x).strip()
                ]

                if not main_order_id and source_order_ids:
                    main_order_id = source_order_ids[0]
                if not main_order_id and raw_order_id:
                    main_order_id = raw_order_id.split(",")[0].strip()
                if not main_order_id:
                    summary["skipped_without_order_id"] += 1
                    continue

                verkaufsdatum = str(item.get("verkaufsdatum") or item.get("order_date") or "").strip()
                zahlungssumme = str(item.get("zahlungssumme") or "").strip()
                rechnungssumme = str(item.get("rechnungssumme") or "").strip()
                title = str(item.get("title") or "").strip() or f"Order {main_order_id}"
                sku = str(item.get("sku") or "").strip() or None
                memo = str(item.get("memo") or "").strip() or None
                platform = str(item.get("platform") or "").strip() or None
                buyer = str(item.get("buyer") or "").strip() or None
                additional_items = item.get("additional_items") if isinstance(item.get("additional_items"), list) else []

                defaults = {
                    "platform": platform,
                    "buyer": buyer,
                    "title": title,
                    "sku": sku,
                    "memo": memo,
                    "order_date": parse_afterbuy_datetime(verkaufsdatum),
                    "status": _status_by_amounts(zahlungssumme, rechnungssumme),
                    "full_amount": rechnungssumme or None,
                    "additional_items": additional_items,
                }

                order_id_candidates = [main_order_id, raw_order_id, *source_order_ids]
                seen_candidates: set[str] = set()
                order_id_candidates = [
                    value
                    for value in order_id_candidates
                    if value and not (value in seen_candidates or seen_candidates.add(value))
                ]

                order = Orders.objects.filter(kid=kid, order_id__in=order_id_candidates).first()
                if order is None:
                    Orders.objects.create(kid=kid, order_id=main_order_id, **defaults)
                    summary["created"] += 1
                    continue

                fields_to_update: list[str] = []
                if order.order_id != main_order_id:
                    order.order_id = main_order_id
                    fields_to_update.append("order_id")
                for field, value in defaults.items():
                    if getattr(order, field) != value:
                        setattr(order, field, value)
                        fields_to_update.append(field)
                if fields_to_update:
                    order.save(update_fields=fields_to_update)
                    summary["updated"] += 1
        except Exception as exc:  # noqa: BLE001
            logger.exception("KID_AFTERBUY_ORDER_SYNC_PERSIST_FAILED kid_number=%s", kid_number)
            summary["error"] = "afterbuy_order_sync_failed"
            summary["error_detail"] = str(exc)
            return summary

        return summary

    @staticmethod
    def _skipped_order_sync_summary(kid):
        return {
            "kid_number": primary_kid_number(kid.kid_number),
            "fetched_items": 0,
            "collapsed_items": 0,
            "created": 0,
            "updated": 0,
            "skipped_without_order_id": 0,
            "error": None,
            "error_detail": None,
            "skipped": True,
        }

    def perform_create(self, serializer, *, skip_order_sync=False):
        kid = serializer.save()
        sync_summary = (
            self._skipped_order_sync_summary(kid)
            if skip_order_sync
            else self._sync_orders_for_kid(kid)
        )
        return kid, sync_summary

    @staticmethod
    def _empty_enrichment_summary() -> dict:
        return {
            "ok": True,
            "errors": [],
        }

    def _append_enrichment_error(self, summary: dict, *, code: str, detail: str) -> None:
        summary["ok"] = False
        summary["errors"].append({"code": code, "detail": detail})

    def _apply_kid_enrichment(self, kid, *, product_attrs: dict, main_eans: dict[str, str | None]) -> dict:
        summary = self._empty_enrichment_summary()

        try:
            self._upsert_product_attributes(kid, product_attrs)
        except Exception as exc:  # noqa: BLE001
            logger.exception("KID_PRODUCT_ATTRIBUTES_PERSIST_FAILED kid_id=%s", getattr(kid, "id", None))
            self._append_enrichment_error(
                summary,
                code="product_attributes_persist_failed",
                detail=str(exc),
            )

        try:
            self._ensure_database_ean_defaults(kid)
        except Exception as exc:  # noqa: BLE001
            logger.exception("KID_EAN_DEFAULTS_PERSIST_FAILED kid_id=%s", getattr(kid, "id", None))
            self._append_enrichment_error(
                summary,
                code="ean_defaults_persist_failed",
                detail=str(exc),
            )

        try:
            self._upsert_main_eans(kid, main_eans)
        except Exception as exc:  # noqa: BLE001
            logger.exception("KID_MAIN_EANS_PERSIST_FAILED kid_id=%s", getattr(kid, "id", None))
            self._append_enrichment_error(
                summary,
                code="main_eans_persist_failed",
                detail=str(exc),
            )

        return summary

    @staticmethod
    def _coalesce_value(data, query, key: str):
        value = data.get(key)
        if value in (None, ""):
            value = query.get(key)
        return value

    @staticmethod
    def _normalize_photo_value(value):
        if value in (None, ""):
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, tuple):
            return [str(item).strip() for item in value if str(item).strip()]

        text = str(value).strip()
        if not text:
            return []
        if text.startswith("[") and text.endswith("]"):
            try:
                parsed = ast.literal_eval(text)
            except (ValueError, SyntaxError):
                parsed = None
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        if "," in text:
            return [part.strip() for part in text.split(",") if part.strip()]
        return [text]

    @staticmethod
    def _normalize_optional_text(value):
        if value in (None, ""):
            return None
        normalized = str(value).strip()
        return normalized or None

    def _extract_furniture_type(self, data, query):
        furniture_type = self._coalesce_value(data, query, "type")
        if furniture_type in (None, ""):
            furniture_type = self._coalesce_value(data, query, "furniture_type")
        normalized = self._normalize_optional_text(furniture_type)
        if normalized is None:
            return None
        max_length = Kid._meta.get_field("furniture_type").max_length
        if len(normalized) > max_length:
            raise ValidationError({"type": [f"Ensure this field has no more than {max_length} characters."]})
        return normalized

    @staticmethod
    def _extract_product_attributes(data, query):
        text_field_map = {
            "company": ProductAttributes._meta.get_field("company").max_length,
            "color": ProductAttributes._meta.get_field("color").max_length,
            "size": ProductAttributes._meta.get_field("size").max_length,
            "material": ProductAttributes._meta.get_field("material").max_length,
        }
        attrs: dict = {}

        for field_name, max_length in text_field_map.items():
            raw_value = KidListCreateAPIView._coalesce_value(data, query, field_name)
            normalized = KidListCreateAPIView._normalize_optional_text(raw_value)
            if normalized is None:
                continue
            if len(normalized) > max_length:
                raise ValidationError({field_name: [f"Ensure this field has no more than {max_length} characters."]})
            attrs[field_name] = normalized

        raw_price = KidListCreateAPIView._coalesce_value(data, query, "price")
        if raw_price not in (None, ""):
            parsed_price = parse_order_amount(str(raw_price))
            if parsed_price is None:
                raise ValidationError({"price": ["Price must be a numeric value."]})
            attrs["price"] = parsed_price

        raw_quantity = KidListCreateAPIView._coalesce_value(data, query, "quantity")
        if raw_quantity not in (None, ""):
            try:
                parsed_quantity = int(str(raw_quantity).strip())
            except (TypeError, ValueError):
                raise ValidationError({"quantity": ["Quantity must be an integer value."]})
            if parsed_quantity < 0:
                raise ValidationError({"quantity": ["Quantity must be greater than or equal to 0."]})
            attrs["quantity"] = parsed_quantity

        return attrs

    @classmethod
    def _extract_create_main_eans(cls, data, query) -> dict[str, str | None]:
        main_eans: dict[str, str | None] = {}
        for field_name in ("main_ean_jv", "main_ean_xl"):
            normalized = KidMarketplaceEansAPIView._normalize_optional_ean(
                cls._coalesce_value(data, query, field_name)
            )
            if normalized is not None:
                KidMarketplaceEansAPIView._validate_ean(normalized, field_name)
            main_eans[field_name] = normalized
        return main_eans

    @staticmethod
    def _upsert_main_eans(kid, main_eans: dict[str, str | None]) -> None:
        ean_row, _ = Ean.objects.get_or_create(kid=kid)
        update_fields: list[str] = []
        for field_name, value in main_eans.items():
            if value is None or getattr(ean_row, field_name) == value:
                continue
            setattr(ean_row, field_name, value)
            update_fields.append(field_name)
        if update_fields:
            ean_row.save(update_fields=update_fields)

    @staticmethod
    def _upsert_product_attributes(kid, attrs: dict):
        if not attrs:
            return
        payload = dict(attrs)
        payload["currency"] = "EUR"
        ProductAttributes.objects.update_or_create(
            kid=kid,
            defaults=payload,
        )

    @staticmethod
    def _ensure_database_ean_defaults(kid) -> None:
        default_connection = connections["default"]
        existing_tables = set(default_connection.introspection.table_names())
        ean_table = Ean._meta.db_table
        if ean_table not in existing_tables:
            return

        ean_row, _ = Ean.objects.get_or_create(kid=kid)

        nullable_fields = (
            "main_ean_jv",
            "main_ean_xl",
            "jv",
            "xl",
            "otto_jv",
            "otto_xl",
            "kaufland_jv",
            "kaufland_xl",
            "hood_jv",
            "hood_xl",
            "ebay_jv",
            "ebay_xl",
        )

        update_fields: list[str] = []
        for field_name in nullable_fields:
            current_value = getattr(ean_row, field_name, None)
            if current_value in ("", DEFAULT_EAN_PLACEHOLDER):
                setattr(ean_row, field_name, None)
                update_fields.append(field_name)

        if update_fields:
            ean_row.save(update_fields=update_fields)

    def create(self, request, *args, **kwargs):
        payload = request.data.copy() if hasattr(request.data, "copy") else dict(request.data or {})
        query = request.query_params
        skip_order_sync = payload.pop("skip_order_sync", False) is True

        payload["kid_number"] = (
            self._coalesce_value(payload, query, "kid_number")
            or self._coalesce_value(payload, query, "kid")
            or []
        )
        primary_payload_kid_number = primary_kid_number(payload["kid_number"])
        existing = _find_kid_by_number(primary_payload_kid_number)
        place = self._coalesce_value(payload, query, "place")
        if place in (None, ""):
            if existing is not None:
                return Response(
                    _existing_kid_requires_place_error(existing, exclude_kid_id=existing.id),
                    status=status.HTTP_400_BAD_REQUEST,
                )
            auto_place = suggest_next_free_base_place()
            if auto_place is not None:
                payload["place"] = auto_place
        else:
            payload["place"] = str(place).strip()
        account = self._coalesce_value(payload, query, "account")
        if account not in (None, ""):
            payload["account"] = str(account).strip().upper()
        furniture_type = self._extract_furniture_type(payload, query)
        product_attrs = self._extract_product_attributes(payload, query)
        main_eans = self._extract_create_main_eans(payload, query)
        if furniture_type is not None:
            payload["furniture_type"] = furniture_type
        try:
            payload.pop("type")
        except Exception:
            pass
        for attr_key in ("company", "color", "size", "material", "price", "quantity", "currency", "main_ean_jv", "main_ean_xl"):
            try:
                payload.pop(attr_key)
            except Exception:
                pass

        uploaded_files = collect_uploaded_files(request)
        uploaded_photo_urls: list[str] = []
        if uploaded_files:
            try:
                uploaded_photo_urls = [
                    upload_kid_photo_file(file_obj, kid_number=primary_payload_kid_number)
                    for file_obj in uploaded_files
                ]
            except FtpUploadConfigError as exc:
                return Response({"code": "kid_ftp_config_error", "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                logger.exception("KID_FTP_UPLOAD_FAILED code=kid_ftp_upload_failed")
                return Response(
                    {"code": "kid_ftp_upload_failed", "detail": f"FTP upload error: {exc}"},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        # Remove non-model multipart helper fields if present.
        for upload_key in ("photo_files", "files", "images"):
            try:
                payload.pop(upload_key)
            except Exception:
                pass

        photo_value = self._coalesce_value(payload, query, "photo")
        if photo_value in (None, ""):
            photo_value = self._coalesce_value(payload, query, "photos")
        normalized_photo = self._normalize_photo_value(photo_value) if photo_value not in (None, "") else []
        if uploaded_photo_urls:
            normalized_photo = list(dict.fromkeys(normalized_photo + uploaded_photo_urls))
        if normalized_photo:
            payload["photo"] = normalized_photo

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        kid_number = primary_kid_number(validated.get("kid_number"))

        existing = _find_kid_by_place(validated.get("place"))
        target_place = validated.get("place")
        conflict = find_place_conflict(target_place, exclude_kid_id=getattr(existing, "id", None) if existing is not None else None)
        if conflict is not None:
            return Response(
                _place_conflict_error(
                    target_place,
                    exclude_kid_id=getattr(existing, "id", None) if existing is not None else None,
                ),
                status=status.HTTP_409_CONFLICT,
            )

        if existing is None:
            with transaction.atomic():
                kid, sync_summary = self.perform_create(serializer, skip_order_sync=skip_order_sync)
            enrichment_summary = self._apply_kid_enrichment(
                kid,
                product_attrs=product_attrs,
                main_eans=main_eans,
            )
            output = self.get_serializer(kid)
            headers = self.get_success_headers(output.data)
            response_data = dict(output.data)
            response_data["sync"] = sync_summary
            response_data["enrichment"] = enrichment_summary
            record_inventory_change(
                kid=kid,
                actor=request_actor(request),
                action="product_created",
                changes=[],
            )
            return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

        existing_kid_number = primary_kid_number(existing.kid_number)
        if existing_kid_number != kid_number:
            return Response(
                _place_conflict_error(target_place, exclude_kid_id=None),
                status=status.HTTP_409_CONFLICT,
            )

        before_values = {field: getattr(existing, field) for field in ("account", "place", "photo", "room", "furniture_type", "commentary", "b_ware", "store", "in_transit")}
        update_fields = []
        for field in ("account", "place", "photo", "room", "furniture_type", "commentary", "b_ware", "store", "in_transit"):
            if field in validated:
                next_value = validated.get(field)
                if getattr(existing, field) != next_value:
                    setattr(existing, field, next_value)
                    update_fields.append(field)

        if update_fields:
            existing.save(update_fields=update_fields)

        enrichment_summary = self._apply_kid_enrichment(
            existing,
            product_attrs=product_attrs,
            main_eans=main_eans,
        )
        sync_summary = (
            self._skipped_order_sync_summary(existing)
            if skip_order_sync
            else self._sync_orders_for_kid(existing)
        )
        output = self.get_serializer(existing)
        response_data = dict(output.data)
        response_data["sync"] = sync_summary
        response_data["enrichment"] = enrichment_summary
        changes = changed_fields(before_values, {field: getattr(existing, field) for field in before_values})
        if changes:
            record_inventory_change(kid=existing, actor=request_actor(request), action="product_updated", changes=changes)
        return Response(response_data, status=status.HTTP_200_OK)

class KidRetrieveUpdateAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Kid.objects.all()
    serializer_class = KidModelSerializer
    permission_classes = [SessionRolePermission]

    def get_serializer_class(self):
        role = _session_role_from_view(self)
        if role == "user" and self.request.method in SAFE_METHODS:
            return KidUserReadSerializer
        return KidModelSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        old_photos = _normalize_photo_list(instance.photo)
        payload = request.data.copy() if hasattr(request.data, "copy") else request.data
        serializer = self.get_serializer(instance, data=payload, partial=partial)
        serializer.is_valid(raise_exception=True)
        before_values = {field: getattr(instance, field) for field in serializer.validated_data}

        if "place" in serializer.validated_data:
            target_place = serializer.validated_data.get("place")
            conflict = find_place_conflict(target_place, exclude_kid_id=instance.id)
            if conflict is not None:
                return Response(
                    _place_conflict_error(target_place, exclude_kid_id=instance.id),
                    status=status.HTTP_409_CONFLICT,
                )

        photo_was_provided = "photo" in serializer.validated_data
        next_photos = _normalize_photo_list(serializer.validated_data.get("photo")) if photo_was_provided else old_photos
        removed_photos = [url for url in old_photos if url not in next_photos]

        with transaction.atomic():
            self.perform_update(serializer)

        changes = changed_fields(before_values, {field: getattr(instance, field) for field in before_values})
        if changes:
            record_inventory_change(kid=instance, actor=request_actor(request), action="product_updated", changes=changes)
        if removed_photos:
            _delete_uploaded_photo_urls_safe(removed_photos, context="kid_partial_update", kid_id=instance.id)

        return Response(serializer.data, status=status.HTTP_200_OK)

    def perform_destroy(self, instance):
        with transaction.atomic():
            photo_urls = _normalize_photo_list(instance.photo)
            if photo_urls:
                _delete_uploaded_photo_urls_safe(photo_urls, context="kid_destroy", kid_id=instance.id)
            InventoryChangeLog.objects.filter(kid=instance).update(kid=None)
            instance.delete()


class OrderListCreateAPIView(generics.ListCreateAPIView):
    queryset = Orders.objects.select_related("kid").all().order_by("id")
    serializer_class = OrderModelSerializer
    permission_classes = [SessionRolePermission]

    def get_serializer_class(self):
        role = _session_role_from_view(self)
        if role == "user" and self.request.method in SAFE_METHODS:
            return OrderUserReadSerializer
        return OrderModelSerializer

    def create(self, request, *args, **kwargs):
        kid_number = primary_kid_number(request.data.get("kid_number"))
        if not kid_number:
            return Response(
                {"kid_number": ["Укажите kid_number."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        kid = _find_kid_by_number(kid_number)
        if kid is None:
            return Response(
                {"kid_number": [f"Kid с kid_number='{kid_number}' не найден."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = request.data.copy()
        payload["kid"] = kid.id
        payload.pop("kid_number", None)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class OrderRetrieveUpdateAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Orders.objects.select_related("kid").all()
    serializer_class = OrderModelSerializer
    permission_classes = [SessionRolePermission]

    def get_serializer_class(self):
        role = _session_role_from_view(self)
        if role == "user" and self.request.method in SAFE_METHODS:
            return OrderUserReadSerializer
        return OrderModelSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        previous_memo = instance.memo
        payload = request.data.copy()
        if "kid" in payload or "kid_number" in payload:
            return Response(
                {"kid": ["Изменение kid у существующего order запрещено."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload["kid"] = instance.kid_id
        payload.pop("kid_number", None)
        serializer = self.get_serializer(instance, data=payload, partial=partial)
        serializer.is_valid(raise_exception=True)
        memo_was_updated = "memo" in serializer.validated_data
        save_kwargs = {}
        if memo_was_updated:
            save_kwargs = {
                "memo_sync_status": "pending",
                "memo_sync_error": None,
                "memo_sync_error_type": None,
            }
        updated_order = serializer.save(**save_kwargs)
        if memo_was_updated:
            updated_order = AfterbuyOrderMemoSyncService().sync_order(updated_order)
            if previous_memo != updated_order.memo:
                record_inventory_change(
                    kid=updated_order.kid,
                    actor=request_actor(request),
                    action="order_memo_updated",
                    changes=[
                        {
                            "field": "order.memo",
                            "before": previous_memo or "",
                            "after": updated_order.memo or "",
                        }
                    ],
                    metadata={
                        "entity": "order",
                        "order_db_id": updated_order.id,
                        "order_id": updated_order.order_id,
                    },
                )
        return Response(OrderModelSerializer(updated_order).data, status=status.HTTP_200_OK)


class KidCompositeUpdateAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def patch(self, request, pk: int):
        kid = get_object_or_404(Kid, pk=pk)
        request_serializer = KidCompositeUpdateRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        payload = request_serializer.validated_data

        old_photos = _normalize_photo_list(kid.photo)
        removed_photos: list[str] = []
        updated_orders: list[Orders] = []
        audit_changes: list[dict] = []

        with transaction.atomic():
            kid_payload = payload.get("kid")
            if isinstance(kid_payload, dict):
                kid_serializer = KidCompositePatchSerializer(kid, data=kid_payload, partial=True)
                kid_serializer.is_valid(raise_exception=True)
                before_values = {field: getattr(kid, field) for field in kid_serializer.validated_data}
                if "photo" in kid_serializer.validated_data:
                    next_photos = _normalize_photo_list(kid_serializer.validated_data.get("photo"))
                    removed_photos = [url for url in old_photos if url not in next_photos]
                kid_serializer.save()
                audit_changes.extend(changed_fields(before_values, {field: getattr(kid, field) for field in before_values}))

            ean_payload = payload.get("ean")
            if isinstance(ean_payload, dict):
                ean_row, _ = Ean.objects.get_or_create(kid=kid)
                ean_serializer = EanPatchSerializer(ean_row, data=ean_payload, partial=True)
                ean_serializer.is_valid(raise_exception=True)
                ean_before = {f"ean.{field}": getattr(ean_row, field) for field in ean_serializer.validated_data}
                ean_serializer.save()
                ean_after = {field: getattr(ean_row, field.removeprefix("ean.")) for field in ean_before}
                audit_changes.extend(changed_fields(ean_before, ean_after))

            attrs_payload = payload.get("product_attributes")
            if isinstance(attrs_payload, dict):
                attrs_row, _ = ProductAttributes.objects.get_or_create(kid=kid)
                attrs_serializer = ProductAttributesPatchSerializer(attrs_row, data=attrs_payload, partial=True)
                attrs_serializer.is_valid(raise_exception=True)
                attrs_before = {f"attributes.{field}": getattr(attrs_row, field) for field in attrs_serializer.validated_data}
                attrs_serializer.save()
                attrs_after = {field: getattr(attrs_row, field.removeprefix("attributes.")) for field in attrs_before}
                audit_changes.extend(changed_fields(attrs_before, attrs_after))

            for order_payload in payload.get("orders") or []:
                order_pk = int(order_payload["id"])
                order = Orders.objects.filter(pk=order_pk, kid=kid).first()
                if order is None:
                    return Response(
                        {"detail": f"Order id={order_pk} was not found for kid id={kid.id}."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                partial_payload = dict(order_payload)
                partial_payload.pop("id", None)
                order_serializer = OrderModelSerializer(order, data=partial_payload, partial=True)
                order_serializer.is_valid(raise_exception=True)
                updated_orders.append(order_serializer.save())

            if audit_changes:
                record_inventory_change(kid=kid, actor=request_actor(request), action="product_updated", changes=audit_changes)

        if removed_photos:
            _delete_uploaded_photo_urls_safe(removed_photos, context="kid_composite_update", kid_id=kid.id)

        kid.refresh_from_db()
        response_orders = list(Orders.objects.filter(kid=kid, pk__in=[order.id for order in updated_orders]).order_by("id"))
        ean_row = Ean.objects.filter(kid=kid).first()
        attrs_row = ProductAttributes.objects.filter(kid=kid).first()
        return Response(
            {
                "kid": KidModelSerializer(kid).data,
                "ean": EanPatchSerializer(ean_row).data if ean_row is not None else None,
                "product_attributes": ProductAttributesPatchSerializer(attrs_row).data if attrs_row is not None else None,
                "orders": OrderModelSerializer(response_orders, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class KidOrderIDsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, kid_id):
        kid = get_object_or_404(Kid, id=kid_id)
        order_ids = list(
            Orders.objects.filter(kid_id=kid.id).values_list("order_id", flat=True)
        )
        return Response({"kid_id": kid.id, "order_ids": order_ids})


class KidDetailViewAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, pk: int):
        kid = get_object_or_404(Kid, pk=pk)
        purge_expired_inventory_change_history()

        ean_row = Ean.objects.filter(kid=kid).first()
        status_row = EanStatus.objects.filter(ean_id=kid.id).first()
        attrs_row = ProductAttributes.objects.filter(kid=kid).first()
        client_row = Client.objects.filter(kid=kid).first()
        order_items = (
            OrderItem.objects.annotate(
                is_main_item=Case(
                    When(afterbuy_item_id=F("order__order_id"), then=True),
                    default=False,
                    output_field=BooleanField(),
                )
            )
            .order_by("id")
        )
        orders = list(
            Orders.objects.filter(kid=kid)
            .prefetch_related(Prefetch("items", queryset=order_items))
            .order_by("-order_date", "-id")
        )
        change_log_rows = list(
            InventoryChangeLog.objects.filter(kid=kid)
            .order_by("-created_at", "-id")[:50]
        )

        payload = {
            "kid": KidModelSerializer(kid).data,
            "ean": EanPatchSerializer(ean_row).data if ean_row is not None else None,
            "ean_status": EanStatusReadSerializer(status_row).data if status_row is not None else None,
            "product_attributes": ProductAttributesPatchSerializer(attrs_row).data if attrs_row is not None else None,
            "client": ClientDetailViewSerializer(client_row).data if client_row is not None else None,
            "orders": OrderDetailViewSerializer(orders, many=True).data,
            "inventory_change_log": [
                {
                    "id": row.id,
                    "occurred_at": row.created_at.isoformat(),
                    "actor": {"login": row.actor_login, "name": row.actor_name},
                    "action": row.action,
                    "kid_number": row.kid_number,
                    "place": row.place,
                    "changes": row.changes,
                    "metadata": row.metadata,
                }
                for row in change_log_rows
            ],
        }
        return Response(payload, status=status.HTTP_200_OK)


class KidEanSummaryAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, kid_id):
        kid = get_object_or_404(Kid, id=kid_id)
        payload = build_kid_ean_summary(kid.id)
        payload["kid_number"] = primary_kid_number(kid.kid_number)
        return Response(payload, status=status.HTTP_200_OK)


class KidMarketplaceEansAPIView(APIView):
    permission_classes = [SessionRolePermission]
    B_WARE_EAN_MARKER = "B_WARE"
    OTTO_EAN_FIELDS = frozenset({"otto_jv_ean", "otto_xl_ean"})

    @staticmethod
    def _normalize_ean(value: object) -> str:
        normalized = str(value or "").strip()
        if not normalized:
            return DEFAULT_EAN_PLACEHOLDER
        return normalized

    @staticmethod
    def _normalize_optional_ean(value: object) -> str | None:
        normalized = str(value or "").strip()
        if not normalized or normalized == DEFAULT_EAN_PLACEHOLDER:
            return None
        return normalized

    @classmethod
    def _normalize_marketplace_ean(cls, value: object, field_name: str) -> str | None:
        normalized = cls._normalize_optional_ean(value)
        if field_name in cls.OTTO_EAN_FIELDS and normalized and normalized.upper().replace("-", "_") == cls.B_WARE_EAN_MARKER:
            return cls.B_WARE_EAN_MARKER
        return normalized

    @staticmethod
    def _normalize_ean_for_response(value: object) -> str:
        normalized = str(value or "").strip()
        if not normalized or normalized == DEFAULT_EAN_PLACEHOLDER:
            return ""
        return normalized

    @staticmethod
    def _validate_ean(value: str, field_name: str, *, allow_b_ware: bool = False) -> None:
        if allow_b_ware and value == KidMarketplaceEansAPIView.B_WARE_EAN_MARKER:
            return
        if len(value) > 64:
            raise ValidationError({field_name: "Marketplace EAN must not exceed 64 characters."})

    @classmethod
    def _build_ean_response(cls, kid: Kid, kid_number: str, ean_row: Ean | None) -> dict:
        return {
            "kid_id": kid.id,
            "kid_number": kid_number,
            "main_ean_jv": cls._normalize_ean_for_response(getattr(ean_row, "main_ean_jv", None)),
            "main_ean_xl": cls._normalize_ean_for_response(getattr(ean_row, "main_ean_xl", None)),
            "cosmoshop_ean": cls._normalize_ean_for_response(getattr(ean_row, "jv", None)),
            "opencart_ean": cls._normalize_ean_for_response(getattr(ean_row, "xl", None)),
            "otto_jv_ean": cls._normalize_ean_for_response(getattr(ean_row, "otto_jv", None)),
            "otto_xl_ean": cls._normalize_ean_for_response(getattr(ean_row, "otto_xl", None)),
            "ebay_jv_ean": cls._normalize_ean_for_response(getattr(ean_row, "ebay_jv", None)),
            "ebay_xl_ean": cls._normalize_ean_for_response(getattr(ean_row, "ebay_xl", None)),
            "kaufland_jv_ean": cls._normalize_ean_for_response(getattr(ean_row, "kaufland_jv", None)),
            "kaufland_xl_ean": cls._normalize_ean_for_response(getattr(ean_row, "kaufland_xl", None)),
            "hood_jv_ean": cls._normalize_ean_for_response(getattr(ean_row, "hood_jv", None)),
            "hood_xl_ean": cls._normalize_ean_for_response(getattr(ean_row, "hood_xl", None)),
        }

    def get(self, request, kid_id: int):
        kid = get_object_or_404(Kid, id=kid_id)
        kid_number = primary_kid_number(kid.kid_number)
        if not kid_number:
            return Response({"detail": "kid_number is empty."}, status=status.HTTP_400_BAD_REQUEST)

        ean_row = Ean.objects.filter(kid=kid).first()
        return Response(self._build_ean_response(kid, kid_number, ean_row), status=status.HTTP_200_OK)

    def patch(self, request, kid_id: int):
        kid = get_object_or_404(Kid, id=kid_id)
        kid_number = primary_kid_number(kid.kid_number)
        if not kid_number:
            return Response({"detail": "kid_number is empty."}, status=status.HTTP_400_BAD_REQUEST)

        payload = request.data if isinstance(request.data, dict) else {}
        fields = [
            "cosmoshop_ean",
            "opencart_ean",
            "otto_jv_ean",
            "otto_xl_ean",
            "ebay_jv_ean",
            "ebay_xl_ean",
            "kaufland_jv_ean",
            "kaufland_xl_ean",
            "hood_jv_ean",
            "hood_xl_ean",
        ]

        updates: dict[str, str | None] = {}
        for field in ("main_ean_jv", "main_ean_xl"):
            if field not in payload:
                continue
            normalized = self._normalize_optional_ean(payload.get(field))
            if normalized is not None:
                self._validate_ean(normalized, field)
            updates[field] = normalized

        for field in fields:
            if field not in payload:
                continue
            normalized = self._normalize_marketplace_ean(payload.get(field), field)
            if normalized is not None:
                self._validate_ean(normalized, field, allow_b_ware=field in self.OTTO_EAN_FIELDS)
            updates[field] = normalized

        if not updates:
            return Response({"detail": "No valid fields to update."}, status=status.HTTP_400_BAD_REQUEST)

        field_map = {
            "main_ean_jv": "main_ean_jv",
            "main_ean_xl": "main_ean_xl",
            "cosmoshop_ean": "jv",
            "opencart_ean": "xl",
            "otto_jv_ean": "otto_jv",
            "otto_xl_ean": "otto_xl",
            "ebay_jv_ean": "ebay_jv",
            "ebay_xl_ean": "ebay_xl",
            "kaufland_jv_ean": "kaufland_jv",
            "kaufland_xl_ean": "kaufland_xl",
            "hood_jv_ean": "hood_jv",
            "hood_xl_ean": "hood_xl",
        }

        with transaction.atomic():
            ean_row, _ = Ean.objects.get_or_create(kid=kid)
            ean_update_fields: list[str] = []
            for request_field, model_field in field_map.items():
                if request_field not in updates:
                    continue
                field_value = updates[request_field]
                if getattr(ean_row, model_field) != field_value:
                    setattr(ean_row, model_field, field_value)
                    ean_update_fields.append(model_field)
            if ean_update_fields:
                ean_row.save(update_fields=ean_update_fields)

        return self.get(request, kid_id)


class KidGreenImportAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @staticmethod
    def _request_value(request, key: str):
        data = getattr(request, "data", None)
        if hasattr(data, "get"):
            value = data.get(key)
            if value not in (None, ""):
                return value
        return request.query_params.get(key)

    def post(self, request):
        raw_body = bytes(request.body or b"")
        uploaded_file = (
            request.FILES.get("file")
            or request.FILES.get("json_file")
            or request.FILES.get("kid_green")
        )
        if uploaded_file is not None:
            raw_bytes = uploaded_file.read()
        elif str(request.content_type or "").startswith("multipart/"):
            raw_bytes = b""
        else:
            raw_bytes = raw_body
        if not raw_bytes:
            return Response(
                {
                    "code": "kid_green_file_required",
                    "message": "Upload kid_green.json as multipart file or send a JSON array body.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        options = KidGreenImportOptions.from_raw(
            max_total=self._request_value(request, "max_total"),
            max_items_per_page=self._request_value(request, "max_items_per_page"),
            workers=self._request_value(request, "workers"),
            timeout_retries=self._request_value(request, "timeout_retries"),
            timeout_retry_delay=self._request_value(request, "timeout_retry_delay"),
            show_progress=False,
        )
        async_job = str(self._request_value(request, "async") or "").strip().lower() in {"1", "true", "yes", "on"}
        stream_progress = str(self._request_value(request, "stream") or "").strip().lower() in {"1", "true", "yes", "on"}

        if async_job:
            job_id = uuid4().hex
            _kid_green_job_update  # keep linters honest about helper use before thread closure
            with KID_GREEN_IMPORT_JOBS_LOCK:
                KID_GREEN_IMPORT_JOBS[job_id] = {
                    "job_id": job_id,
                    "status": "queued",
                    "stage": "queued",
                    "progress_percent": 15,
                    "message": "Upload accepted. Waiting to start import...",
                    "total_payloads": 0,
                    "unique_kids": 0,
                    "total": 0,
                    "completed": 0,
                    "current_kid": None,
                    "result": None,
                    "error": None,
                }

            def emit_job_progress(event: dict) -> None:
                if event.get("type") == "start":
                    total_payloads = int(event.get("total_payloads") or 0)
                    unique_kids = int(event.get("unique_kids") or 0)
                    _kid_green_job_update(
                        job_id,
                        status="running",
                        stage="fetching",
                        total_payloads=total_payloads,
                        unique_kids=unique_kids,
                        total=unique_kids,
                        completed=0,
                        current_kid=None,
                        message=f"Preparing {unique_kids} item(s) for import...",
                    )
                    snapshot = _kid_green_job_snapshot(job_id) or {}
                    _kid_green_job_update(job_id, progress_percent=_kid_green_progress_percent(snapshot))
                    return

                if event.get("type") == "afterbuy_fetched":
                    completed = int(event.get("completed") or 0)
                    total = int(event.get("total") or 0)
                    kid_number = str(event.get("kid_number") or "").strip() or None
                    error = str(event.get("error") or "").strip()
                    _kid_green_job_update(
                        job_id,
                        status="running",
                        stage="fetching",
                        completed=completed,
                        total=total,
                        current_kid=kid_number,
                        message=(
                            f"Afterbuy fetch failed for {kid_number} ({completed}/{total})."
                            if error and kid_number
                            else f"Fetched Afterbuy data for {kid_number} ({completed}/{total})."
                        ),
                    )
                    snapshot = _kid_green_job_snapshot(job_id) or {}
                    _kid_green_job_update(job_id, progress_percent=_kid_green_progress_percent(snapshot))
                    return

                if event.get("type") == "kid_processed":
                    completed = int(event.get("completed") or 0)
                    total = int(event.get("total") or 0)
                    kid_number = str(event.get("kid_number") or "").strip() or None
                    status_value = str(event.get("status") or "").strip()
                    message = (
                        f"Imported {kid_number} ({completed}/{total}), created {int(event.get('orders_created') or 0)}, updated {int(event.get('orders_updated') or 0)}."
                        if status_value == "ok" and kid_number
                        else f"Processed {kid_number} ({completed}/{total}): {str(event.get('error') or status_value)}."
                    )
                    _kid_green_job_update(
                        job_id,
                        status="running",
                        stage="processing",
                        completed=completed,
                        total=total,
                        current_kid=kid_number,
                        message=message,
                    )
                    snapshot = _kid_green_job_snapshot(job_id) or {}
                    _kid_green_job_update(job_id, progress_percent=_kid_green_progress_percent(snapshot))

            def async_worker() -> None:
                try:
                    result = import_kid_green_json_bytes(raw_bytes, options=options, progress_callback=emit_job_progress)
                    _kid_green_job_update(
                        job_id,
                        status="completed",
                        stage="completed",
                        progress_percent=100,
                        message="Import completed.",
                        result={"status": "ok", **result.to_dict()},
                        error=None,
                    )
                except ValueError as exc:
                    snapshot = _kid_green_job_snapshot(job_id) or {}
                    _kid_green_job_update(
                        job_id,
                        status="failed",
                        stage="failed",
                        progress_percent=_kid_green_progress_percent(snapshot),
                        message=str(exc),
                        error={"code": "kid_green_invalid_payload", "message": str(exc)},
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.exception("KID_GREEN_IMPORT_FAILED")
                    snapshot = _kid_green_job_snapshot(job_id) or {}
                    _kid_green_job_update(
                        job_id,
                        status="failed",
                        stage="failed",
                        progress_percent=_kid_green_progress_percent(snapshot),
                        message="Failed to import kid_green.json.",
                        error={
                            "code": "kid_green_import_failed",
                            "message": "Failed to import kid_green.json.",
                            "details": {"error": str(exc)},
                        },
                    )

            threading.Thread(target=async_worker, daemon=True).start()
            return Response(
                {
                    "status": "accepted",
                    "job_id": job_id,
                    "progress_percent": 15,
                    "message": "Upload accepted. Waiting to start import...",
                },
                status=status.HTTP_202_ACCEPTED,
            )

        if stream_progress:
            event_queue: Queue[dict | None] = Queue()

            def emit(event: dict) -> None:
                event_queue.put(event)

            def worker() -> None:
                try:
                    result = import_kid_green_json_bytes(raw_bytes, options=options, progress_callback=emit)
                    emit({"type": "complete", "status": "ok", "result": result.to_dict()})
                except ValueError as exc:
                    emit({"type": "error", "code": "kid_green_invalid_payload", "message": str(exc)})
                except Exception as exc:  # noqa: BLE001
                    logger.exception("KID_GREEN_IMPORT_FAILED")
                    emit(
                        {
                            "type": "error",
                            "code": "kid_green_import_failed",
                            "message": "Failed to import kid_green.json.",
                            "details": {"error": str(exc)},
                        }
                    )
                finally:
                    event_queue.put(None)

            def stream_events():
                while True:
                    event = event_queue.get()
                    if event is None:
                        break
                    yield json.dumps(event) + "\n"

            threading.Thread(target=worker, daemon=True).start()
            return StreamingHttpResponse(stream_events(), content_type="application/x-ndjson")

        try:
            result = import_kid_green_json_bytes(raw_bytes, options=options)
        except ValueError as exc:
            return Response(
                {
                    "code": "kid_green_invalid_payload",
                    "message": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("KID_GREEN_IMPORT_FAILED")
            return Response(
                {
                    "code": "kid_green_import_failed",
                    "message": "Failed to import kid_green.json.",
                    "details": {"error": str(exc)},
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"status": "ok", **result.to_dict()}, status=status.HTTP_200_OK)


class KidGreenImportJobStatusAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, job_id: str):
        snapshot = _kid_green_job_snapshot(job_id)
        if snapshot is None:
            return Response({"code": "kid_green_job_not_found", "message": "Import job was not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(snapshot, status=status.HTTP_200_OK)


class InventoryRowsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        request_id = _request_id_from_request(request)
        try:
            rows = build_inventory_rows()
        except (ProgrammingError, OperationalError) as exc:
            logger.exception("INVENTORY_ROWS_SCHEMA_ERROR code=inventory_rows_schema_error request_id=%s", request_id)
            return Response(
                {
                    "code": "INVENTORY_ROWS_SCHEMA_ERROR",
                    "message": "Inventory rows query failed due to database schema mismatch.",
                    "request_id": request_id,
                    "details": {
                        "hint": "Apply latest database migrations in services/database_service.",
                        "error": str(exc),
                    },
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("INVENTORY_ROWS_INTERNAL_ERROR code=inventory_rows_internal_error request_id=%s", request_id)
            return Response(
                {
                    "code": "INVENTORY_ROWS_INTERNAL_ERROR",
                    "message": "Failed to load inventory rows.",
                    "request_id": request_id,
                    "details": {"error": str(exc)},
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        kid_id_raw = request.query_params.get("kid_id")
        if kid_id_raw not in (None, ""):
            try:
                kid_id = int(str(kid_id_raw).strip())
            except (TypeError, ValueError):
                return Response(
                    {"detail": "kid_id должен быть целым числом."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            rows = [row for row in rows if int(row.get("kid_id") or 0) == kid_id]

        query_raw = str(request.query_params.get("q") or "").strip().lower()
        place_raw = str(request.query_params.get("place") or "").strip()
        section_raw = str(request.query_params.get("section") or "").strip()
        location_raw = str(request.query_params.get("location") or "").strip().lower()
        quantity_raw = str(request.query_params.get("quantity") or "").strip()
        room_raw = str(request.query_params.get("room") or "").strip().lower()
        type_raw = str(request.query_params.get("type") or "").strip().lower()
        company_raw = str(request.query_params.get("company") or "").strip()
        color_raw = str(request.query_params.get("color") or "").strip()
        material_raw = str(request.query_params.get("material") or "").strip()
        b_ware_raw = str(request.query_params.get("b_ware") or "").strip().lower()
        stock_status_raw = str(
            request.query_params.get("stock_status") or request.query_params.get("in_stock") or ""
        ).strip().lower()
        in_transit_raw = str(request.query_params.get("in_transit") or "").strip().lower()

        if place_raw:
            rows = [row for row in rows if _inventory_row_matches_exact_text_filter(row, "place", place_raw)]

        if section_raw:
            rows = [row for row in rows if _inventory_row_matches_exact_text_filter(row, "section", section_raw)]

        if location_raw in {"warehouse", "store"}:
            rows = [row for row in rows if _inventory_row_text_filter_value(row, "location") == location_raw]

        if quantity_raw:
            rows = [row for row in rows if _inventory_row_matches_exact_text_filter(row, "quantity", quantity_raw)]

        if room_raw:
            rows = [row for row in rows if _inventory_row_matches_text_filter(row, "room", room_raw)]

        if type_raw:
            rows = [row for row in rows if _inventory_row_matches_text_filter(row, "type", type_raw)]

        if company_raw:
            rows = [row for row in rows if _inventory_row_matches_text_filter(row, "company", company_raw)]

        if color_raw:
            rows = [row for row in rows if _inventory_row_matches_text_filter(row, "color", color_raw)]

        if material_raw:
            rows = [row for row in rows if _inventory_row_matches_text_filter(row, "material", material_raw)]

        if b_ware_raw == "true":
            rows = [row for row in rows if row.get("b_ware") is True]

        legacy_stock_statuses = {"true": StatusProductInStock.IN_STOCK, "false": StatusProductInStock.OUT}
        requested_stock_status = legacy_stock_statuses.get(stock_status_raw, stock_status_raw)
        if requested_stock_status in StatusProductInStock.values:
            rows = [row for row in rows if row.get("stock_status") == requested_stock_status]

        if in_transit_raw == "true":
            rows = [row for row in rows if row.get("in_transit") is True]

        if query_raw:
            query_tokens = [token for token in query_raw.split() if token]
            scoped_field = None
            scoped_query = query_raw
            for prefix, field_name in INVENTORY_QUERY_PREFIXES:
                marker = f"{prefix} "
                if query_raw.startswith(marker):
                    scoped_field = field_name
                    scoped_query = query_raw[len(marker):].strip()
                    break

            scoped_tokens = [token for token in scoped_query.split() if token]

            def _matches_query(row: dict) -> bool:
                haystacks = _inventory_row_search_haystacks(row)
                if scoped_field and scoped_tokens:
                    return all(token in haystacks.get(scoped_field, "") for token in scoped_tokens)
                return all(token in haystacks["global"] for token in query_tokens)

            rows = [row for row in rows if _matches_query(row)]

        sort_raw = str(request.query_params.get("sort") or "").strip().lower()
        dir_raw = str(request.query_params.get("dir") or "asc").strip().lower()
        reverse = dir_raw == "desc"
        if sort_raw == "quantity":
            rows = sorted(rows, key=lambda row: int(row.get("quantity") or 0), reverse=reverse)
        elif sort_raw == "place":
            rows = _sort_inventory_rows_by_place(rows, descending=reverse)

        place_sort_raw = str(request.query_params.get("place_sort") or "").strip().lower()
        if place_sort_raw in {"asc", "desc"} and sort_raw != "place":
            rows = _sort_inventory_rows_by_place(rows, descending=place_sort_raw == "desc")
        elif not sort_raw:
            rows = _sort_inventory_rows_by_place(rows, descending=False)

        paginator = InventoryRowsPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response(page)


class InventoryDashboardSummaryAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        request_id = _request_id_from_request(request)
        try:
            return Response(build_inventory_dashboard_summary(), status=status.HTTP_200_OK)
        except (ProgrammingError, OperationalError):
            logger.exception(
                "INVENTORY_DASHBOARD_SUMMARY_SCHEMA_ERROR request_id=%s",
                request_id,
            )
            return Response(
                {
                    "code": "INVENTORY_DASHBOARD_SUMMARY_SCHEMA_ERROR",
                    "message": "Inventory dashboard summary is unavailable due to a database schema mismatch.",
                    "request_id": request_id,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception:  # noqa: BLE001
            logger.exception("INVENTORY_DASHBOARD_SUMMARY_INTERNAL_ERROR request_id=%s", request_id)
            return Response(
                {
                    "code": "INVENTORY_DASHBOARD_SUMMARY_INTERNAL_ERROR",
                    "message": "Failed to load the inventory dashboard summary.",
                    "request_id": request_id,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CriticalInventoryAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        return Response(build_critical_inventory_rows(), status=status.HTTP_200_OK)


class InventoryChangeHistoryAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @staticmethod
    def _date_range(request) -> tuple[datetime | None, datetime | None]:
        def parse_date(parameter: str) -> date | None:
            try:
                return date.fromisoformat(str(request.query_params.get(parameter) or ""))
            except (TypeError, ValueError):
                return None

        start_date = parse_date("date_from")
        end_date = parse_date("date_to")
        if start_date or end_date:
            start_date = start_date or end_date
            end_date = end_date or start_date
            if end_date < start_date:
                start_date, end_date = end_date, start_date
            current_timezone = timezone.get_current_timezone()
            return (
                timezone.make_aware(datetime.combine(start_date, time.min), current_timezone),
                timezone.make_aware(datetime.combine(end_date + timedelta(days=1), time.min), current_timezone),
            )

        period = str(request.query_params.get("period") or "").strip().lower()
        if period not in {"day", "week", "month"}:
            return None, None
        try:
            selected_date = date.fromisoformat(str(request.query_params.get("date") or ""))
        except ValueError:
            selected_date = timezone.localdate()

        if period == "week":
            start_date = selected_date - timedelta(days=selected_date.weekday())
            end_date = start_date + timedelta(days=7)
        elif period == "month":
            start_date = selected_date.replace(day=1)
            end_date = (start_date.replace(year=start_date.year + 1, month=1) if start_date.month == 12 else start_date.replace(month=start_date.month + 1))
        else:
            start_date = selected_date
            end_date = start_date + timedelta(days=1)

        current_timezone = timezone.get_current_timezone()
        return (
            timezone.make_aware(datetime.combine(start_date, time.min), current_timezone),
            timezone.make_aware(datetime.combine(end_date, time.min), current_timezone),
        )

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        try:
            page = int(request.query_params.get("page", 1))
        except (TypeError, ValueError):
            page = 1
        search = str(request.query_params.get("q") or "").strip()
        actor = str(request.query_params.get("actor") or "").strip()
        occurred_after, occurred_before = self._date_range(request)
        try:
            history = list_inventory_change_history(
                limit=limit,
                page=page,
                search=search,
                actor=actor,
                occurred_after=occurred_after,
                occurred_before=occurred_before,
            )
            return Response(
                {
                    **history,
                    "actors": list_inventory_change_history_actors(
                        search=search,
                        occurred_after=occurred_after,
                        occurred_before=occurred_before,
                    ),
                },
                status=status.HTTP_200_OK,
            )
        except (ProgrammingError, OperationalError):
            logger.exception("INVENTORY_CHANGE_HISTORY_SCHEMA_ERROR")
            return Response(
                {"code": "INVENTORY_CHANGE_HISTORY_SCHEMA_ERROR", "message": "Inventory change history is unavailable."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception:  # noqa: BLE001
            logger.exception("INVENTORY_CHANGE_HISTORY_INTERNAL_ERROR")
            return Response(
                {
                    "code": "INVENTORY_CHANGE_HISTORY_INTERNAL_ERROR",
                    "message": "Failed to load inventory change history.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class InventoryFilterOptionsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        request_id = _request_id_from_request(request)
        try:
            rows = build_inventory_rows()
        except (ProgrammingError, OperationalError) as exc:
            logger.exception("INVENTORY_FILTER_OPTIONS_SCHEMA_ERROR code=inventory_filter_options_schema_error request_id=%s", request_id)
            return Response(
                {
                    "code": "INVENTORY_FILTER_OPTIONS_SCHEMA_ERROR",
                    "message": "Inventory filter options query failed due to database schema mismatch.",
                    "request_id": request_id,
                    "details": {
                        "hint": "Apply latest database migrations in services/database_service.",
                        "error": str(exc),
                    },
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("INVENTORY_FILTER_OPTIONS_INTERNAL_ERROR code=inventory_filter_options_internal_error request_id=%s", request_id)
            return Response(
                {
                    "code": "INVENTORY_FILTER_OPTIONS_INTERNAL_ERROR",
                    "message": "Failed to load inventory filter options.",
                    "request_id": request_id,
                    "details": {"error": str(exc)},
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        payload = {
            "places": _inventory_filter_option_values(rows, "place"),
            "available_places": list_available_pool_places(limit=250),
            "sections": _inventory_filter_option_values(rows, "section"),
            "locations": sorted({_inventory_row_text_filter_value(row, "location") for row in rows if _inventory_row_text_filter_value(row, "location")}),
            "quantities": _inventory_filter_quantity_values(rows),
            "rooms": _inventory_filter_option_values(rows, "room"),
            "types": _inventory_filter_option_values(rows, "type"),
            "companies": _inventory_filter_option_values(rows, "company"),
            "colors": _inventory_filter_option_values(rows, "color"),
            "materials": _inventory_filter_option_values(rows, "material"),
        }
        return Response(payload, status=status.HTTP_200_OK)


class KidsBulkUpdateAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def patch(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        updates = payload.get("updates")
        if not isinstance(updates, list) or not updates:
            return Response(
                {"detail": "updates must be a non-empty array."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        kid_ids: set[int] = set()
        normalized_updates: list[dict] = []

        for raw in updates:
            if not isinstance(raw, dict):
                return Response({"detail": "Each update must be an object."}, status=status.HTTP_400_BAD_REQUEST)

            kid_id_raw = raw.get("kid_id")
            try:
                kid_id = int(kid_id_raw)
            except (TypeError, ValueError):
                return Response({"detail": "kid_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

            patch_data: dict = {"kid_id": kid_id}
            if "room" in raw:
                patch_data["room"] = str(raw.get("room") or "").strip()
            if "type" in raw:
                patch_data["furniture_type"] = str(raw.get("type") or "").strip()
            if "color" in raw:
                patch_data["color"] = str(raw.get("color") or "").strip()
            if "company" in raw:
                patch_data["company"] = str(raw.get("company") or "").strip()
            if "size" in raw:
                patch_data["size"] = str(raw.get("size") or "").strip()
            if "material" in raw:
                patch_data["material"] = str(raw.get("material") or "").strip()
            if "currency" in raw:
                patch_data["currency"] = str(raw.get("currency") or "").strip()
            if "price" in raw:
                parsed_price = parse_order_amount(str(raw.get("price") or ""))
                if parsed_price is None:
                    return Response(
                        {"detail": "price must be a numeric value."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                patch_data["price"] = parsed_price
            if "quantity" in raw:
                quantity_raw = str(raw.get("quantity") or "").strip()
                if not quantity_raw:
                    patch_data["quantity"] = None
                else:
                    try:
                        parsed_quantity = int(quantity_raw)
                    except (TypeError, ValueError):
                        return Response(
                            {"detail": "quantity must be an integer."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    if parsed_quantity < 0:
                        return Response(
                            {"detail": "quantity must be greater than or equal to 0."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    patch_data["quantity"] = parsed_quantity
            normalized_updates.append(patch_data)
            kid_ids.add(kid_id)

        kids = {kid.id: kid for kid in Kid.objects.filter(id__in=kid_ids)}
        missing = sorted(kid_id for kid_id in kid_ids if kid_id not in kids)
        if missing:
            return Response(
                {"detail": "Some kid_id were not found.", "missing_kid_ids": missing},
                status=status.HTTP_404_NOT_FOUND,
            )

        updated_count = 0
        inventory_changes: list[tuple[Kid, list[dict]]] = []
        with transaction.atomic():
            for patch_data in normalized_updates:
                kid = kids[patch_data["kid_id"]]
                audit_changes: list[dict] = []
                kid_before = {
                    field: getattr(kid, field)
                    for field in ("room", "furniture_type")
                    if field in patch_data
                }
                update_fields: list[str] = []
                if "room" in patch_data and kid.room != patch_data["room"]:
                    kid.room = patch_data["room"]
                    update_fields.append("room")
                if "furniture_type" in patch_data and kid.furniture_type != patch_data["furniture_type"]:
                    kid.furniture_type = patch_data["furniture_type"]
                    update_fields.append("furniture_type")
                if update_fields:
                    kid.save(update_fields=update_fields)
                    updated_count += 1
                audit_changes.extend(changed_fields(kid_before, {field: getattr(kid, field) for field in kid_before}))

                attrs_updates: dict = {}
                for attr_key in ("quantity", "company", "color", "size", "material", "price", "currency"):
                    if attr_key in patch_data:
                        attrs_updates[attr_key] = patch_data[attr_key]
                if attrs_updates:
                    existing_attrs = ProductAttributes.objects.filter(kid_id=kid.id).first()
                    attrs_before = {
                        f"attributes.{field}": getattr(existing_attrs, field) if existing_attrs is not None else None
                        for field in attrs_updates
                    }
                    attrs_row, _ = ProductAttributes.objects.update_or_create(
                        kid_id=kid.id,
                        defaults=attrs_updates,
                    )
                    attrs_after = {field: getattr(attrs_row, field.removeprefix("attributes.")) for field in attrs_before}
                    audit_changes.extend(changed_fields(attrs_before, attrs_after))

                if audit_changes:
                    inventory_changes.append((kid, audit_changes))

        for kid, changes in inventory_changes:
            record_inventory_change(kid=kid, actor=request_actor(request), action="product_updated", changes=changes)

        return Response({"updated": updated_count}, status=status.HTTP_200_OK)


class MarketplaceKauflandHealthAPIView(APIView):
    permission_classes = [SessionRolePermission]
    kaufland_health_url = "https://kl.automatonsoft.de/api/health/"

    def get(self, request):
        req = urllib.request.Request(
            self.kaufland_health_url,
            method="GET",
            headers={"Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw = resp.read()
                content_type = resp.headers.get("Content-Type", "")
                payload = None
                if "application/json" in content_type.lower():
                    try:
                        payload = json.loads(raw.decode("utf-8"))
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        payload = {"raw": raw.decode("utf-8", errors="replace")}

                return Response(
                    {
                        "marketplace": "kaufland",
                        "endpoint": self.kaufland_health_url,
                        "ok": 200 <= resp.status < 300,
                        "status_code": resp.status,
                        "data": payload,
                    },
                    status=resp.status,
                )
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            return Response(
                {
                    "marketplace": "kaufland",
                    "endpoint": self.kaufland_health_url,
                    "ok": False,
                    "status_code": exc.code,
                    "error": "upstream_http_error",
                    "detail": body[:2000],
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )


class MarketplaceHoodHealthAPIView(APIView):
    permission_classes = [SessionRolePermission]
    hood_health_url = "https://hoodbot.automatonsoft.de/api/items/health"

    def get(self, request):
        req = urllib.request.Request(
            self.hood_health_url,
            method="GET",
            headers={"Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw = resp.read()
                content_type = resp.headers.get("Content-Type", "")
                payload = None
                if "application/json" in content_type.lower():
                    try:
                        payload = json.loads(raw.decode("utf-8"))
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        payload = {"raw": raw.decode("utf-8", errors="replace")}

                return Response(
                    {
                        "marketplace": "hood",
                        "endpoint": self.hood_health_url,
                        "ok": 200 <= resp.status < 300,
                        "status_code": resp.status,
                        "data": payload,
                    },
                    status=resp.status,
                )
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            return Response(
                {
                    "marketplace": "hood",
                    "endpoint": self.hood_health_url,
                    "ok": False,
                    "status_code": exc.code,
                    "error": "upstream_http_error",
                    "detail": body[:2000],
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except (urllib.error.URLError, TimeoutError) as exc:
            return Response(
                {
                    "marketplace": "hood",
                    "endpoint": self.hood_health_url,
                    "ok": False,
                    "status_code": None,
                    "error": "upstream_unreachable",
                    "detail": str(exc),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except (urllib.error.URLError, TimeoutError) as exc:
            return Response(
                {
                    "marketplace": "kaufland",
                    "endpoint": self.kaufland_health_url,
                    "ok": False,
                    "status_code": None,
                    "error": "upstream_unreachable",
                    "detail": str(exc),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )


class EANPoolImportAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        serializer = EANPoolImportSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        raw_eans = list(payload.get("eans") or [])
        text = (payload.get("text") or "").strip()
        if text:
            raw_eans.extend([line.strip() for line in text.splitlines() if line.strip()])

        normalized = []
        seen = set()
        for item in raw_eans:
            ean = str(item or "").strip()
            if not ean:
                continue
            if ean in seen:
                continue
            seen.add(ean)
            normalized.append(ean)

        created = 0
        skipped = 0
        for ean in normalized:
            _, is_created = EANPool.objects.get_or_create(ean=ean, defaults={"status": "free"})
            if is_created:
                created += 1
            else:
                skipped += 1

        return Response(
            {
                "received": len(normalized),
                "created": created,
                "skipped_existing": skipped,
            },
            status=status.HTTP_201_CREATED,
        )


class EANPoolReserveAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @transaction.atomic
    def post(self, request):
        serializer = EANPoolReserveSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        ean = serializer.validated_data["ean"].strip()
        reserved_by = (serializer.validated_data.get("reserved_by") or "").strip()
        actor = reserved_by or str(request.session.get("username") or request.session.get("user") or "system")

        item = EANPool.objects.select_for_update().filter(ean=ean).first()
        if item is None:
            return Response({"detail": "EAN не найден в пуле."}, status=status.HTTP_404_NOT_FOUND)
        if item.status == "used":
            return Response({"detail": "EAN уже использован."}, status=status.HTTP_409_CONFLICT)
        if item.status == "blocked":
            return Response({"detail": "EAN заблокирован."}, status=status.HTTP_409_CONFLICT)

        item.status = "reserved"
        item.reserved_by = actor
        item.reserved_at = timezone.now()
        item.save(update_fields=["status", "reserved_by", "reserved_at", "updated_at"])
        return Response(EANPoolSerializer(item).data, status=status.HTTP_200_OK)


class EANPoolTakeNextFreeAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @transaction.atomic
    def post(self, request):
        serializer = EANPoolTakeNextSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        reserved_by = (serializer.validated_data.get("reserved_by") or "").strip()
        actor = reserved_by or str(request.session.get("username") or request.session.get("user") or "system")

        item = (
            EANPool.objects.select_for_update()
            .filter(status="free")
            .order_by("ean", "id")
            .first()
        )
        if item is None:
            return Response(
                {
                    "code": "ean_pool_empty",
                    "detail": "Свободные EAN в пуле закончились.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        item.status = "reserved"
        item.reserved_by = actor
        item.reserved_at = timezone.now()
        item.save(update_fields=["status", "reserved_by", "reserved_at", "updated_at"])
        return Response(EANPoolSerializer(item).data, status=status.HTTP_200_OK)


class EANPoolClaimForJobAPIView(APIView):
    """Atomically return a stable pool EAN for a job or source product family."""

    permission_classes = [SessionRolePermission]

    @transaction.atomic
    def post(self, request):
        serializer = EANPoolClaimForJobSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        kid_number = str(serializer.validated_data.get("kid_number") or "").strip()
        reservation_family = str(serializer.validated_data.get("reservation_family") or "").strip()
        reservation_key = f"orchestrator-job:{serializer.validated_data['job_id']}"

        ean_row = None
        reserved_field = ""
        if kid_number:
            ean_row = Ean.objects.select_for_update().filter(kid__kid_number__contains=[kid_number]).order_by("id").first()
            if ean_row is None:
                return Response(
                    {
                        "code": "ean_reservation_kid_not_found",
                        "detail": "Локальная запись EAN для указанного Kid не найдена.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            reserved_field = f"reserved_{reservation_family}"
            reserved_ean = str(getattr(ean_row, reserved_field) or "").strip()
            if reserved_ean:
                item = EANPool.objects.select_for_update().filter(ean=reserved_ean).first()
                if item is None:
                    return Response(
                        {
                            "code": "ean_reservation_pool_entry_not_found",
                            "detail": "Сохранённый EAN отсутствует в EAN pool.",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                return Response(EANPoolSerializer(item).data, status=status.HTTP_200_OK)

        item = (
            EANPool.objects.select_for_update()
            .filter(reserved_by=reservation_key, status__in=["reserved", "used"])
            .order_by("id")
            .first()
        )
        if item is None:
            item = (
                EANPool.objects.select_for_update()
                .filter(status="free")
                .order_by("ean", "id")
                .first()
            )
            if item is None:
                return Response(
                    {
                        "code": "ean_pool_empty",
                        "detail": "Свободные EAN в пуле закончились.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            item.status = "reserved"
            item.reserved_by = reservation_key
            item.reserved_at = timezone.now()
            item.save(update_fields=["status", "reserved_by", "reserved_at", "updated_at"])

        if ean_row is not None:
            setattr(ean_row, reserved_field, item.ean)
            ean_row.save(update_fields=[reserved_field])

        return Response(EANPoolSerializer(item).data, status=status.HTTP_200_OK)


class EANPoolMarkJobUsedAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @transaction.atomic
    def post(self, request):
        serializer = EANPoolClaimForJobSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        kid_number = str(serializer.validated_data.get("kid_number") or "").strip()
        reservation_family = str(serializer.validated_data.get("reservation_family") or "").strip()
        if kid_number:
            ean_row = Ean.objects.select_for_update().filter(kid__kid_number__contains=[kid_number]).order_by("id").first()
            reserved_ean = str(getattr(ean_row, f"reserved_{reservation_family}", "") or "").strip() if ean_row else ""
            item = EANPool.objects.select_for_update().filter(ean=reserved_ean).first() if reserved_ean else None
        else:
            reservation_key = f"orchestrator-job:{serializer.validated_data['job_id']}"
            item = EANPool.objects.select_for_update().filter(reserved_by=reservation_key).first()
        if item is None:
            return Response({"detail": "Резерв EAN для задания не найден."}, status=status.HTTP_404_NOT_FOUND)

        if item.status == "reserved":
            item.status = "used"
            item.used_at = timezone.now()
            item.save(update_fields=["status", "used_at", "updated_at"])
        return Response(EANPoolSerializer(item).data, status=status.HTTP_200_OK)


class EANPoolMarkUsedAPIView(APIView):
    permission_classes = [SessionRolePermission]

    @transaction.atomic
    def post(self, request):
        serializer = EANUsageMarkSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        ean_value = payload["ean"].strip()
        site = str(payload["site"] or "").strip().upper()
        site_key = str(payload.get("site_key") or "").strip().upper()
        local_product_id = payload.get("local_product_id")
        source_product_id = payload.get("source_product_id")

        if site not in {"XL", "JV"}:
            return Response({"detail": "site должен быть XL или JV."}, status=status.HTTP_400_BAD_REQUEST)

        pool = EANPool.objects.select_for_update().filter(ean=ean_value).first()
        if pool is None:
            return Response({"detail": "EAN не найден в пуле."}, status=status.HTTP_404_NOT_FOUND)

        usage, _ = EANUsage.objects.update_or_create(
            ean=pool,
            site=site,
            site_key=site_key,
            defaults={
                "local_product_id": local_product_id,
                "source_product_id": source_product_id,
            },
        )

        pool.status = "used"
        if pool.used_at is None:
            pool.used_at = timezone.now()
        pool.save(update_fields=["status", "used_at", "updated_at"])

        return Response(
            {
                "pool": EANPoolSerializer(pool).data,
                "usage": EANUsageSerializer(usage).data,
            },
            status=status.HTTP_200_OK,
        )


class EANPoolUsageByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, ean: str):
        pool = EANPool.objects.filter(ean=ean.strip()).first()
        if pool is None:
            return Response({"detail": "EAN не найден в пуле."}, status=status.HTTP_404_NOT_FOUND)
        usages = EANUsage.objects.filter(ean=pool).order_by("-published_at")
        return Response(
            {
                "pool": EANPoolSerializer(pool).data,
                "usages": EANUsageSerializer(usages, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class EANPoolStatsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        free = EANPool.objects.filter(status="free").count()
        reserved = EANPool.objects.filter(status="reserved").count()
        used = EANPool.objects.filter(status="used").count()
        blocked = EANPool.objects.filter(status="blocked").count()
        total = free + reserved + used + blocked
        return Response(
            {
                "free": free,
                "reserved": reserved,
                "used": used,
                "blocked": blocked,
                "total": total,
            },
            status=status.HTTP_200_OK,
        )


class UploadImagesToFtpAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        uploaded_files = collect_uploaded_files(request, field_names=("images", "files", "image", "photo_files"))
        source_urls = _normalize_remote_source_urls(request.data.get("source_urls") if hasattr(request, "data") else None)
        if not uploaded_files and source_urls:
            try:
                uploaded_files = [
                    _simple_uploaded_file_from_remote_url(source_url, index)
                    for index, source_url in enumerate(source_urls)
                ]
            except requests.RequestException as exc:
                return Response(
                    {"code": "upload_remote_fetch_failed", "detail": f"Failed to download remote source image: {exc}"},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
        if not uploaded_files:
            return Response({"detail": "No image files provided."}, status=status.HTTP_400_BAD_REQUEST)
        site_key = str(request.query_params.get("site_key") or request.data.get("site_key") or "").strip().upper()
        site = str(request.query_params.get("site") or request.data.get("site") or "").strip().upper()
        ean = str(request.query_params.get("ean") or request.data.get("ean") or "").strip()
        artikelnr = str(request.query_params.get("artikelnr") or request.data.get("artikelnr") or "").strip()
        image_role = str(request.query_params.get("image_role") or request.data.get("image_role") or "main").strip().lower()
        additional_only = image_role in {"additional", "extra", "gallery"}
        prefix = f"{site.lower()}_{site_key.lower()}".strip("_") if site_key else (site.lower() or "jv")

        try:
            if site == "JV" and site_key:
                uploaded_paths = []
                uploaded_public_urls = []
                for idx, file_obj in enumerate(uploaded_files):
                    kind = "extra" if additional_only else ("main" if idx == 0 else "extra")
                    payload = upload_jv_product_file_for_site(
                        file_obj,
                        site_key=site_key,
                        ean=ean,
                        extra_index=idx,
                        kind=kind,
                        prefix=prefix or "jv",
                        folder_key=artikelnr,
                    )
                    uploaded_paths.append(str(payload.get("db_path") or "").strip())
                    uploaded_public_urls.extend([str(x) for x in (payload.get("public_urls") or []) if str(x or "").strip()])
                uploaded_urls = uploaded_paths
            elif site == "XL" and site_key:
                uploaded_payloads = [
                    upload_public_file_for_site_payload(file_obj, site_key=site_key, prefix=prefix)
                    for file_obj in uploaded_files
                ]
                uploaded_urls = [str(item.get("db_path") or "").strip() for item in uploaded_payloads if str(item.get("db_path") or "").strip()]
                uploaded_public_urls = [
                    str(item.get("public_url") or "").strip()
                    for item in uploaded_payloads
                    if str(item.get("public_url") or "").strip()
                ]
            elif site_key:
                uploaded_urls = [upload_public_file_for_site(file_obj, site_key=site_key, prefix=prefix) for file_obj in uploaded_files]
            else:
                uploaded_urls = [upload_public_file(file_obj, prefix=prefix or "jv") for file_obj in uploaded_files]
        except FtpUploadConfigError as exc:
            return Response({"code": "upload_ftp_config_error", "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except FtpUploadCorruptedFileError as exc:
            return Response({"code": "upload_corrupted_file", "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:  # noqa: BLE001
            logger.exception("UPLOAD_FTP_FAILED code=upload_ftp_failed")
            return Response(
                {"code": "upload_ftp_failed", "detail": f"FTP upload error: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # JV source DB expects image path (e.g. "images/foo.jpg"), not full public URL.
        if site == "JV":
            if site_key:
                uploaded_paths = uploaded_urls
            else:
                uploaded_paths = []
                for item_url in uploaded_urls:
                    raw_path = urlparse(str(item_url or "")).path.lstrip("/")
                    uploaded_paths.append(raw_path or str(item_url or ""))
            main_public_url = None
            public_list = uploaded_public_urls if site_key else uploaded_urls
            for item in public_list:
                text = str(item or "")
                if "/cosmoshop/default/pix/a/v/" in text:
                    main_public_url = text
                    break
            if main_public_url is None and public_list:
                main_public_url = str(public_list[0])
            return Response(
                {
                    "uploaded_image_urls": uploaded_paths,
                    "uploaded_image_public_urls": uploaded_public_urls if site_key else uploaded_urls,
                    "image": uploaded_paths[0] if uploaded_paths else None,
                    "image_public_url": main_public_url,
                    "image_role": "additional" if additional_only else "main",
                    "additional_image_urls": uploaded_paths if additional_only else uploaded_paths[1:],
                },
                status=status.HTTP_200_OK,
            )

        if site == "XL":
            return Response(
                {
                    "uploaded_image_urls": uploaded_urls,
                    "uploaded_image_public_urls": uploaded_public_urls if site_key else uploaded_urls,
                    "image": uploaded_urls[0] if uploaded_urls else None,
                    "image_public_url": (uploaded_public_urls[0] if site_key and uploaded_public_urls else (uploaded_urls[0] if uploaded_urls else None)),
                    "image_role": "additional" if additional_only else "main",
                    "additional_image_urls": uploaded_urls if additional_only else uploaded_urls[1:],
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "uploaded_image_urls": uploaded_urls,
                "image": uploaded_urls[0] if uploaded_urls else None,
            },
            status=status.HTTP_200_OK,
        )

# class OrderGetIDsAPIView(APIView):

#     def get(self, request, order_id):
#         order = get_object_or_404(Orders, id=order_id)
#         kid = order.kid.kid_number
#         orders_id = order.order_id
#         sku = order.sku
#         title = order.title
#         memo = order.memo
#         status = order.status
#         order_date = order.order_date
#         return Response({"kid": kid, "order_id": orders_id, "sku": sku, "title": title, "memo": memo, "status": status, "order_date": order_date})
