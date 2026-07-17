from rest_framework.views import APIView
from rest_framework.response import Response
from .external_requests import (
    change_product_by_ean,
    create_product_by_ean,
    delete_product_by_ean,
    product_inside,
    set_product_active_state,
)
from .serializers import (
    KAUFLAND_PRODUCT_WRITE_FIELDS,
    KauflandChangeByEANSerializer,
    KauflandControllerSerializer,
    KauflandCreateByEANSerializer,
    KauflandDeleteByEANSerializer,
)
import requests
import re
import json
from html import unescape


def _compact_external_error(detail: object) -> object:
    if not isinstance(detail, str):
        return detail
    text = detail.strip()
    if "<html" not in text.lower():
        return text

    # Try to extract meaningful short message from Django debug HTML.
    title_match = re.search(r"<title>(.*?)</title>", text, flags=re.IGNORECASE | re.DOTALL)
    value_match = re.search(
        r'<pre class="exception_value">(.*?)</pre>',
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    title = re.sub(r"\s+", " ", title_match.group(1)).strip() if title_match else "External API error"
    value = re.sub(r"\s+", " ", value_match.group(1)).strip() if value_match else ""
    if value:
        return f"{title}: {value}"
    return title


def _json_safe_error(detail: object) -> object:
    """Ensure error payload is always JSON-serializable."""
    compact = _compact_external_error(detail)
    if isinstance(compact, (str, int, float, bool)) or compact is None:
        return compact
    try:
        # Round-trip to drop non-serializable/cyclic references.
        return json.loads(json.dumps(compact, ensure_ascii=False))
    except Exception:
        return str(compact)


def _is_missing_product_lookup_error(*, status_code: int, detail: object) -> bool:
    """Recognize the known upstream missing-product response incorrectly sent as HTTP 500."""
    if status_code != 500:
        return False
    message = unescape(str(detail)).lower()
    return "'nonetype' object has no attribute 'get'" in message


class GetProductAPIView(APIView):
    def get(self, request, ean=None, site=None):
        ean = ean or request.query_params.get("ean")
        site = site or request.query_params.get("site")

        if not ean or not site:
            return Response({"error": "ean and site are required"}, status=400)

        try:
            data = product_inside(ean, site)
            return Response(data, status=200)
        except requests.Timeout:
            return Response(
                {
                    "error": "kaufland_lookup_timeout",
                    "detail": "Kaufland product lookup timed out.",
                },
                status=504,
            )
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else 502
            details = None
            try:
                details = exc.response.json() if exc.response is not None else None
            except Exception:
                details = exc.response.text if exc.response is not None else str(exc)
            details = _json_safe_error(details)
            if _is_missing_product_lookup_error(status_code=status_code, detail=details):
                return Response(
                    {
                        "error": "kaufland_product_not_found",
                        "detail": "Kaufland product was not found for this controller.",
                    },
                    status=404,
                )
            return Response(
                {"error": "kaufland_lookup_failed", "detail": details},
                status=status_code,
            )
        except requests.RequestException as exc:
            return Response(
                {
                    "error": "kaufland_lookup_transport_error",
                    "detail": str(exc),
                },
                status=502,
            )


class ChangeProductByEANAPIView(APIView):
    def post(self, request):
        serializer = KauflandChangeByEANSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        # Forward only fields explicitly provided by client.
        allowed_fields = set(KAUFLAND_PRODUCT_WRITE_FIELDS)
        request_keys = set(request.data.keys()) if hasattr(request.data, "keys") else set()

        raw_changed = request.data.get("changed_fields") if hasattr(request.data, "get") else None
        changed_fields = set()
        if isinstance(raw_changed, list):
            changed_fields = {str(x).strip() for x in raw_changed if str(x).strip()}
        elif isinstance(raw_changed, str):
            changed_fields = {x.strip() for x in raw_changed.split(",") if x.strip()}

        if changed_fields:
            technical_required = {"ean", "controller", "storefront"}
            if "price" in changed_fields:
                technical_required.add("unit_id")
            request_keys = request_keys.intersection(changed_fields.union(technical_required))

        payload = {key: validated[key] for key in request_keys if key in validated and key in allowed_fields}

        # Keep required routing fields in outbound payload.
        payload["ean"] = validated["ean"]
        payload["controller"] = validated["controller"]

        # External Kaufland API expects picture_urls as string, not array.
        if "picture_urls" in payload:
            picture_urls = payload.get("picture_urls")
            if isinstance(picture_urls, str):
                payload["picture_urls"] = [picture_urls] if picture_urls.strip() else []
        try:
            data = change_product_by_ean(payload)
            return Response(data, status=200)
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else 502
            details = None
            try:
                details = exc.response.json() if exc.response is not None else None
            except Exception:
                details = exc.response.text if exc.response is not None else str(exc)
            details = _json_safe_error(details)
            return Response(
                {"error": "kaufland_change_failed", "detail": details},
                status=status_code,
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=500)


class DeleteProductByEANAPIView(APIView):
    def post(self, request):
        serializer = KauflandDeleteByEANSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        ean = serializer.validated_data["ean"]
        controller = serializer.validated_data["controller"]

        try:
            data = delete_product_by_ean(ean=ean, controller=controller)
            return Response(data, status=200)
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else 502
            details = None
            try:
                details = exc.response.json() if exc.response is not None else None
            except Exception:
                details = exc.response.text if exc.response is not None else str(exc)
            details = _json_safe_error(details)
            return Response(
                {"error": "kaufland_delete_failed", "detail": details},
                status=status_code,
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=500)


class KauflandProductActiveStateAPIView(APIView):
    active = True

    def post(self, request, ean):
        serializer = KauflandControllerSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        try:
            data = set_product_active_state(
                ean=ean,
                controller=serializer.validated_data["controller"],
                active=self.active,
            )
            return Response(data, status=200)
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else 502
            try:
                details = exc.response.json() if exc.response is not None else None
            except Exception:
                details = exc.response.text if exc.response is not None else str(exc)
            return Response(
                {
                    "error": "kaufland_activate_failed" if self.active else "kaufland_deactivate_failed",
                    "detail": _json_safe_error(details),
                },
                status=status_code,
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=500)


class ActivateProductByEANAPIView(KauflandProductActiveStateAPIView):
    active = True


class DeactivateProductByEANAPIView(KauflandProductActiveStateAPIView):
    active = False


class CreateProductByEANAPIView(APIView):
    def post(self, request):
        serializer = KauflandCreateByEANSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        for image_field in ("picture", "picture_urls"):
            if not payload.get(image_field):
                payload.pop(image_field, None)
        try:
            data = create_product_by_ean(payload)
            return Response(data, status=200)
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else 502
            details = None
            try:
                details = exc.response.json() if exc.response is not None else None
            except Exception:
                details = exc.response.text if exc.response is not None else str(exc)
            details = _json_safe_error(details)
            return Response(
                {"error": "kaufland_create_failed", "detail": details},
                status=status_code,
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=500)
