import json
import os
import re
import unicodedata
from contextlib import contextmanager
from functools import wraps
from hashlib import sha256
from io import BytesIO
from datetime import datetime
from ftplib import FTP, FTP_TLS, all_errors as FTP_ERRORS
from pathlib import Path
from threading import BoundedSemaphore
from time import monotonic, sleep
from urllib.parse import urlparse, urlunparse
from uuid import uuid4

try:
    from PIL import Image, ImageOps
except Exception:  # noqa: BLE001
    Image = None
    ImageOps = None


class FtpUploadConfigError(RuntimeError):
    pass


class FtpUploadCorruptedFileError(ValueError):
    pass


class FtpUploadConcurrencyError(RuntimeError):
    pass


def _is_ftp_connection_limit_error(error: Exception) -> bool:
    message = str(error).lower()
    return "530" in message and "maximum number of connections" in message


def _limit_ftp_upload_connections(func):
    @wraps(func)
    def wrapped(*args, **kwargs):
        return _run_ftp_upload(
            lambda: func(*args, **kwargs),
            host=str(kwargs.get("host") or UPLOAD_FTP_HOST),
            user=str(kwargs.get("user") or UPLOAD_FTP_USER),
        )

    return wrapped


def _is_true(value: str) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


UPLOAD_FTP_HOST = (os.getenv("UPLOAD_FTP_HOST") or "").strip()
UPLOAD_FTP_USER = (os.getenv("UPLOAD_FTP_USER") or "").strip()
UPLOAD_FTP_PASS = (os.getenv("UPLOAD_FTP_PASS") or "").strip()
UPLOAD_FTP_PORT = int((os.getenv("UPLOAD_FTP_PORT") or "21").strip())
UPLOAD_FTP_ROOT_DIR = (os.getenv("UPLOAD_FTP_ROOT_DIR") or "").strip().strip("/")
UPLOAD_FTP_STORAGE_ROOT_DIR = (os.getenv("UPLOAD_FTP_STORAGE_ROOT_DIR") or "").strip().strip("/")
UPLOAD_FTP_AVATAR_DIR = (os.getenv("UPLOAD_FTP_AVATAR_DIR") or "avatar").strip().strip("/")
UPLOAD_FTP_IMAGE_DIR = (os.getenv("UPLOAD_FTP_IMAGE_DIR") or "images").strip().strip("/")
UPLOAD_FTP_PUBLIC_BASE_URL = (os.getenv("UPLOAD_FTP_PUBLIC_BASE_URL") or "").strip().rstrip("/")
UPLOAD_STORAGE_BACKEND = (os.getenv("UPLOAD_STORAGE_BACKEND") or "").strip().lower()
UPLOAD_FTP_USE_TLS = _is_true(os.getenv("UPLOAD_FTP_USE_TLS", "false"))
UPLOAD_FTP_PASSIVE = _is_true(os.getenv("UPLOAD_FTP_PASSIVE", "true"))
UPLOAD_FTP_CONNECT_TIMEOUT = int((os.getenv("UPLOAD_FTP_CONNECT_TIMEOUT") or "15").strip())
UPLOAD_IMAGE_COMPRESS_ENABLED = _is_true(os.getenv("UPLOAD_IMAGE_COMPRESS_ENABLED", "true"))
UPLOAD_IMAGE_MAX_BYTES = int((os.getenv("UPLOAD_IMAGE_MAX_BYTES") or "700000").strip())
UPLOAD_IMAGE_MAX_DIMENSION = int((os.getenv("UPLOAD_IMAGE_MAX_DIMENSION") or "2200").strip())
UPLOAD_IMAGE_JPEG_QUALITY = int((os.getenv("UPLOAD_IMAGE_JPEG_QUALITY") or "82").strip())
UPLOAD_IMAGE_WEBP_QUALITY = int((os.getenv("UPLOAD_IMAGE_WEBP_QUALITY") or "80").strip())
UPLOAD_FTP_MAX_CONCURRENT_UPLOADS = max(
    1,
    int((os.getenv("UPLOAD_FTP_MAX_CONCURRENT_UPLOADS") or "2").strip()),
)
UPLOAD_FTP_CONNECTION_RETRIES = max(
    1,
    int((os.getenv("UPLOAD_FTP_CONNECTION_RETRIES") or "3").strip()),
)
UPLOAD_FTP_CONNECTION_RETRY_DELAY_SECONDS = max(
    0.0,
    float((os.getenv("UPLOAD_FTP_CONNECTION_RETRY_DELAY_SECONDS") or "1.0").strip()),
)
FTP_UPLOAD_REDIS_URL = (os.getenv("FTP_UPLOAD_REDIS_URL") or "").strip()
FTP_UPLOAD_REDIS_LOCK_TIMEOUT_SECONDS = max(
    1,
    int((os.getenv("FTP_UPLOAD_REDIS_LOCK_TIMEOUT_SECONDS") or "600").strip()),
)
FTP_UPLOAD_REDIS_LOCK_WAIT_SECONDS = max(
    0.0,
    float((os.getenv("FTP_UPLOAD_REDIS_LOCK_WAIT_SECONDS") or "60").strip()),
)
FTP_UPLOAD_REDIS_MAX_CONCURRENT_UPLOADS = max(
    1,
    int((os.getenv("FTP_UPLOAD_REDIS_MAX_CONCURRENT_UPLOADS") or "3").strip()),
)
_ftp_upload_slots = BoundedSemaphore(UPLOAD_FTP_MAX_CONCURRENT_UPLOADS)


def _ftp_upload_lock_name(*, host: str, user: str) -> str:
    endpoint = f"{host}:{user}".encode("utf-8")
    return f"warehub:ftp-upload:{sha256(endpoint).hexdigest()}"


