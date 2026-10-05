from ipaddress import ip_address
import socket
import time
from urllib.parse import unquote, urljoin, urlsplit

import certifi
from django.core.files.uploadedfile import SimpleUploadedFile
from urllib3 import HTTPConnectionPool, HTTPSConnectionPool, Timeout
from urllib3.exceptions import HTTPError


MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024
MAX_REMOTE_BATCH_BYTES = 50 * 1024 * 1024
MAX_REMOTE_IMAGES = 50
MAX_REDIRECTS = 3
DOWNLOAD_TIMEOUT_SECONDS = 20
CHUNK_BYTES = 64 * 1024


class RemoteImageError(ValueError):
    pass


def download_remote_image(source_url: str, index: int):
    deadline = time.monotonic() + DOWNLOAD_TIMEOUT_SECONDS
    current_url = source_url
    try:
        for redirect in range(MAX_REDIRECTS + 1):
            parsed = urlsplit(current_url)
            port = 443 if parsed.scheme == "https" else 80
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, port):
                raise RemoteImageError("Invalid public image URL.")
            addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
            if not addresses or any(not ip_address(entry[4][0]).is_global for entry in addresses):
                raise RemoteImageError("Private or non-public image addresses are not allowed.")
            options = {"port": port}
            pool_class = HTTPConnectionPool
            if parsed.scheme == "https":
                pool_class = HTTPSConnectionPool
                options.update(server_hostname=parsed.hostname, assert_hostname=parsed.hostname, cert_reqs="CERT_REQUIRED", ca_certs=certifi.where())
            pool = pool_class(addresses[0][4][0], **options)
            response = None
            try:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise RemoteImageError("Image download timed out.")
                response = pool.urlopen(
                    "GET", (parsed.path or "/") + (f"?{parsed.query}" if parsed.query else ""),
                    headers={"Host": parsed.hostname, "Accept": "image/*", "Accept-Encoding": "identity", "User-Agent": "WareHub/1.0 image-relay"},
                    timeout=Timeout(connect=min(3, remaining), read=min(3, remaining)),
                    retries=False, redirect=False, preload_content=False, assert_same_host=False,
                )
                if response.status in {301, 302, 303, 307, 308}:
                    location = response.headers.get("Location")
                    if not location or redirect == MAX_REDIRECTS:
                        raise RemoteImageError("Invalid or excessive image redirects.")
                    current_url = urljoin(current_url, location)
                    continue
                if response.status != 200:
                    raise RemoteImageError(f"Image server returned HTTP {response.status}.")
                if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                    raise RemoteImageError("Compressed image responses are not supported.")
                declared_size = response.headers.get("Content-Length")
                if declared_size and int(declared_size) > MAX_REMOTE_IMAGE_BYTES:
                    raise RemoteImageError("Image exceeds the 10 MiB download limit.")
                content = bytearray()
                while True:
                    if time.monotonic() >= deadline:
                        raise RemoteImageError("Image download timed out.")
                    chunk = response.read(CHUNK_BYTES, decode_content=False)
                    if not chunk:
                        break
                    content.extend(chunk)
                    if len(content) > MAX_REMOTE_IMAGE_BYTES:
                        raise RemoteImageError("Image exceeds the 10 MiB download limit.")
                if not content:
                    raise RemoteImageError("Image response is empty.")
                name = unquote(parsed.path.split("/")[-1]) or f"remote-image-{index + 1}.jpg"
                return SimpleUploadedFile(name, bytes(content), content_type=response.headers.get("Content-Type", "application/octet-stream"))
            finally:
                if response is not None:
                    response.close()
                pool.close()
    except RemoteImageError:
        raise
    except (OSError, ValueError, HTTPError) as exc:
        raise RemoteImageError("Cannot safely download the image.") from exc
