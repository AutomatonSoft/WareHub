import html
import json
import os
import posixpath
import logging
import unicodedata
from datetime import datetime
from ftplib import FTP, FTP_TLS, all_errors as FTP_ERRORS
from pathlib import Path
from urllib.parse import urlparse, urlunparse
from uuid import uuid4

from .models import HoodApiResponseJV, HoodApiResponseXL, HoodItemJV, HoodItemXL

logger = logging.getLogger(__name__)


HOOD_API_BASE_URL = os.getenv("HOOD_API_BASE_URL", "https://hoodbot.automatonsoft.de").rstrip("/")
HOOD_API_CONNECT_TIMEOUT = int(os.getenv("HOOD_API_CONNECT_TIMEOUT", "8"))
HOOD_API_READ_TIMEOUT = int(os.getenv("HOOD_API_READ_TIMEOUT", "30"))
HOOD_API_TIMEOUT = (HOOD_API_CONNECT_TIMEOUT, HOOD_API_READ_TIMEOUT)
HOOD_API_PATCH_ENDPOINT = os.getenv("HOOD_API_PATCH_ENDPOINT", "/api/items/by-ean")
HOOD_LOGIN = os.getenv("HOOD_LOGIN", "").strip()
HOOD_PASSWORD = os.getenv("HOOD_PASSWORD", "").strip()
HOOD_FTP_HOST = os.getenv("HOOD_FTP_HOST", "").strip()
HOOD_FTP_PORT = int(os.getenv("HOOD_FTP_PORT", "21"))
HOOD_FTP_USER = os.getenv("HOOD_FTP_USER", "").strip()
HOOD_FTP_PASSWORD = os.getenv("HOOD_FTP_PASSWORD", "").strip()
HOOD_FTP_BASE_DIR = os.getenv("HOOD_FTP_BASE_DIR", "").strip().strip("/")
HOOD_FTP_PUBLIC_BASE_URL = os.getenv("HOOD_FTP_PUBLIC_BASE_URL", "").strip().rstrip("/")
HOOD_FTP_USE_TLS = os.getenv("HOOD_FTP_USE_TLS", "false").strip().lower() in {"1", "true", "yes", "on"}
HOOD_FTP_PASSIVE = os.getenv("HOOD_FTP_PASSIVE", "true").strip().lower() in {"1", "true", "yes", "on"}
HOOD_FTP_CONNECT_TIMEOUT = int(os.getenv("HOOD_FTP_CONNECT_TIMEOUT", "15"))


def normalize_account(value: str | None) -> str:
    account = (value or "").strip().lower()
    if account in {"jv", "xl"}:
        return account
    return ""


def resolve_models(account: str):
    if account == "xl":
        return HoodApiResponseXL, HoodItemXL
    return HoodApiResponseJV, HoodItemJV


def to_int(value):
    try:
        if value in (None, ""):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def build_patch_urls(ean: str) -> list[str]:
    endpoint = (HOOD_API_PATCH_ENDPOINT or "/api/items/by-ean").strip()
    if not endpoint.startswith("/"):
        endpoint = f"/{endpoint}"

    candidates: list[str] = []

    def _add(url: str):
        normalized = url.strip()
        if normalized and normalized not in candidates:
            candidates.append(normalized)

    if "{ean}" in endpoint:
        with_ean = f"{HOOD_API_BASE_URL}{endpoint.format(ean=ean)}"
        _add(with_ean)
        _add(with_ean.rstrip("/"))
        _add(f"{with_ean.rstrip('/')}/")
        return candidates

    with_ean = f"{HOOD_API_BASE_URL}{endpoint.rstrip('/')}/{ean}"
    without_ean = f"{HOOD_API_BASE_URL}{endpoint}"

    _add(with_ean)
    _add(with_ean.rstrip("/"))
    _add(f"{with_ean.rstrip('/')}/")

    _add(without_ean)
    _add(without_ean.rstrip("/"))
    _add(f"{without_ean.rstrip('/')}/")

    return candidates