@contextmanager
def _distributed_ftp_upload_lock(*, host: str, user: str):
    if not FTP_UPLOAD_REDIS_URL:
        yield
        return

    try:
        from redis import Redis
        from redis.exceptions import LockError, RedisError
    except ImportError as error:
        raise FtpUploadConcurrencyError("FTP upload concurrency guard is unavailable.") from error

    client = Redis.from_url(
        FTP_UPLOAD_REDIS_URL,
        socket_connect_timeout=3,
        socket_timeout=3,
    )
    lock = None
    deadline = monotonic() + FTP_UPLOAD_REDIS_LOCK_WAIT_SECONDS
    try:
        while lock is None:
            for slot_number in range(FTP_UPLOAD_REDIS_MAX_CONCURRENT_UPLOADS):
                candidate = client.lock(
                    f"{_ftp_upload_lock_name(host=host, user=user)}:{slot_number}",
                    timeout=FTP_UPLOAD_REDIS_LOCK_TIMEOUT_SECONDS,
                )
                if candidate.acquire(blocking=False):
                    lock = candidate
                    break
            if lock is None:
                if monotonic() >= deadline:
                    raise FtpUploadConcurrencyError("FTP upload queue is busy. Please retry shortly.")
                sleep(min(0.2, max(0.0, deadline - monotonic())))
    except RedisError as error:
        raise FtpUploadConcurrencyError("FTP upload concurrency guard is unavailable.") from error

    try:
        yield
    finally:
        try:
            lock.release()
        except (LockError, RedisError):
            pass
        finally:
            client.close()


def _run_ftp_upload(operation, *, host: str, user: str):
    with _distributed_ftp_upload_lock(host=host, user=user), _ftp_upload_slots:
        for attempt in range(1, UPLOAD_FTP_CONNECTION_RETRIES + 1):
            try:
                return operation()
            except FTP_ERRORS as error:
                if (
                    not _is_ftp_connection_limit_error(error)
                    or attempt >= UPLOAD_FTP_CONNECTION_RETRIES
                ):
                    raise
                sleep(UPLOAD_FTP_CONNECTION_RETRY_DELAY_SECONDS * attempt)

XL_SITE_PUBLIC_DOMAINS = {
    "XLMOEBEL_DE": "xlmoebel.de",
    "XLMOEBEL_CH": "xlmoebel.ch",
    "XLMOBILI_IT": "xlmobili.it",
    "XLMEUBILAIR_NL": "xlmeubilair.nl",
    "XLMEBELES_LV": "xlmebeles.lv",
    "XLMOEBEL_LU": "xlmoebel.lu",
    "XLNABYTEK_CZ": "xlnabytek.cz",
    "XLPOSLOVNO_SI": "xlposlovno.si",
    "XLFURNITURE_CO_UK": "xlfurniture.co.uk",
    "XLBUTOROK_HU": "xlbutorok.hu",
    "XLHOME_GR": "xlhome.gr",
    "XLMEBLE_PL": "xlmeble.pl",
    "XLMEUBELLA_BE": "xlmeubella.be",
    "XLMEUBLES_FR": "xlmeubles.fr",
    "XLMOEBEL_AT": "xlmoebel.at",
    "XLMUEBLES_ES": "xlmuebles.es",
    "XLFURNITURE_IE": "xlfurniture.ie",
    "XLHUONEKALUT_FI": "xlhuonekalut.fi",
    "XLMOBILA_RO": "xlmobila.ro",
    "XLMOBILIARIO_PT": "xlmobiliario.pt",
    "XLMOBLER_SE": "xlmobler.se",
    "XLNABYTOK_SK": "xlnabytok.sk",
    "XXLMOBLER_DK": "xxlmobler.dk",
}


def _safe_ext(filename: str) -> str:
    ext = Path(filename or "").suffix.strip().lower()
    if not ext or len(ext) > 10:
        return ".jpg"
    return ext


def _build_filename(*, kid_number: str, original_name: str) -> str:
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    return f"kid_{kid_number}_{ts}_{uuid4().hex[:10]}{_safe_ext(original_name)}"


def _build_generic_filename(*, prefix: str, original_name: str) -> str:
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    safe_prefix = "".join(ch for ch in (prefix or "file") if ch.isalnum() or ch in {"_", "-"}).strip("_-")
    if not safe_prefix:
        safe_prefix = "file"
    return f"{safe_prefix}_{ts}_{uuid4().hex[:10]}{_safe_ext(original_name)}"


def _safe_original_filename(original_name: str) -> str:
    # JV/Cosmoshop media paths are safer with ASCII filenames.
    name = Path(original_name or "").name.strip()
    if not name:
        return ""
    suffix = _safe_ext(name)
    stem = Path(name).stem
    ascii_stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode("ascii")
    ascii_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", ascii_stem).strip("._-")
    if not ascii_stem:
        ascii_stem = "image"
    return f"{ascii_stem}{suffix}"


def _replace_filename_ext(filename: str, ext: str) -> str:
    clean_ext = (ext or "").strip().lower().lstrip(".") or "jpg"
    stem = Path(filename or "image").stem or "image"
    return f"{stem}.{clean_ext}"


