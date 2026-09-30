from concurrent.futures import ThreadPoolExecutor
from ipaddress import ip_address
import socket
import time
from urllib.parse import urlsplit

import certifi
from PIL import Image, ImageFile
from urllib3 import HTTPSConnectionPool, Timeout
from urllib3.exceptions import HTTPError

from .client import EbayApiError


MIN_IMAGE_SIDE = 500
MAX_IMAGES = 24
MAX_HEADER_BYTES = 256 * 1024
CHECK_TIMEOUT_SECONDS = 20


def _image_dimensions(url: str, *, deadline: float) -> tuple[int, int]:
    pool = None
    response = None
    try:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
            raise ValueError("invalid_https_url")
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ip_address(entry[4][0]).is_global for entry in addresses):
            raise ValueError("non_public_address")
        pool = HTTPSConnectionPool(
            addresses[0][4][0], port=443, server_hostname=parsed.hostname,
            assert_hostname=parsed.hostname, cert_reqs="CERT_REQUIRED", ca_certs=certifi.where(),
        )
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError("image_check_timeout")
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        response = pool.urlopen(
            "GET", path,
            headers={"Host": parsed.hostname, "Accept-Encoding": "identity"},
            timeout=Timeout(connect=min(3, remaining), read=min(3, remaining)),
            retries=False, redirect=False, preload_content=False, assert_same_host=False,
        )
        if response.status != 200:
            raise ValueError(f"http_{response.status}")
        parser = ImageFile.Parser()
        for _chunk in range(MAX_HEADER_BYTES // 8192):
            if time.monotonic() >= deadline:
                raise ValueError("image_check_timeout")
            chunk = response.read(8192, decode_content=False)
            if not chunk:
                break
            parser.feed(chunk)
            if parser.image:
                return parser.image.size
        raise ValueError("unreadable_image_dimensions")
    except (OSError, ValueError, HTTPError, Image.DecompressionBombError) as exc:
        reason = str(exc) if isinstance(exc, ValueError) else "image_download_failed"
        raise EbayApiError(
            "Cannot verify an eBay image. Publication was stopped; check the image URL.",
            status_code=400, operation="validate_inventory_images",
            details={"url": url, "reason": reason},
        ) from exc
    finally:
        if response is not None:
            response.close()
        if pool is not None:
            pool.close()


def prepare_inventory_images(item: dict) -> tuple[dict, dict]:
    product = item.get("product") if isinstance(item, dict) else None
    if not isinstance(product, dict):
        raise EbayApiError("An eBay product with image URLs is required.", status_code=400, operation="validate_inventory_images")
    urls = product.get("imageUrls")
    if not isinstance(urls, list) or not urls or any(not isinstance(url, str) or not url.strip() for url in urls):
        raise EbayApiError("At least one eBay image URL is required.", status_code=400, operation="validate_inventory_images")
    unique_urls = []
    removed = []
    seen = set()
    for original in urls:
        url = original.strip()
        if url in seen:
            removed.append({"url": url, "reason": "duplicate"})
        else:
            seen.add(url)
            unique_urls.append(url)
    if len(unique_urls) > MAX_IMAGES:
        raise EbayApiError("An eBay listing supports at most 24 unique images.", status_code=400, operation="validate_inventory_images")
    deadline = time.monotonic() + CHECK_TIMEOUT_SECONDS
    with ThreadPoolExecutor(max_workers=4) as executor:
        sizes = list(executor.map(lambda url: _image_dimensions(url, deadline=deadline), unique_urls))
    kept = []
    for url, (width, height) in zip(unique_urls, sizes):
        if max(width, height) < MIN_IMAGE_SIDE:
            removed.append({"url": url, "reason": "too_small", "width": width, "height": height})
        else:
            kept.append(url)
    report = {"kept_count": len(kept), "removed_images": removed}
    if not kept:
        raise EbayApiError(
            "No suitable eBay images remain. Add a photo with a longest side of at least 500 pixels.",
            status_code=400, operation="validate_inventory_images", details=report,
        )
    return {**item, "product": {**product, "imageUrls": kept}}, report
