from rest_framework.views import APIView
from rest_framework.response import Response
from .external_requests import change_product_by_ean, create_product_by_ean, delete_product_by_ean, product_inside
from .serializers import (
    KauflandChangeByEANSerializer,
    KauflandCreateByEANSerializer,
    KauflandDeleteByEANSerializer,
)
import requests
import re
import json


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


class GetProductAPIView(APIView):
    def get(self, request, ean=None, site=None):
        ean = ean or request.query_params.get("ean")
        site = site or request.query_params.get("site")

        if not ean or not site:
            return Response({"error": "ean and site are required"}, status=400)

        try:
            data = product_inside(ean, site)
            return Response(data, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=500)


class ChangeProductByEANAPIView(APIView):
    def post(self, request):
        serializer = KauflandChangeByEANSerializer(data=request.data or {}, partial=True)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        # Forward only fields explicitly provided by client.
        allowed_fields = {
            "ean",
            "title",
            "description",
            "picture_urls",
            "unit_id",
            "storefront",
            "price",
            "controller",
        }
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


class CreateProductByEANAPIView(APIView):
    def post(self, request):
        serializer = KauflandCreateByEANSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        # Enforce primitive numeric types before forwarding to external API.
        for int_field in ("price", "delivery", "height", "length", "width"):
            if int_field in payload:
                payload[int_field] = int(payload[int_field])
        # Compatibility for upstream validators:
        # - "picture" should be a list
        # - "pictures" should be a string
        if "picture" in payload:
            picture_value = payload.get("picture")
            if isinstance(picture_value, list):
                pictures_str = ",".join(str(item) for item in picture_value if str(item).strip())
                payload["picture"] = [str(item) for item in picture_value if str(item).strip()]
            else:
                pictures_str = str(picture_value or "")
                payload["picture"] = [pictures_str] if pictures_str else []
            payload["pictures"] = pictures_str
        # Lightweight debug log for outgoing create payload shape.
        print("KAUFLAND_CREATE_OUTGOING:", payload)

        try:
            data = create_product_by_ean(payload)
            print("KAUFLAND_CREATE_RESPONSE:", data)
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