def _ensure_config(*, leaf_dir: str) -> tuple[str, int, str, str, list[str], str, str]:
    if not UPLOAD_FTP_HOST:
        raise FtpUploadConfigError("FTP config error: UPLOAD_FTP_HOST is empty.")
    if not UPLOAD_FTP_USER:
        raise FtpUploadConfigError("FTP config error: UPLOAD_FTP_USER is empty.")
    if not UPLOAD_FTP_PASS:
        raise FtpUploadConfigError("FTP config error: UPLOAD_FTP_PASS is empty.")
    if not UPLOAD_FTP_PUBLIC_BASE_URL:
        raise FtpUploadConfigError("FTP config error: UPLOAD_FTP_PUBLIC_BASE_URL is empty.")

    if UPLOAD_FTP_STORAGE_ROOT_DIR:
        remote_root = [p for p in UPLOAD_FTP_STORAGE_ROOT_DIR.split("/") if p]
    elif UPLOAD_FTP_ROOT_DIR:
        remote_root = [p for p in UPLOAD_FTP_ROOT_DIR.split("/") if p]
    else:
        remote_root = []

    final_dir = (leaf_dir or "").strip().strip("/")
    if not final_dir:
        raise FtpUploadConfigError("FTP config error: target upload directory is empty.")
    remote_parts = remote_root + [final_dir]
    return (
        UPLOAD_FTP_HOST,
        UPLOAD_FTP_PORT,
        UPLOAD_FTP_USER,
        UPLOAD_FTP_PASS,
        remote_parts,
        _normalize_managed_public_base_url(
            UPLOAD_FTP_PUBLIC_BASE_URL,
            storage_root_dir=UPLOAD_FTP_STORAGE_ROOT_DIR,
            root_dir=UPLOAD_FTP_ROOT_DIR,
        ),
        final_dir,
    )


def _sitekey_env_value(site_key: str, suffix: str) -> str:
    key = (site_key or "").strip().upper()
    if not key:
        return ""
    return (os.getenv(f"{key}_{suffix}") or "").strip()


def _sitekey_env_candidates(site_key: str, suffix: str) -> list[str]:
    key = (site_key or "").strip().upper()
    if not key:
        return []
    # Keep primary names first, then JV legacy/infra aliases.
    return [
        f"{key}_{suffix}",
    ]


def _env_first_nonempty(names: list[str]) -> str:
    for name in names:
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return ""


def _sitekey_env_any(site_key: str, suffixes: list[str]) -> str:
    names: list[str] = []
    for suffix in suffixes:
        names.extend(_sitekey_env_candidates(site_key, suffix))
    return _env_first_nonempty(names)


def _jv_legacy_code(site_key: str) -> str:
    key = (site_key or "").strip().upper()
    if key.startswith("JV_"):
        return key.split("JV_", 1)[1]
    return ""


def _jv_legacy_env_any(site_key: str, suffixes: list[str]) -> str:
    """
    Support legacy JV env names like:
    - FTP_DE_DOMIN
    - FTP_DE_DOMAIN
    - FTP_DE_URL
    """
    code = _jv_legacy_code(site_key)
    if not code:
        return ""
    names: list[str] = []
    for suffix in suffixes:
        names.append(f"FTP_{code}_{suffix}")
    return _env_first_nonempty(names)


def _xl_public_base_for_site_key(site_key: str) -> str:
    domain = XL_SITE_PUBLIC_DOMAINS.get((site_key or "").strip().upper(), "")
    return f"https://www.{domain}/image" if domain else ""


