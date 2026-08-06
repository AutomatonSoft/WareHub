from __future__ import annotations

import asyncio
import atexit
import logging
import threading
from urllib.parse import urlparse

try:
    from playwright.async_api import Browser, Playwright, async_playwright
except ImportError:  # pragma: no cover - exercised when optional runtime is absent
    Browser = Playwright = None  # type: ignore[assignment,misc]
    async_playwright = None


logger = logging.getLogger(__name__)

OTTO_PRODUCT_HOSTS = {"otto.de", "www.otto.de"}
OTTO_IMAGE_HOST = "i.otto.de"
NAVIGATION_TIMEOUT_MS = 12_000
RESOLUTION_TIMEOUT_SECONDS = 15
MAX_CONCURRENT_PAGES = 2


def is_allowed_otto_product_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and (parsed.hostname or "").lower() in OTTO_PRODUCT_HOSTS


def is_allowed_otto_image_url(value: str | None) -> bool:
    if not value:
        return False
    parsed = urlparse(value)
    return parsed.scheme == "https" and (parsed.hostname or "").lower() == OTTO_IMAGE_HOST


def resolve_cached_or_otto_image(
    cached_image_url: str | None,
    otto_url: str,
    resolver: "OttoImageResolver",
) -> str | None:
    if is_allowed_otto_image_url(cached_image_url):
        return cached_image_url
    return resolver.resolve(otto_url) if otto_url else None


class OttoImageResolver:
    """Resolves and caches-safe reads of one OTTO PDP primary image per request."""

    def __init__(self) -> None:
        self._state_lock = threading.Lock()
        self._ready = threading.Event()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._page_semaphore: asyncio.Semaphore | None = None
        self._startup_error: Exception | None = None
        atexit.register(self.close)

    def resolve(self, otto_url: str) -> str | None:
        if not is_allowed_otto_product_url(otto_url):
            logger.warning("OTTO image resolver rejected a non-OTTO product URL")
            return None
        if not self._ensure_started() or not self._loop:
            return None

        future = asyncio.run_coroutine_threadsafe(self._resolve_in_browser(otto_url), self._loop)
        try:
            return future.result(timeout=RESOLUTION_TIMEOUT_SECONDS)
        except TimeoutError:
            future.cancel()
            logger.warning("OTTO image resolution timed out")
        except Exception:
            logger.exception("OTTO image resolution failed")
        return None

    def _ensure_started(self) -> bool:
        if async_playwright is None:
            logger.warning("OTTO image resolution is unavailable because Playwright is not installed")
            return False

        with self._state_lock:
            if self._thread and self._thread.is_alive():
                return self._startup_error is None
            self._ready.clear()
            self._startup_error = None
            self._thread = threading.Thread(target=self._run_loop, name="otto-image-resolver", daemon=True)
            self._thread.start()

        if not self._ready.wait(timeout=RESOLUTION_TIMEOUT_SECONDS):
            logger.warning("OTTO image resolver browser startup timed out")
            return False
        return self._startup_error is None and self._browser is not None

    def _run_loop(self) -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._loop = loop
        try:
            loop.run_until_complete(self._start_browser())
        except Exception as error:
            self._startup_error = error
            logger.warning("OTTO image resolver browser startup failed: %s", error)
        finally:
            self._ready.set()

        if self._startup_error is None:
            loop.run_forever()
        loop.run_until_complete(self._close_browser())
        loop.close()

    async def _start_browser(self) -> None:
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=True)
        self._page_semaphore = asyncio.Semaphore(MAX_CONCURRENT_PAGES)

    async def _resolve_in_browser(self, otto_url: str) -> str | None:
        if not self._browser or not self._page_semaphore:
            return None
        async with self._page_semaphore:
            page = await self._browser.new_page()
            try:
                await page.goto(otto_url, wait_until="domcontentloaded", timeout=NAVIGATION_TIMEOUT_MS)
                og_image = await page.evaluate(
                    "document.querySelector(\"meta[property='og:image']\")?.content || null"
                )
                if is_allowed_otto_image_url(og_image):
                    return og_image
                fallback_image = await page.evaluate(
                    "(() => { const image = document.querySelector('img.pdp_main-image__image'); return image?.currentSrc || image?.src || null; })()"
                )
                return fallback_image if is_allowed_otto_image_url(fallback_image) else None
            except Exception as error:
                logger.info("OTTO image resolution navigation failed: %s", error)
                return None
            finally:
                await page.close()

    async def _close_browser(self) -> None:
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

    def close(self) -> None:
        loop = self._loop
        thread = self._thread
        if not loop or not thread or not thread.is_alive():
            return
        loop.call_soon_threadsafe(loop.stop)
        thread.join(timeout=5)


_resolver = OttoImageResolver()


def get_otto_image_resolver() -> OttoImageResolver:
    return _resolver