def hood_auth():
    if HOOD_LOGIN and HOOD_PASSWORD:
        return (HOOD_LOGIN, HOOD_PASSWORD)
    return None


def normalize_images_payload(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, tuple):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text.startswith("[") and text.endswith("]"):
            try:
                decoded = json.loads(text)
            except ValueError:
                decoded = None
            if isinstance(decoded, list):
                return [str(v).strip() for v in decoded if str(v).strip()]
        return [text]
    return [str(value).strip()] if str(value).strip() else []


def decode_html_entities(value: str) -> str:
    if not value:
        return ""

    current = value
    for _ in range(10):
        decoded = html.unescape(current)
        if decoded == current:
            break
        current = decoded
    return current


def normalize_description_html(value) -> str:
    if value is None:
        return ""

    text = str(value)
    text = decode_html_entities(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Strip BOM / zero-width joiners that often break rendering in remote editors.
    text = (
        text.replace("\ufeff", "")
        .replace("\u200b", "")
        .replace("\u200c", "")
        .replace("\u200d", "")
        .replace("\u2060", "")
    )

    # Keep HTML intact but normalize unicode composition and drop hard control chars.
    text = unicodedata.normalize("NFC", text)
    text = "".join(ch for ch in text if ch in ("\n", "\t") or ord(ch) >= 32)
    return text.strip()


def collect_uploaded_files(request) -> list:
    if not hasattr(request, "FILES") or request.FILES is None:
        return []
    files = []
    if hasattr(request.FILES, "getlist"):
        for key in request.FILES.keys():
            files.extend(request.FILES.getlist(key))
    else:
        files.extend(request.FILES.values())
    return files


def _is_file_like(value) -> bool:
    return hasattr(value, "read") and hasattr(value, "name")


def sanitize_patch_payload(data: dict) -> dict:
    cleaned: dict = {}
    list_like_keys = {"images", "productProperties"}
    for key, value in data.items():
        if str(key).lower().endswith("_files"):
            continue

        if _is_file_like(value):
            continue

        if isinstance(value, (list, tuple)):
            filtered = [item for item in value if not _is_file_like(item)]
            if len(filtered) == 0:
                continue
            if str(key) in list_like_keys:
                cleaned[key] = filtered
                continue
            if len(filtered) == 1:
                cleaned[key] = filtered[0]
            else:
                cleaned[key] = filtered
            continue

        if str(key) == "description":
            cleaned[key] = normalize_description_html(value)
            continue

        cleaned[key] = value

    return cleaned


def _safe_ext(filename: str) -> str:
    ext = Path(filename or "").suffix.strip().lower()
    if not ext:
        return ".jpg"
    if len(ext) > 10:
        return ".jpg"
    return ext


def _generate_ftp_filename(*, ean: str, account: str, original_name: str) -> str:
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    return f"hood_{account}_{ean}_{ts}_{uuid4().hex[:10]}{_safe_ext(original_name)}"


def _ensure_ftp_config() -> tuple[str, int, str, str, str, str]:
    if not HOOD_FTP_HOST:
        raise RuntimeError("FTP config error: HOOD_FTP_HOST is empty.")
    if not HOOD_FTP_USER:
        raise RuntimeError("FTP config error: HOOD_FTP_USER is empty.")
    if not HOOD_FTP_PASSWORD:
        raise RuntimeError("FTP config error: HOOD_FTP_PASSWORD is empty.")
    if not HOOD_FTP_PUBLIC_BASE_URL:
        raise RuntimeError("FTP config error: HOOD_FTP_PUBLIC_BASE_URL is empty.")
    return (
        HOOD_FTP_HOST,
        HOOD_FTP_PORT,
        HOOD_FTP_USER,
        HOOD_FTP_PASSWORD,
        HOOD_FTP_BASE_DIR,
        HOOD_FTP_PUBLIC_BASE_URL,
    )


def _build_public_url(public_base: str, remote_parts: list[str], filename: str) -> str:
    parsed = urlparse((public_base or "").strip())
    base_parts = [p for p in (parsed.path or "").split("/") if p]
    remote_parts = [p for p in remote_parts if p]

    # FTP roots sometimes include a directory equal to domain name
    # (e.g. "mediawarehub.veloxdesk.com"). Do not leak it into public URL path.
    host_part = (parsed.netloc or "").strip().lower()
    if host_part and remote_parts and remote_parts[0].lower() == host_part:
        remote_parts = remote_parts[1:]

    # Avoid duplicated path when public base already contains part/all of FTP base dir.
    overlap = 0
    max_overlap = min(len(base_parts), len(remote_parts))
    for i in range(max_overlap, 0, -1):
        if base_parts[-i:] == remote_parts[:i]:
            overlap = i
            break

    final_parts = base_parts + remote_parts[overlap:] + [filename]
    final_path = "/" + "/".join(final_parts)
    return urlunparse((parsed.scheme, parsed.netloc, final_path, "", "", ""))


def _dir_exists(ftp: FTP | FTP_TLS, parts: list[str]) -> bool:
    if not parts:
        return True
    try:
        original = ftp.pwd()
    except FTP_ERRORS:
        original = "/"
    try:
        for part in parts:
            ftp.cwd(part)
        return True
    except FTP_ERRORS:
        return False
    finally:
        try:
            ftp.cwd(original)
        except FTP_ERRORS:
            pass


def _resolve_remote_parts_for_host(base_dir: str, public_base: str, ftp: FTP | FTP_TLS) -> list[str]:
    remote_parts = [p for p in (base_dir or "").split("/") if p]
    host_part = (urlparse((public_base or "").strip()).netloc or "").strip()
    if not host_part or not remote_parts:
        return remote_parts
    if remote_parts[0].lower() == host_part.lower():
        return remote_parts

    prefixed = [host_part] + remote_parts
    if _dir_exists(ftp, prefixed):
        return prefixed
    return remote_parts


def ftp_upload_file(uploaded_file, *, ean: str, account: str) -> str:
    host, port, user, password, base_dir, public_base = _ensure_ftp_config()
    filename = _generate_ftp_filename(
        ean=ean,
        account=account,
        original_name=getattr(uploaded_file, "name", ""),
    )

    ftp_class = FTP_TLS if HOOD_FTP_USE_TLS else FTP
    ftp = ftp_class()
    remote_parts = [p for p in base_dir.split("/") if p]

    try:
        ftp.connect(host=host, port=port, timeout=HOOD_FTP_CONNECT_TIMEOUT)
        ftp.login(user=user, passwd=password)
        ftp.set_pasv(HOOD_FTP_PASSIVE)

        if isinstance(ftp, FTP_TLS):
            ftp.prot_p()

        try:
            ftp.cwd("/")
        except FTP_ERRORS:
            logger.debug("HOOD_FTP_CWD_ROOT_SKIPPED code=hood_ftp_cwd_root_skipped")

        remote_parts = _resolve_remote_parts_for_host(base_dir, public_base, ftp)

        for part in remote_parts:
            try:
                ftp.cwd(part)
            except FTP_ERRORS:
                ftp.mkd(part)
                ftp.cwd(part)

        if hasattr(uploaded_file, "seek"):
            uploaded_file.seek(0)
        ftp.storbinary(f"STOR {filename}", uploaded_file)
    finally:
        try:
            ftp.quit()
        except FTP_ERRORS:
            try:
                ftp.close()
            except FTP_ERRORS:
                logger.debug("HOOD_FTP_CLOSE_SKIPPED code=hood_ftp_close_skipped")

    public_url = _build_public_url(public_base, remote_parts, filename)
    return public_url


def ftp_delete_file_by_url(public_url: str) -> str:
    host, port, user, password, base_dir, public_base = _ensure_ftp_config()
    normalized_public_url = (public_url or "").strip()
    parsed = urlparse(normalized_public_url)
    normalized_base = public_base.rstrip("/")
    if normalized_base and not normalized_public_url.startswith(normalized_base):
        raise RuntimeError(
            "FTP delete error: URL is outside of HOOD_FTP_PUBLIC_BASE_URL."
        )
    filename = posixpath.basename(parsed.path or "")
    if not filename:
        raise RuntimeError("FTP delete error: invalid file URL.")

    if filename in {".", ".."}:
        raise RuntimeError("FTP delete error: invalid file name.")

    ftp_class = FTP_TLS if HOOD_FTP_USE_TLS else FTP
    ftp = ftp_class()
    remote_parts = [p for p in base_dir.split("/") if p]

    try:
        ftp.connect(host=host, port=port, timeout=HOOD_FTP_CONNECT_TIMEOUT)
        ftp.login(user=user, passwd=password)
        ftp.set_pasv(HOOD_FTP_PASSIVE)

        if isinstance(ftp, FTP_TLS):
            ftp.prot_p()

        try:
            ftp.cwd("/")
        except FTP_ERRORS:
            logger.debug("HOOD_FTP_CWD_ROOT_SKIPPED code=hood_ftp_cwd_root_skipped")

        remote_parts = _resolve_remote_parts_for_host(base_dir, public_base, ftp)

        for part in remote_parts:
            ftp.cwd(part)

        ftp.delete(filename)
    finally:
        try:
            ftp.quit()
        except FTP_ERRORS:
            try:
                ftp.close()
            except FTP_ERRORS:
                logger.debug("HOOD_FTP_CLOSE_SKIPPED code=hood_ftp_close_skipped")

    return filename


def upsert_response_and_items(payload: dict, *, account: str, ean: str) -> dict:
    ResponseModel, ItemModel = resolve_models(account)
    payload_account = str(payload.get("account") or account).strip().lower() or account
    payload_ean = str(payload.get("ean") or ean).strip() or ean

    response_obj = (
        ResponseModel.objects.filter(account=payload_account, ean=payload_ean)
        .order_by("-id")
        .first()
    )
    response_created = False

    response_fields = {
        "status": str(payload.get("status") or ""),
        "message": str(payload.get("message") or ""),
        "errors": payload.get("errors") if isinstance(payload.get("errors"), list) else [],
        "success": bool(payload.get("success")),
        "account": payload_account,
        "ean": payload_ean,
        "source_file_ignored": (
            None if payload.get("source_file_ignored") is None else str(payload.get("source_file_ignored"))
        ),
        "local_save_status": ResponseModel.LocalSaveStatus.SAVED,
        "raw_payload": payload,
    }

    if response_obj is None:
        response_obj = ResponseModel.objects.create(**response_fields)
        response_created = True
    else:
        for field, value in response_fields.items():
            setattr(response_obj, field, value)
        response_obj.save(
            update_fields=[
                "status",
                "message",
                "errors",
                "success",
                "account",
                "ean",
                "source_file_ignored",
                "local_save_status",
                "raw_payload",
                "updated_at",
            ]
        )

    items = payload.get("items")
    if not isinstance(items, list):
        items = []

    created_items = 0
    updated_items = 0
    skipped_items = 0
    seen_item_ids: set[str] = set()

    for raw_item in items:
        if not isinstance(raw_item, dict):
            skipped_items += 1
            continue

        item_id = str(raw_item.get("itemID") or "").strip()
        if not item_id:
            skipped_items += 1
            continue

        seen_item_ids.add(item_id)
        item_defaults = {
            "description": normalize_description_html(raw_item.get("description")),
            "price": None if raw_item.get("price") in (None, "") else str(raw_item.get("price")),
            "quantity": to_int(raw_item.get("quantity")),
            "category_id": None
            if raw_item.get("categoryID") in (None, "")
            else str(raw_item.get("categoryID")),
            "condition": None if raw_item.get("condition") in (None, "") else str(raw_item.get("condition")),
            "item_mode": None if raw_item.get("itemMode") in (None, "") else str(raw_item.get("itemMode")),
            "item_number": None
            if raw_item.get("itemNumber") in (None, "")
            else str(raw_item.get("itemNumber")),
            "title": (
                None
                if raw_item.get("title") in (None, "")
                else decode_html_entities(str(raw_item.get("title")))
            ),
            "images": raw_item.get("images") if isinstance(raw_item.get("images"), list) else [],
            "product_properties": (
                raw_item.get("productProperties")
                if isinstance(raw_item.get("productProperties"), list)
                else []
            ),
            "raw_payload": raw_item,
        }

        _, created = ItemModel.objects.update_or_create(
            response=response_obj,
            item_id=item_id,
            defaults=item_defaults,
        )
        if created:
            created_items += 1
        else:
            updated_items += 1

    deleted_items = 0
    if seen_item_ids:
        deleted_items, _ = (
            ItemModel.objects.filter(response=response_obj)
            .exclude(item_id__in=seen_item_ids)
            .delete()
        )

    return {
        "response_id": response_obj.id,
        "response_created": response_created,
        "items_received": len(items),
        "items_created": created_items,
        "items_updated": updated_items,
        "items_deleted": deleted_items,
        "items_skipped": skipped_items,
    }


def set_external_push_status(*, account: str, ean: str, pushed: bool, error: str = "") -> None:
    ResponseModel, _ = resolve_models(account)
    response_obj = (
        ResponseModel.objects.filter(account=account, ean=ean)
        .order_by("-id")
        .first()
    )
    if response_obj is None:
        return
    response_obj.external_push_status = (
        ResponseModel.ExternalPushStatus.PUSHED if pushed else ResponseModel.ExternalPushStatus.FAILED
    )
    response_obj.external_push_error = "" if pushed else str(error or "")
    response_obj.save(update_fields=["external_push_status", "external_push_error", "updated_at"])


def get_status_meta(*, account: str, ean: str) -> dict | None:
    ResponseModel, _ = resolve_models(account)
    response_obj = (
        ResponseModel.objects.filter(account=account, ean=ean)
        .order_by("-id")
        .first()
    )
    if response_obj is None:
        return None
    return {
        "response_id": response_obj.id,
        "local_save_status": response_obj.local_save_status,
        "external_push_status": response_obj.external_push_status,
        "external_push_error": response_obj.external_push_error or "",
        "updated_at": response_obj.updated_at,
    }


def get_cached_payload_by_ean(*, account: str, ean: str) -> dict | None:
    ResponseModel, ItemModel = resolve_models(account)
    response_obj = (
        ResponseModel.objects.filter(account=account, ean=ean)
        .order_by("-updated_at", "-id")
        .first()
    )
    if response_obj is None:
        return None

    items_payload: list[dict] = []
    for item in ItemModel.objects.filter(response=response_obj).order_by("id"):
        if isinstance(item.raw_payload, dict) and item.raw_payload:
            items_payload.append(item.raw_payload)
            continue
        items_payload.append(
            {
                "itemID": str(item.item_id or ""),
                "title": str(item.title or ""),
                "description": str(item.description or ""),
                "price": item.price,
                "quantity": item.quantity,
                "categoryID": item.category_id,
                "condition": item.condition,
                "itemMode": item.item_mode,
                "itemNumber": item.item_number,
                "images": item.images if isinstance(item.images, list) else [],
                "productProperties": item.product_properties if isinstance(item.product_properties, list) else [],
            }
        )

    return {
        "account": account,
        "ean": ean,
        "status": response_obj.status or "cached",
        "message": response_obj.message or "",
        "errors": response_obj.errors if isinstance(response_obj.errors, list) else [],
        "success": bool(response_obj.success),
        "items": items_payload,
        "source": "local_cache",
    }