def _ensure_config_for_site_key(site_key: str, *, leaf_dir: str) -> tuple[str, int, str, str, list[str], str, str, bool, bool, int]:
    key_norm = (site_key or "").strip().upper()
    is_jv_site = key_norm.startswith("JV_")
    is_xl_site = key_norm in XL_SITE_PUBLIC_DOMAINS

    host_specific = _sitekey_env_any(site_key, ["FTP_HOST", "HOST"]) or _jv_legacy_env_any(site_key, ["HOST"])
    user_specific = _sitekey_env_any(site_key, ["FTP_USER", "USER"]) or _jv_legacy_env_any(site_key, ["USER"])
    pass_specific = _sitekey_env_any(site_key, ["FTP_PASSWORD", "FTP_PASS", "PASSWORD", "PASS"]) or _jv_legacy_env_any(site_key, ["PASS", "PASSWORD"])

    host = host_specific or ("" if is_jv_site else UPLOAD_FTP_HOST)
    user = user_specific or ("" if is_jv_site else UPLOAD_FTP_USER)
    password = (
        pass_specific
        or ("" if is_jv_site else UPLOAD_FTP_PASS)
    )
    port_raw = _sitekey_env_any(site_key, ["FTP_PORT", "PORT"]) or _jv_legacy_env_any(site_key, ["PORT"]) or str(UPLOAD_FTP_PORT)
    try:
        port = int(port_raw)
    except ValueError:
        port = UPLOAD_FTP_PORT

    storage_root_specific = _sitekey_env_any(site_key, ["FTP_STORAGE_ROOT_DIR", "STORAGE_ROOT_DIR"])
    storage_root = (storage_root_specific or ("" if (is_jv_site or is_xl_site) else UPLOAD_FTP_STORAGE_ROOT_DIR)).strip().strip("/")
    root_dir = (
        _sitekey_env_any(site_key, ["FTP_ROOT_DIR", "FTP_DOMAIN", "DOMAIN", "DOMIN", "ROOT_DIR"])
        or _jv_legacy_env_any(site_key, ["DOMAIN", "DOMIN"])
        or ("image" if is_xl_site else ("" if is_jv_site else UPLOAD_FTP_ROOT_DIR))
    ).strip().strip("/")
    final_dir = (leaf_dir or "").strip().strip("/")
    public_base_specific = (
        _sitekey_env_any(site_key, ["FTP_PUBLIC_BASE_URL", "PUBLIC_BASE_URL", "URL", "DOMAIN", "DOMIN"])
        or _jv_legacy_env_any(site_key, ["URL", "DOMAIN", "DOMIN"])
    )
    public_base = (
        public_base_specific
        or _xl_public_base_for_site_key(site_key)
        or ("" if is_jv_site else UPLOAD_FTP_PUBLIC_BASE_URL)
    ).strip().rstrip("/")
    use_tls_raw = _sitekey_env_any(site_key, ["FTP_USE_TLS", "USE_TLS", "SSL"])
    use_tls = _is_true(use_tls_raw) if use_tls_raw else UPLOAD_FTP_USE_TLS
    passive_raw = _sitekey_env_any(site_key, ["FTP_PASSIVE", "PASSIVE"])
    passive = _is_true(passive_raw) if passive_raw else UPLOAD_FTP_PASSIVE
    timeout_raw = _sitekey_env_any(site_key, ["FTP_CONNECT_TIMEOUT", "CONNECT_TIMEOUT"]) or str(UPLOAD_FTP_CONNECT_TIMEOUT)
    try:
        timeout = int(timeout_raw)
    except ValueError:
        timeout = UPLOAD_FTP_CONNECT_TIMEOUT

    if not host:
        raise FtpUploadConfigError(f"FTP config error: {site_key}_FTP_HOST (or UPLOAD_FTP_HOST) is empty.")
    if not user:
        raise FtpUploadConfigError(f"FTP config error: {site_key}_FTP_USER (or UPLOAD_FTP_USER) is empty.")
    if not password:
        raise FtpUploadConfigError(f"FTP config error: {site_key}_FTP_PASSWORD (or UPLOAD_FTP_PASS) is empty.")
    if not public_base:
        raise FtpUploadConfigError(
            f"FTP config error: {site_key}_FTP_PUBLIC_BASE_URL (or UPLOAD_FTP_PUBLIC_BASE_URL) is empty."
        )
    if not final_dir:
        raise FtpUploadConfigError("FTP config error: target upload directory is empty.")
    if is_jv_site and not (storage_root or root_dir):
        raise FtpUploadConfigError(
            f"FTP config error: {site_key} needs FTP_*_DOMIN/DOMAIN (or FTP_ROOT_DIR) for JV cosmoshop path."
        )

    if storage_root:
        remote_root = [p for p in storage_root.split("/") if p]
    elif root_dir:
        remote_root = [p for p in root_dir.split("/") if p]
    else:
        remote_root = []
    remote_parts = remote_root + [final_dir]
    return host, port, user, password, remote_parts, public_base, final_dir, use_tls, passive, timeout


def _build_public_url(public_base: str, leaf_dir: str, filename: str) -> str:
    parsed = urlparse(public_base)
    base_parts = [p for p in (parsed.path or "").split("/") if p]
    leaf_parts = [p for p in leaf_dir.split("/") if p]
    final_path = "/" + "/".join(base_parts + leaf_parts + [filename])
    return urlunparse((parsed.scheme, parsed.netloc, final_path, "", "", ""))


def _split_clean_path_parts(value: str) -> list[str]:
    return [part for part in str(value or "").strip().strip("/").split("/") if part]


def _normalize_managed_public_base_url(public_base: str, *, storage_root_dir: str, root_dir: str) -> str:
    value = str(public_base or "").strip().rstrip("/")
    if not value:
        return value

    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return value

    preferred_parts = _split_clean_path_parts(storage_root_dir) or _split_clean_path_parts(root_dir)
    if not preferred_parts:
        return value

    if preferred_parts[0].lower() == parsed.netloc.lower():
        preferred_parts = preferred_parts[1:]
    if not preferred_parts:
        return value

    normalized_path = "/" + "/".join(preferred_parts)
    return urlunparse((parsed.scheme, parsed.netloc, normalized_path, "", "", ""))


def normalize_managed_public_photo_url(photo_url: str) -> str:
    value = str(photo_url or "").strip()
    if not value:
        return ""

    expected_base = _normalize_managed_public_base_url(
        UPLOAD_FTP_PUBLIC_BASE_URL,
        storage_root_dir=UPLOAD_FTP_STORAGE_ROOT_DIR,
        root_dir=UPLOAD_FTP_ROOT_DIR,
    )
    if not expected_base:
        return value

    current = urlparse(value)
    expected = urlparse(expected_base)
    if not current.scheme or not current.netloc:
        return value
    if current.scheme != expected.scheme or current.netloc.lower() != expected.netloc.lower():
        return value

    current_parts = [part for part in (current.path or "").split("/") if part]
    expected_parts = [part for part in (expected.path or "").split("/") if part]
    if len(current_parts) < 2 or len(expected_parts) < 2:
        return value
    if current_parts[: len(expected_parts)] == expected_parts:
        return value
    if current_parts[0] != expected_parts[0]:
        return value

    env_names = {"dev", "stage", "prod"}
    if current_parts[1] not in env_names or expected_parts[1] not in env_names:
        return value

    normalized_path = "/" + "/".join(expected_parts[:2] + current_parts[2:])
    return urlunparse((current.scheme, current.netloc, normalized_path, current.params, current.query, current.fragment))


def _flatten_photo_urls(value: object, *, depth: int = 0) -> list[str]:
    if depth >= 8:
        text = str(value or "").strip()
        return [text] if text else []

    if isinstance(value, list):
        return [url for item in value for url in _flatten_photo_urls(item, depth=depth + 1)]

    if not isinstance(value, str):
        return []

    text = value.strip()
    if not text:
        return []
    if text.startswith("["):
        try:
            decoded = json.loads(text)
        except (TypeError, ValueError):
            return [text]
        if isinstance(decoded, list):
            return _flatten_photo_urls(decoded, depth=depth + 1)
    return [text]


