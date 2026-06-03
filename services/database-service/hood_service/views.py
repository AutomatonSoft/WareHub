import logging
import os
import json

import requests
from ftplib import all_errors as FTP_ERRORS

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.idempotency import (
    build_request_hash,
    claim_or_replay,
    derive_idem_key,
    finalize_error,
    finalize_success,
)
from database.permissions import SessionRolePermission

from .core import (
    HOOD_API_BASE_URL,
    HOOD_API_TIMEOUT,
    build_patch_urls,
    collect_uploaded_files,
    decode_html_entities,
    ftp_delete_file_by_url,
    ftp_upload_file,
    get_status_meta,
    get_cached_payload_by_ean,
    hood_auth,
    normalize_account,
    normalize_images_payload,
    sanitize_patch_payload,
    set_external_push_status,
    upsert_response_and_items,
)
from .serializers import HoodPatchSerializer

logger = logging.getLogger(__name__)
HOOD_VALIDATE_UPLOADED_IMAGE_URLS = (os.getenv("HOOD_VALIDATE_UPLOADED_IMAGE_URLS", "false") or "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def _normalize_changed_fields(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        chunks = [part.strip() for part in value.split(",")]
        return [item for item in chunks if item]
    if isinstance(value, (list, tuple)):
        normalized = []
        for item in value:
            text = str(item or "").strip()
            if text:
                normalized.append(text)
        return normalized
    return []


def _extract_changed_fields(raw_payload: dict, query_params) -> list[str]:
    # Prefer body key, fallback to query param for easier manual calls.
    body_fields = _normalize_changed_fields(raw_payload.get("changed_fields") or raw_payload.get("changedFields"))
    if body_fields:
        return body_fields
    return _normalize_changed_fields(query_params.get("changed_fields"))


def _is_true_flag(value) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _coerce_json_list_field(value):
    if not isinstance(value, str):
        return value
    raw = value.strip()
    if not raw or not raw.startswith("["):
        return value
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return value
    return parsed if isinstance(parsed, list) else value


def _allowed_patch_fields() -> set[str]:
    return set(HoodPatchSerializer().fields.keys())


def _extract_current_external_item(ean: str, account: str) -> dict | None:
    external_url = f"{HOOD_API_BASE_URL}/api/items/by-ean/{ean}"
    try:
        resp = requests.get(
            external_url,
            params={"account": account},
            headers={"accept": "application/json"},
            auth=hood_auth(),
            timeout=HOOD_API_TIMEOUT,
        )
    except requests.RequestException:
        return None

    if resp.status_code >= 400:
        return None

    try:
        payload = resp.json()
    except ValueError:
        return None

    if not isinstance(payload, dict):
        return None
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        return None
    first = items[0]
    if not isinstance(first, dict):
        return None
    return first


def _auto_diff_patch_fields(patch_body: dict, external_item: dict | None) -> dict:
    if not external_item:
        return patch_body

    result: dict = {}
    for key, incoming_value in patch_body.items():
        # account/ean are routing identifiers, they are set later via setdefault and
        # should not be treated as editable business fields.
        if key in {"account", "ean"}:
            continue

        current_value = external_item.get(key)

        if key == "images":
            incoming_list = normalize_images_payload(incoming_value)
            current_list = normalize_images_payload(current_value)
            if incoming_list != current_list:
                result[key] = incoming_value
            continue

        # Normalize quantity-like comparison (e.g. "1" vs 1)
        if key == "quantity":
            try:
                incoming_q = None if incoming_value is None else int(incoming_value)
            except (TypeError, ValueError):
                incoming_q = incoming_value
            try:
                current_q = None if current_value is None else int(current_value)
            except (TypeError, ValueError):
                current_q = current_value
            if incoming_q != current_q:
                result[key] = incoming_value
            continue

        if incoming_value != current_value:
            result[key] = incoming_value

    return result


def _merge_uploaded_image_urls(patch_body: dict, uploaded_image_urls: list[str], current_external_item: dict | None) -> list[str]:
    images_payload = normalize_images_payload(patch_body.get("images"))
    if not uploaded_image_urls:
        return images_payload

    if "images" not in patch_body and isinstance(current_external_item, dict):
        images_payload = normalize_images_payload(current_external_item.get("images"))

    return list(dict.fromkeys(images_payload + uploaded_image_urls))


def _check_public_image_url(url: str) -> tuple[bool, str]:
    target = (url or "").strip()
    if not target:
        return False, "empty"
    if not (target.startswith("http://") or target.startswith("https://")):
        return False, "invalid_scheme"

    try:
        head_resp = requests.head(
            target,
            allow_redirects=True,
            timeout=HOOD_API_TIMEOUT,
            headers={"accept": "*/*"},
        )
        if head_resp.status_code < 400:
            return True, f"http_{head_resp.status_code}"
        if head_resp.status_code not in (403, 405):
            return False, f"http_{head_resp.status_code}"
    except requests.RequestException as exc:
        return False, f"network_error:{exc}"

    # Some storages block HEAD, so fallback to lightweight GET.
    try:
        get_resp = requests.get(
            target,
            allow_redirects=True,
            timeout=HOOD_API_TIMEOUT,
            stream=True,
            headers={"accept": "*/*"},
        )
        get_resp.close()
        if get_resp.status_code < 400:
            return True, f"http_{get_resp.status_code}"
        return False, f"http_{get_resp.status_code}"
    except requests.RequestException as exc:
        return False, f"network_error:{exc}"


class HoodFetchByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, ean: str):
        account = normalize_account(request.query_params.get("account"))
        if not account:
            return Response(
                {"code": "hood_account_invalid", "detail": "Передайте query-параметр account со значением 'jv' или 'xl'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ean_value = (ean or "").strip()
        if not ean_value:
            return Response(
                {"code": "hood_ean_empty", "detail": "Пустой ean в пути."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        external_url = f"{HOOD_API_BASE_URL}/api/items/by-ean/{ean_value}"
        try:
            external_response = requests.get(
                external_url,
                params={"account": account},
                headers={"accept": "application/json"},
                auth=hood_auth(),
                timeout=HOOD_API_TIMEOUT,
            )
        except requests.RequestException as exc:
            return Response(
                {"code": "hood_external_network_failed", "detail": f"Hood external API network error: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if external_response.status_code >= 400:
            if external_response.status_code == 404:
                cached_payload = get_cached_payload_by_ean(account=account, ean=ean_value)
                cached_items = (
                    cached_payload.get("items")
                    if isinstance(cached_payload, dict) and isinstance(cached_payload.get("items"), list)
                    else []
                )
                if cached_items:
                    items_preview = []
                    for raw_item in cached_items:
                        if not isinstance(raw_item, dict):
                            continue
                        raw_images = raw_item.get("images") if isinstance(raw_item.get("images"), list) else []
                        images = [str(image).strip() for image in raw_images if str(image).strip()]
                        first_image = ""
                        for image in images:
                            if image:
                                first_image = image
                                break
                        items_preview.append(
                            {
                                "ean": ean_value,
                                "item_id": str(raw_item.get("itemID") or "").strip(),
                                "title": str(raw_item.get("title") or "").strip(),
                                "description": decode_html_entities(str(raw_item.get("description") or "")),
                                "image": first_image,
                                "images": images,
                            }
                        )

                    return Response(
                        {
                            "account": account,
                            "ean": ean_value,
                            "db": {"source": "local_cache", "items_count": len(items_preview)},
                            "status_meta": get_status_meta(account=account, ean=ean_value),
                            "external_status": "cached",
                            "external_success": True,
                            "items": items_preview,
                            "external_payload": cached_payload,
                            "detail": "Loaded from local Hood cache because external returned 404.",
                        },
                        status=status.HTTP_200_OK,
                    )

            detail = "Hood external API returned error status."
            if external_response.status_code == 401:
                detail = (
                    "Hood external API returned 401 Unauthorized. "
                    "Check HOOD_LOGIN and HOOD_PASSWORD in service environment."
                )
            return Response(
                {
                    "code": "hood_external_error_status",
                    "detail": detail,
                    "status_code": external_response.status_code,
                    "body": external_response.text[:1500],
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        try:
            payload = external_response.json()
        except ValueError:
            return Response(
                {"code": "hood_external_non_json", "detail": "Hood external API returned non-JSON response."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if not isinstance(payload, dict):
            return Response(
                {"code": "hood_external_json_shape_invalid", "detail": "Hood external API returned invalid JSON shape (expected object)."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        with transaction.atomic():
            db_result = upsert_response_and_items(
                payload,
                account=account,
                ean=ean_value,
            )

        items_payload = payload.get("items")
        if not isinstance(items_payload, list):
            items_payload = []

        items_preview = []
        for raw_item in items_payload:
            if not isinstance(raw_item, dict):
                continue
            raw_images = raw_item.get("images") if isinstance(raw_item.get("images"), list) else []
            images = [str(image).strip() for image in raw_images if str(image).strip()]
            first_image = ""
            for image in images:
                if image:
                    first_image = image
                    break
            items_preview.append(
                {
                    "ean": ean_value,
                    "item_id": str(raw_item.get("itemID") or "").strip(),
                    "title": str(raw_item.get("title") or "").strip(),
                    "description": decode_html_entities(str(raw_item.get("description") or "")),
                    "image": first_image,
                    "images": images,
                }
            )

        return Response(
            {
                "account": account,
                "ean": ean_value,
                "db": db_result,
                "status_meta": get_status_meta(account=account, ean=ean_value),
                "external_status": payload.get("status"),
                "external_success": payload.get("success"),
                "items": items_preview,
                "external_payload": payload,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, ean: str):
        account = normalize_account(request.query_params.get("account"))
        if not account:
            return Response(
                {"code": "hood_account_invalid", "detail": "Передайте query-параметр account со значением 'jv' или 'xl'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ean_value = (ean or "").strip()
        if not ean_value:
            return Response(
                {"code": "hood_ean_empty", "detail": "Пустой ean в пути."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request_hash = build_request_hash(
            method=request.method,
            path=request.path,
            query=dict(request.query_params),
            body=request.data if isinstance(request.data, dict) else str(request.data),
        )
        idem_key = derive_idem_key(request, request_hash)
        idem_state, idem_record = claim_or_replay(
            scope="hood.patch_by_ean.v2",
            idem_key=idem_key,
            request_hash=request_hash,
        )
        if idem_state == "replay":
            return Response(idem_record.response_payload, status=idem_record.status_code or status.HTTP_200_OK)
        if idem_state == "processing":
            return Response(
                {"code": "hood_idempotency_in_progress", "detail": "Request with same idempotency key is in progress."},
                status=status.HTTP_409_CONFLICT,
            )
        if idem_state == "conflict":
            return Response(
                {"code": "hood_idempotency_key_conflict", "detail": "Idempotency key reused with different payload."},
                status=status.HTTP_409_CONFLICT,
            )

        if request.data is None:
            patch_body: dict = {}
        elif isinstance(request.data, dict):
            patch_body = dict(request.data)
        elif hasattr(request.data, "dict"):
            patch_body = request.data.dict()
        else:
            payload = {"code": "hood_patch_body_invalid", "detail": "PATCH body должен быть JSON-объектом или form-data."}
            finalize_error(idem_record, status_code=status.HTTP_400_BAD_REQUEST, payload=payload, error_code=payload["code"])
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)
        upload_only = _is_true_flag(request.query_params.get("upload_only")) or _is_true_flag(
            patch_body.get("upload_only")
        )
        changed_fields = _extract_changed_fields(patch_body, request.query_params)
        patch_body.pop("changed_fields", None)
        patch_body.pop("changedFields", None)
        patch_body.pop("upload_only", None)
        patch_body = sanitize_patch_payload(patch_body)
        allowed_fields = _allowed_patch_fields()

        # Be tolerant to noisy frontend payloads: keep only fields known by serializer.
        if changed_fields:
            unknown_fields = sorted({name for name in changed_fields if name not in allowed_fields})
            if unknown_fields:
                payload = {
                    "code": "hood_patch_changed_fields_invalid",
                    "detail": "changed_fields contains unknown field names.",
                    "unknown_fields": unknown_fields,
                    "allowed_fields": sorted(allowed_fields),
                }
                finalize_error(
                    idem_record,
                    status_code=status.HTTP_400_BAD_REQUEST,
                    payload=payload,
                    error_code=payload["code"],
                )
                return Response(payload, status=status.HTTP_400_BAD_REQUEST)

            changed_set = set(changed_fields)
            patch_body = {
                key: value
                for key, value in patch_body.items()
                if key in allowed_fields and key in changed_set
            }
        else:
            patch_body = {key: value for key, value in patch_body.items() if key in allowed_fields}

        # Normalize common frontend shapes to avoid schema failures.
        if "account" in patch_body:
            normalized_account = normalize_account(patch_body.get("account"))
            if normalized_account:
                patch_body["account"] = normalized_account
            else:
                # Use query account when body account is invalid/noisy (e.g. "JV").
                patch_body.pop("account", None)

        if "ean" in patch_body:
            ean_from_body = str(patch_body.get("ean") or "").strip()
            if ean_from_body:
                patch_body["ean"] = ean_from_body
            else:
                patch_body.pop("ean", None)

        # Frontend often sends numeric price; external Hood API expects textual value.
        if "price" in patch_body and patch_body["price"] is not None and not isinstance(patch_body["price"], str):
            patch_body["price"] = str(patch_body["price"])

        # Accept quantity from form-data as string when possible.
        if "quantity" in patch_body and patch_body["quantity"] not in (None, "") and not isinstance(patch_body["quantity"], int):
            try:
                patch_body["quantity"] = int(patch_body["quantity"])
            except (TypeError, ValueError):
                pass
        if "images" in patch_body:
            patch_body["images"] = _coerce_json_list_field(patch_body.get("images"))
        if "productProperties" in patch_body:
            patch_body["productProperties"] = _coerce_json_list_field(patch_body.get("productProperties"))

        schema_serializer = HoodPatchSerializer(data=patch_body, partial=True)
        if not schema_serializer.is_valid():
            payload = {
                "code": "hood_patch_schema_invalid",
                "detail": "PATCH body validation failed.",
                "errors": schema_serializer.errors,
            }
            finalize_error(idem_record, status_code=status.HTTP_400_BAD_REQUEST, payload=payload, error_code=payload["code"])
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)
        patch_body = schema_serializer.validated_data

        current_external_item = None
        uploaded_files = collect_uploaded_files(request)
        uploaded_image_urls: list[str] = []
        if uploaded_files:
            try:
                uploaded_image_urls = [
                    ftp_upload_file(file_obj, ean=ean_value, account=account)
                    for file_obj in uploaded_files
                ]
            except RuntimeError as exc:
                payload = {"code": "hood_ftp_config_error", "detail": str(exc)}
                finalize_error(idem_record, status_code=status.HTTP_400_BAD_REQUEST, payload=payload, error_code=payload["code"])
                return Response(payload, status=status.HTTP_400_BAD_REQUEST)
            except FTP_ERRORS as exc:
                payload = {"code": "hood_ftp_upload_failed", "detail": f"FTP upload error: {exc}"}
                finalize_error(idem_record, status_code=status.HTTP_502_BAD_GATEWAY, payload=payload, error_code=payload["code"])
                return Response(payload, status=status.HTTP_502_BAD_GATEWAY)

        if uploaded_image_urls:
            if "images" not in patch_body:
                current_external_item = _extract_current_external_item(ean=ean_value, account=account)
            patch_body["images"] = _merge_uploaded_image_urls(
                patch_body=patch_body,
                uploaded_image_urls=uploaded_image_urls,
                current_external_item=current_external_item,
            )

        # Validate newly uploaded/internal media links before sending PATCH to Hood.
        # This prevents external failures when the public URL mapping is broken.
        # Validate only freshly uploaded URLs in this request.
        # Existing/broken legacy image URLs should not block unrelated updates.
        media_candidates = list(uploaded_image_urls)
        if HOOD_VALIDATE_UPLOADED_IMAGE_URLS and media_candidates:
            invalid_images = []
            for image_url in media_candidates:
                ok, reason = _check_public_image_url(image_url)
                if not ok:
                    invalid_images.append({"url": image_url, "reason": reason})

            if invalid_images:
                payload = {
                    "code": "hood_image_url_unreachable",
                    "detail": "One or more image URLs are not publicly reachable.",
                    "invalid_images": invalid_images,
                }
                finalize_error(
                    idem_record,
                    status_code=status.HTTP_400_BAD_REQUEST,
                    payload=payload,
                    error_code=payload["code"],
                )
                return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        if upload_only:
            response_payload = {
                "account": account,
                "ean": ean_value,
                "uploaded_image_urls": uploaded_image_urls,
                "detail": "Images uploaded to HOOD FTP only. External Hood item was not updated.",
                "external_payload": None,
            }
            finalize_success(idem_record, status_code=status.HTTP_200_OK, payload=response_payload)
            return Response(response_payload, status=status.HTTP_200_OK)

        if not patch_body and not uploaded_image_urls:
            response_payload = {
                "account": account,
                "ean": ean_value,
                "detail": "No changed fields supplied; nothing was updated.",
                "external_payload": None,
            }
            finalize_success(idem_record, status_code=status.HTTP_200_OK, payload=response_payload)
            return Response(response_payload, status=status.HTTP_200_OK)

        if "description" not in patch_body:
            # External Hood API may treat omitted fields as replaceable in some flows.
            # Preserve current description explicitly when user edits other fields only.
            if current_external_item is None:
                current_external_item = _extract_current_external_item(ean=ean_value, account=account)
            if isinstance(current_external_item, dict):
                current_description = current_external_item.get("description")
                if current_description not in (None, ""):
                    patch_body["description"] = current_description

        # If frontend sends full payload, auto-detect real edits vs current external item
        # and send only changed fields to Hood.
        if not changed_fields:
            if current_external_item is None:
                current_external_item = _extract_current_external_item(ean=ean_value, account=account)
            patch_body = _auto_diff_patch_fields(patch_body=patch_body, external_item=current_external_item)

            if not patch_body and not uploaded_image_urls:
                response_payload = {
                    "account": account,
                    "ean": ean_value,
                    "detail": "No actual differences detected; nothing was updated.",
                    "external_payload": None,
                }
                finalize_success(idem_record, status_code=status.HTTP_200_OK, payload=response_payload)
                return Response(response_payload, status=status.HTTP_200_OK)

        patch_body.setdefault("ean", ean_value)
        patch_body.setdefault("account", account)

        logger.info(
            "HOOD_PATCH_OUTBOUND ean=%s account=%s changed_fields=%s payload=%s",
            ean_value,
            account,
            changed_fields,
            json.dumps(patch_body, ensure_ascii=False, default=str)[:4000],
        )

        external_response = None
        last_error = None
        for candidate_url in build_patch_urls(ean_value):
            try:
                resp = requests.patch(
                    candidate_url,
                    params={"account": account},
                    json=patch_body,
                    headers={"accept": "application/json"},
                    auth=hood_auth(),
                    timeout=HOOD_API_TIMEOUT,
                )
            except TypeError as exc:
                payload = {"code": "hood_patch_json_not_serializable", "detail": f"PATCH body is not JSON serializable: {exc}"}
                finalize_error(idem_record, status_code=status.HTTP_400_BAD_REQUEST, payload=payload, error_code=payload["code"])
                return Response(payload, status=status.HTTP_400_BAD_REQUEST)
            except requests.RequestException as exc:
                logger.warning(
                    "HOOD_PATCH_NETWORK_RETRY code=hood_patch_network_retry url=%s error=%s",
                    candidate_url,
                    str(exc),
                )
                last_error = str(exc)
                continue

            if resp.status_code in (404, 405):
                external_response = resp
                continue

            external_response = resp
            break

        if external_response is None:
            set_external_push_status(account=account, ean=ean_value, pushed=False, error=last_error or "unknown error")
            payload = {"code": "hood_external_network_failed", "detail": f"Hood external API network error: {last_error or 'unknown error'}"}
            finalize_error(idem_record, status_code=status.HTTP_502_BAD_GATEWAY, payload=payload, error_code=payload["code"])
            return Response(payload, status=status.HTTP_502_BAD_GATEWAY)

        if external_response.status_code >= 400:
            logger.warning(
                "HOOD_PATCH_DOWNSTREAM_ERROR ean=%s account=%s status=%s body=%s",
                ean_value,
                account,
                external_response.status_code,
                external_response.text[:1500],
            )
            set_external_push_status(
                account=account,
                ean=ean_value,
                pushed=False,
                error=external_response.text[:500],
            )
            payload = {
                "code": "hood_external_patch_failed",
                "detail": "Hood external API returned error status on PATCH.",
                "status_code": external_response.status_code,
                "body": external_response.text[:1500],
            }
            finalize_error(idem_record, status_code=status.HTTP_502_BAD_GATEWAY, payload=payload, error_code=payload["code"])
            return Response(payload, status=status.HTTP_502_BAD_GATEWAY)

        try:
            payload = external_response.json()
        except ValueError:
            logger.info(
                "HOOD_PATCH_DOWNSTREAM_NON_JSON ean=%s account=%s status=%s body=%s",
                ean_value,
                account,
                external_response.status_code,
                external_response.text[:1500],
            )
            set_external_push_status(account=account, ean=ean_value, pushed=True)
            response_payload = {
                "account": account,
                "ean": ean_value,
                "external_status_code": external_response.status_code,
                "detail": "PATCH sent successfully, external API did not return JSON.",
            }
            finalize_success(idem_record, status_code=status.HTTP_200_OK, payload=response_payload)
            return Response(response_payload, status=status.HTTP_200_OK)

        first_item = payload.get("items")[0] if isinstance(payload, dict) and isinstance(payload.get("items"), list) and payload.get("items") else None
        logger.info(
            "HOOD_PATCH_DOWNSTREAM_OK ean=%s account=%s status=%s returned_product_properties=%s returned_images=%s",
            ean_value,
            account,
            external_response.status_code,
            json.dumps(first_item.get("productProperties"), ensure_ascii=False, default=str)[:4000] if isinstance(first_item, dict) else "null",
            json.dumps(first_item.get("images"), ensure_ascii=False, default=str)[:2000] if isinstance(first_item, dict) else "null",
        )

        db_result = None
        if isinstance(payload, dict) and isinstance(payload.get("items"), list):
            with transaction.atomic():
                db_result = upsert_response_and_items(
                    payload,
                    account=account,
                    ean=ean_value,
                )
        set_external_push_status(account=account, ean=ean_value, pushed=True)

        response_payload = {
            "account": account,
            "ean": ean_value,
            "uploaded_image_urls": uploaded_image_urls,
            "db": db_result,
            "status_meta": get_status_meta(account=account, ean=ean_value),
            "external_status": payload.get("status") if isinstance(payload, dict) else None,
            "external_success": payload.get("success") if isinstance(payload, dict) else None,
            "external_payload": payload,
        }
        finalize_success(idem_record, status_code=status.HTTP_200_OK, payload=response_payload)
        return Response(response_payload, status=status.HTTP_200_OK)

    def delete(self, request, ean: str):
        account = normalize_account(request.query_params.get("account"))
        if not account:
            return Response(
                {"code": "hood_account_invalid", "detail": "Передайте query-параметр account со значением 'jv' или 'xl'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ean_value = (ean or "").strip()
        if not ean_value:
            return Response(
                {"code": "hood_ean_empty", "detail": "Пустой ean в пути."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload_url = ""
        if request.data is not None and isinstance(request.data, dict):
            payload_url = str(request.data.get("url") or request.data.get("image_url") or "").strip()

        file_url = payload_url or str(request.query_params.get("url") or "").strip()
        if not file_url:
            return Response(
                {"code": "hood_delete_url_missing", "detail": "Передайте URL файла в body.url (или query url)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            deleted_filename = ftp_delete_file_by_url(file_url)
        except RuntimeError as exc:
            return Response({"code": "hood_ftp_delete_invalid", "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except FTP_ERRORS as exc:
            return Response(
                {"code": "hood_ftp_delete_failed", "detail": f"FTP delete error: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "account": account,
                "ean": ean_value,
                "deleted_url": file_url,
                "deleted_filename": deleted_filename,
            },
            status=status.HTTP_200_OK,
        )