def normalize_managed_public_photo_value(value: object) -> object:
    if not isinstance(value, (list, str)):
        return value

    normalized = [normalize_managed_public_photo_url(url) for url in _flatten_photo_urls(value)]
    if isinstance(value, list) or (isinstance(value, str) and value.lstrip().startswith("[")):
        return normalized
    return normalized[0] if normalized else ""


def _build_open_cart_image_path(leaf_dir: str, filename: str) -> str:
    return "/".join([p for p in [*(leaf_dir or "").split("/"), filename] if p]).strip("/")


def _extract_managed_relative_path(photo_url: str) -> str | None:
    value = str(photo_url or "").strip()
    if not value:
        return None

    if value.startswith("/uploads/"):
        candidate = value[len("/uploads/") :]
        return _sanitize_relative_path(candidate)

    if UPLOAD_FTP_PUBLIC_BASE_URL:
        public_prefix = f"{UPLOAD_FTP_PUBLIC_BASE_URL}/"
        if value.startswith(public_prefix):
            candidate = value[len(public_prefix) :]
            return _sanitize_relative_path(candidate)

    if value.startswith("ftp://"):
        parsed = urlparse(value)
        path = (parsed.path or "").lstrip("/")
        root = (UPLOAD_FTP_ROOT_DIR or "").strip().strip("/")
        if root:
            prefix = f"{root}/"
            if not path.startswith(prefix):
                return None
            path = path[len(prefix) :]
        return _sanitize_relative_path(path)

    return None


def _sanitize_relative_path(path: str) -> str | None:
    parts = []
    for part in str(path or "").split("/"):
        trimmed = part.strip()
        if not trimmed or trimmed in {".", ".."}:
            continue
        parts.append(trimmed)
    if not parts:
        return None
    return "/".join(parts)


def delete_uploaded_photo_by_url(photo_url: str) -> None:
    relative_path = _extract_managed_relative_path(photo_url)
    if not relative_path:
        return

    if UPLOAD_STORAGE_BACKEND == "ftp":
        _delete_via_ftp(relative_path)
        return

    _delete_on_local_disk(relative_path)


def delete_uploaded_photo_urls(photo_urls: list[str]) -> None:
    for photo_url in photo_urls:
        delete_uploaded_photo_by_url(photo_url)


def _delete_on_local_disk(relative_path: str) -> None:
    disk_path = Path("uploads") / relative_path.replace("\\", "/")
    try:
        disk_path.unlink(missing_ok=True)
    except FileNotFoundError:
        return


def _delete_via_ftp(relative_path: str) -> None:
    host = UPLOAD_FTP_HOST
    user = UPLOAD_FTP_USER
    password = UPLOAD_FTP_PASS
    if not host or not user or not password:
        raise FtpUploadConfigError("FTP config error: missing FTP credentials for delete.")

    root = (UPLOAD_FTP_STORAGE_ROOT_DIR or "").strip().strip("/")
    remote_full_path = f"{root}/{relative_path}" if root else relative_path
    remote_dir, _, remote_file = remote_full_path.rpartition("/")
    if not remote_file:
        return

    ftp_class = FTP_TLS if UPLOAD_FTP_USE_TLS else FTP
    ftp = ftp_class()
    try:
        ftp.connect(host=host, port=UPLOAD_FTP_PORT, timeout=UPLOAD_FTP_CONNECT_TIMEOUT)
        ftp.login(user=user, passwd=password)
        ftp.set_pasv(UPLOAD_FTP_PASSIVE)

        if isinstance(ftp, FTP_TLS):
            ftp.prot_p()

        if remote_dir:
            ftp.cwd(remote_dir)
        try:
            ftp.delete(remote_file)
        except FTP_ERRORS:
            return
    finally:
        try:
            if getattr(ftp, "sock", None):
                ftp.quit()
            else:
                ftp.close()
        except FTP_ERRORS:
            try:
                ftp.close()
            except FTP_ERRORS:
                pass


def collect_uploaded_files(request, field_names: tuple[str, ...] = ("photo_files", "files", "images")) -> list:
    files: list = []
    request_files = getattr(request, "FILES", None)
    if request_files is None:
        return files

    if hasattr(request_files, "getlist"):
        for field_name in field_names:
            files.extend(request_files.getlist(field_name))
    else:
        files.extend(request_files.values())
    return [f for f in files if hasattr(f, "read")]


@_limit_ftp_upload_connections
def upload_kid_photo_file(uploaded_file, *, kid_number: str) -> str:
    host, port, user, password, remote_parts, public_base, image_dir = _ensure_config(
        leaf_dir=UPLOAD_FTP_IMAGE_DIR or "images"
    )
    filename = _build_filename(
        kid_number=kid_number.strip() or "unknown",
        original_name=getattr(uploaded_file, "name", ""),
    )
    upload_bytes = _repair_known_image_header_corruption(_read_uploaded_bytes(uploaded_file))
    detected_ext = _validate_uploaded_image_bytes(upload_bytes, getattr(uploaded_file, "name", ""))
    upload_bytes, detected_ext = _compress_image_bytes_if_needed(upload_bytes, detected_ext)
    filename = _replace_filename_ext(filename, detected_ext)

    ftp_class = FTP_TLS if UPLOAD_FTP_USE_TLS else FTP
    ftp = ftp_class()
    try:
        ftp.connect(host=host, port=port, timeout=UPLOAD_FTP_CONNECT_TIMEOUT)
        ftp.login(user=user, passwd=password)
        ftp.set_pasv(UPLOAD_FTP_PASSIVE)

        if isinstance(ftp, FTP_TLS):
            ftp.prot_p()

        try:
            ftp.cwd("/")
        except FTP_ERRORS:
            pass

        for part in remote_parts:
            if not part:
                continue
            try:
                ftp.cwd(part)
            except FTP_ERRORS:
                ftp.mkd(part)
                ftp.cwd(part)

        ftp.storbinary(f"STOR {filename}", BytesIO(upload_bytes))
    finally:
        try:
            # If connect/login failed, socket may be absent; quit() would raise.
            if getattr(ftp, "sock", None):
                ftp.quit()
            else:
                ftp.close()
        except FTP_ERRORS:
            try:
                ftp.close()
            except FTP_ERRORS:
                pass

    return _build_public_url(public_base, image_dir, filename)


@_limit_ftp_upload_connections
def upload_public_file(uploaded_file, *, prefix: str = "jv") -> str:
    host, port, user, password, remote_parts, public_base, image_dir = _ensure_config(
        leaf_dir=UPLOAD_FTP_IMAGE_DIR or "images"
    )
    filename = _build_generic_filename(
        prefix=prefix,
        original_name=getattr(uploaded_file, "name", ""),
    )
    upload_bytes = _repair_known_image_header_corruption(_read_uploaded_bytes(uploaded_file))
    detected_ext = _validate_uploaded_image_bytes(upload_bytes, getattr(uploaded_file, "name", ""))
    upload_bytes, detected_ext = _compress_image_bytes_if_needed(upload_bytes, detected_ext)
    filename = _replace_filename_ext(filename, detected_ext)

    ftp_class = FTP_TLS if UPLOAD_FTP_USE_TLS else FTP
    ftp = ftp_class()
    try:
        ftp.connect(host=host, port=port, timeout=UPLOAD_FTP_CONNECT_TIMEOUT)
        ftp.login(user=user, passwd=password)
        ftp.set_pasv(UPLOAD_FTP_PASSIVE)

        if isinstance(ftp, FTP_TLS):
            ftp.prot_p()

        try:
            ftp.cwd("/")
        except FTP_ERRORS:
            pass

        for part in remote_parts:
            if not part:
                continue
            try:
                ftp.cwd(part)
            except FTP_ERRORS:
                ftp.mkd(part)
                ftp.cwd(part)

        ftp.storbinary(f"STOR {filename}", BytesIO(upload_bytes))
    finally:
        try:
            if getattr(ftp, "sock", None):
                ftp.quit()
            else:
                ftp.close()
        except FTP_ERRORS:
            try:
                ftp.close()
            except FTP_ERRORS:
                pass

    return _build_public_url(public_base, image_dir, filename)


@_limit_ftp_upload_connections
def upload_public_file_for_site_payload(uploaded_file, *, site_key: str, prefix: str = "jv") -> dict:
    host, port, user, password, remote_parts, public_base, image_dir, use_tls, passive, timeout = _ensure_config_for_site_key(
        site_key,
        leaf_dir=UPLOAD_FTP_IMAGE_DIR or "images",
    )
    filename = _build_generic_filename(
        prefix=prefix,
        original_name=getattr(uploaded_file, "name", ""),
    )
    upload_bytes = _repair_known_image_header_corruption(_read_uploaded_bytes(uploaded_file))
    detected_ext = _validate_uploaded_image_bytes(upload_bytes, getattr(uploaded_file, "name", ""))
    upload_bytes, detected_ext = _compress_image_bytes_if_needed(upload_bytes, detected_ext)
    filename = _replace_filename_ext(filename, detected_ext)

    ftp_class = FTP_TLS if use_tls else FTP
    ftp = ftp_class()
    try:
        ftp.connect(host=host, port=port, timeout=timeout)
        ftp.login(user=user, passwd=password)
        ftp.set_pasv(passive)

        if isinstance(ftp, FTP_TLS):
            ftp.prot_p()

        try:
            ftp.cwd("/")
        except FTP_ERRORS:
            pass

        for part in remote_parts:
            if not part:
                continue
            try:
                ftp.cwd(part)
            except FTP_ERRORS:
                ftp.mkd(part)
                ftp.cwd(part)

        ftp.storbinary(f"STOR {filename}", BytesIO(upload_bytes))
    finally:
        try:
            if getattr(ftp, "sock", None):
                ftp.quit()
            else:
                ftp.close()
        except FTP_ERRORS:
            try:
                ftp.close()
            except FTP_ERRORS:
                pass

    return {
        "public_url": _build_public_url(public_base, image_dir, filename),
        "db_path": _build_open_cart_image_path(image_dir, filename),
        "filename": filename,
    }


def upload_public_file_for_site(uploaded_file, *, site_key: str, prefix: str = "jv") -> str:
    return str(upload_public_file_for_site_payload(uploaded_file, site_key=site_key, prefix=prefix).get("public_url") or "")


@_limit_ftp_upload_connections
def _ftp_store_file(
    *,
    host: str,
    port: int,
    user: str,
    password: str,
    use_tls: bool,
    passive: bool,
    timeout: int,
    remote_parts: list[str],
    filename: str,
    uploaded_file,
    uploaded_bytes: bytes | None = None,
):
    ftp_class = FTP_TLS if use_tls else FTP
    upload_bytes = uploaded_bytes if uploaded_bytes is not None else _read_uploaded_bytes(uploaded_file)
    upload_bytes = _repair_known_image_header_corruption(upload_bytes)
    detected_ext = _validate_uploaded_image_bytes(upload_bytes, filename)
    upload_bytes, _ = _compress_image_bytes_if_needed(upload_bytes, detected_ext)
    ftp = ftp_class()
    try:
        ftp.connect(host=host, port=port, timeout=timeout)
        ftp.login(user=user, passwd=password)
        ftp.set_pasv(passive)

        if isinstance(ftp, FTP_TLS):
            ftp.prot_p()

        try:
            ftp.cwd("/")
        except FTP_ERRORS:
            pass

        for part in remote_parts:
            if not part:
                continue
            try:
                ftp.cwd(part)
            except FTP_ERRORS:
                # Creating a fresh gallery folder (named after the artikelnr) races
                # against the other concurrent gallery uploads. If a sibling upload
                # created it first, mkd fails — fall back to cwd instead of erroring.
                try:
                    ftp.mkd(part)
                except FTP_ERRORS:
                    pass
                ftp.cwd(part)

        ftp.storbinary(f"STOR {filename}", BytesIO(upload_bytes))
    finally:
        try:
            ftp.quit()
        except FTP_ERRORS:
            try:
                ftp.close()
            except FTP_ERRORS:
                pass


@contextmanager
def _ftp_connection(*, host: str, port: int, user: str, password: str, use_tls: bool, passive: bool, timeout: int):
    ftp_class = FTP_TLS if use_tls else FTP
    ftp = ftp_class()
    try:
        ftp.connect(host=host, port=port, timeout=timeout)
        ftp.login(user=user, passwd=password)
        ftp.set_pasv(passive)
        if isinstance(ftp, FTP_TLS):
            ftp.prot_p()
        yield ftp
    finally:
        try:
            if getattr(ftp, "sock", None):
                ftp.quit()
            else:
                ftp.close()
        except FTP_ERRORS:
            try:
                ftp.close()
            except FTP_ERRORS:
                pass


def _ftp_store_file_with_connection(ftp, *, remote_parts: list[str], filename: str, upload_bytes: bytes) -> None:
    try:
        ftp.cwd("/")
    except FTP_ERRORS:
        pass

    for part in remote_parts:
        if not part:
            continue
        try:
            ftp.cwd(part)
        except FTP_ERRORS:
            try:
                ftp.mkd(part)
            except FTP_ERRORS:
                pass
            ftp.cwd(part)

    ftp.storbinary(f"STOR {filename}", BytesIO(upload_bytes))


def _safe_jv_folder_name(value: str) -> str:
    # cosmoshop serves the gallery from a folder named after the article media key
    # (the artikelnr). Keep it filesystem-safe but otherwise verbatim so it matches
    # what cosmoshop requests.
    return "".join(ch for ch in str(value or "").strip() if ch.isalnum() or ch in ("-", "_"))


def upload_jv_product_file_for_site(
    uploaded_file,
    *,
    site_key: str,
    ean: str = "",
    extra_index: int = 0,
    kind: str = "extra",
    prefix: str = "jv",
    folder_key: str = "",
) -> dict:
    """
    Upload JV image to cosmoshop tree.
    kind:
      - "main": write into g/n/v/flashzoom
      - "extra": write into z/zg
    ``folder_key`` overrides the gallery sub-folder name (default: EAN digits).
    cosmoshop reads the gallery from a folder named after the article media key
    (the artikelnr), so the caller passes the artikelnr here.
    Returns DB path and uploaded public URLs.
    """
    host, port, user, password, remote_parts, public_base, image_dir, use_tls, passive, timeout = _ensure_config_for_site_key(
        site_key,
        leaf_dir=UPLOAD_FTP_IMAGE_DIR or "images",
    )
    ean_digits = "".join(ch for ch in str(ean or "") if ch.isdigit())
    upload_bytes = _repair_known_image_header_corruption(_read_uploaded_bytes(uploaded_file))
    detected_ext = _validate_uploaded_image_bytes(upload_bytes, getattr(uploaded_file, "name", ""))
    original_filename = _safe_original_filename(getattr(uploaded_file, "name", ""))
    filename = original_filename or _build_generic_filename(
        prefix=prefix,
        original_name=getattr(uploaded_file, "name", ""),
    )
    filename = _replace_filename_ext(filename, detected_ext)
    upload_bytes, _ = _compress_image_bytes_if_needed(upload_bytes, detected_ext)

    base_parts = [p for p in remote_parts if p]
    # _ensure_config_for_site_key appends the generic image dir, but JV needs cosmoshop root.
    if image_dir and base_parts and base_parts[-1] == image_dir:
        base_parts = base_parts[:-1]
    base_parts = base_parts + ["cosmoshop", "default", "pix", "a"]
    is_main = str(kind or "").strip().lower() == "main"
    if is_main:
        upload_targets = [(leaf, []) for leaf in ["v", "n", "g", "flashzoomer"]]
        db_dir = "v"
        db_nested_suffix = []
    else:
        db_dir = "z"
        ean_folder = _safe_jv_folder_name(folder_key) or ean_digits or "misc"
        upload_targets = [
            ("z", [ean_folder, "g"]),
            ("z", [ean_folder]),
            ("zg", [ean_folder, "g"]),
            ("zg", [ean_folder]),
        ]
        db_nested_suffix = [ean_folder, "g"]

    def upload_all_targets() -> list[str]:
        public_urls = []
        with _ftp_connection(
            host=host,
            port=port,
            user=user,
            password=password,
            use_tls=use_tls,
            passive=passive,
            timeout=timeout,
        ) as ftp:
            for leaf, nested_suffix in upload_targets:
                parts = base_parts + [leaf] + nested_suffix
                _ftp_store_file_with_connection(
                    ftp,
                    remote_parts=parts,
                    filename=filename,
                    upload_bytes=upload_bytes,
                )
                # Public JV URL must be relative to site root:
                # /cosmoshop/default/pix/a/<leaf>/...
                public_parts = ["cosmoshop", "default", "pix", "a", leaf] + nested_suffix
                full_url = _build_public_url(public_base, "/".join(public_parts), filename)
                public_urls.append(full_url)
        return public_urls

    public_urls = _run_ftp_upload(upload_all_targets, host=host, user=user)

    # DB must store path relative to site root (without FTP domain/root prefix),
    # e.g. "cosmoshop/default/pix/a/v/<file>".
    db_base_parts = ["cosmoshop", "default", "pix", "a"]
    db_path = "/".join(db_base_parts + [db_dir] + db_nested_suffix + [filename])
    return {
        "db_path": db_path,
        "public_urls": public_urls,
        "filename": filename,
        "kind": "main" if is_main else "extra",
    }


def _read_uploaded_bytes(uploaded_file) -> bytes:
    if hasattr(uploaded_file, "seek"):
        uploaded_file.seek(0)
    data = uploaded_file.read()
    if hasattr(uploaded_file, "seek"):
        uploaded_file.seek(0)
    if isinstance(data, bytes):
        return data
    if isinstance(data, str):
        return data.encode("utf-8", errors="replace")
    return bytes(data or b"")


def _repair_known_image_header_corruption(data: bytes) -> bytes:
    # Some upstream clients may accidentally prepend UTF-8 replacement-char bytes
    # (EF BF BD) before binary signatures. Repair known image headers.
    if not data.startswith(b"\xef\xbf\xbd"):
        return data

    if len(data) >= 11 and data[3:11] == b"\x50\x4e\x47\x0d\x0a\x1a\x0a\x00":
        return b"\x89" + data[3:]

    if len(data) >= 5 and data[3:5] == b"\xff\xd8":
        return b"\xff\xd8" + data[5:]

    return data


def _detect_image_extension(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return ""


def _compress_image_bytes_if_needed(data: bytes, detected_ext: str) -> tuple[bytes, str]:
    if not UPLOAD_IMAGE_COMPRESS_ENABLED:
        return data, detected_ext
    if Image is None or ImageOps is None:
        return data, detected_ext
    if detected_ext not in {"jpg", "png", "webp"}:
        return data, detected_ext

    try:
        with Image.open(BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            max_dim = max(1, UPLOAD_IMAGE_MAX_DIMENSION)
            if max(img.size or (0, 0)) > max_dim:
                img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

            out = BytesIO()
            if detected_ext == "jpg":
                # JPEG cannot store alpha; convert safely.
                if img.mode not in ("RGB", "L"):
                    img = img.convert("RGB")
                img.save(
                    out,
                    format="JPEG",
                    quality=max(30, min(95, UPLOAD_IMAGE_JPEG_QUALITY)),
                    optimize=True,
                    progressive=True,
                )
            elif detected_ext == "png":
                img.save(out, format="PNG", optimize=True)
            elif detected_ext == "webp":
                if img.mode not in ("RGB", "RGBA", "L"):
                    img = img.convert("RGBA")
                img.save(
                    out,
                    format="WEBP",
                    quality=max(30, min(95, UPLOAD_IMAGE_WEBP_QUALITY)),
                    method=6,
                )

            candidate = out.getvalue()
            if not candidate:
                return data, detected_ext

            # Keep compressed version when strictly smaller or above target size.
            max_bytes = max(1, UPLOAD_IMAGE_MAX_BYTES)
            if len(candidate) < len(data) or len(data) > max_bytes:
                return candidate, detected_ext
    except Exception:  # noqa: BLE001
        return data, detected_ext

    return data, detected_ext


def _validate_uploaded_image_bytes(data: bytes, filename: str) -> str:
    if not data:
        raise FtpUploadCorruptedFileError("Uploaded file is empty.")

    # EF BF BD at the beginning means binary bytes were already decoded and
    # re-encoded as text. The same byte sequence can occur naturally later in
    # compressed image payloads, so only treat the structural header as fatal.
    if data.startswith(b"\xef\xbf\xbd"):
        raise FtpUploadCorruptedFileError(
            "Uploaded image header is corrupted (UTF-8 replacement bytes detected)."
        )

    detected_ext = _detect_image_extension(data)
    if not detected_ext:
        raise FtpUploadCorruptedFileError("Unsupported or invalid image file signature.")

    declared_ext = Path(filename or "").suffix.lower().lstrip(".")
    if declared_ext == "jpeg":
        declared_ext = "jpg"
    if declared_ext and declared_ext in {"jpg", "png", "gif", "webp"} and declared_ext != detected_ext:
        raise FtpUploadCorruptedFileError(
            f"Image extension does not match file bytes: .{declared_ext} vs .{detected_ext}."
        )

    if detected_ext == "png":
        if len(data) < 33 or data[12:16] != b"IHDR":
            raise FtpUploadCorruptedFileError("Invalid PNG IHDR chunk.")
        if b"\xef\xbf\xbd" in data[16:26]:
            raise FtpUploadCorruptedFileError(
                "Uploaded PNG IHDR metadata is corrupted (UTF-8 replacement bytes detected)."
            )
        width = int.from_bytes(data[16:20], "big", signed=False)
        height = int.from_bytes(data[20:24], "big", signed=False)
        bit_depth = data[24]
        color_type = data[25]
        if width <= 0 or height <= 0:
            raise FtpUploadCorruptedFileError("Invalid PNG dimensions.")
        if bit_depth not in {1, 2, 4, 8, 16} or color_type not in {0, 2, 3, 4, 6}:
            raise FtpUploadCorruptedFileError("Invalid PNG color metadata.")

    return detected_ext
