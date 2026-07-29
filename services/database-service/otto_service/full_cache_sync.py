from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from threading import Lock
from typing import Any

from pymongo.errors import PyMongoError

from .category_cache import OttoCategoryCache
from .external_requests import OttoExternalAPIError, OttoExternalProductsClient

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OttoFullCacheSyncSettings:
    category_page_size: int
    category_max_pages: int
    attribute_workers: int

    @classmethod
    def from_environment(cls) -> "OttoFullCacheSyncSettings":
        return cls(
            category_page_size=int(os.getenv("OTTO_CATEGORY_SYNC_PAGE_SIZE", "2000")),
            category_max_pages=int(os.getenv("OTTO_CATEGORY_SYNC_MAX_PAGES", "1000")),
            attribute_workers=min(max(int(os.getenv("OTTO_ATTRIBUTE_SYNC_WORKERS", "8")), 1), 16),
        )


class OttoFullCacheSyncService:
    def __init__(self, cache: OttoCategoryCache | None = None, settings: OttoFullCacheSyncSettings | None = None) -> None:
        self._cache = cache or OttoCategoryCache()
        self._settings = settings or OttoFullCacheSyncSettings.from_environment()

    def status(self) -> dict[str, Any]:
        return self._cache.full_sync_status()

    def start(self) -> tuple[bool, dict[str, Any]]:
        job = self._cache.claim_full_sync()
        if job is None:
            return False, self._cache.full_sync_status()
        _job_executor.submit(self.run)
        return True, job

    def run(self) -> None:
        try:
            categories = OttoExternalProductsClient().fetch_all_categories(
                page_size=self._settings.category_page_size,
                max_pages=self._settings.category_max_pages,
            )
            category_count = self._cache.replace_categories(categories)
            category_ids = self._cache.category_ids()
            self._cache.update_full_sync(
                phase="attributes",
                total=len(category_ids),
                completed=0,
                cached=0,
                failed=0,
                category_count=category_count,
                message="Refreshing OTTO category attributes.",
            )
            self._sync_attributes(category_ids)
        except (OttoExternalAPIError, PyMongoError, RuntimeError, ValueError) as error:
            logger.exception("OTTO full cache sync failed")
            self._cache.fail_full_sync(str(error))
        except Exception:
            logger.exception("OTTO full cache sync failed unexpectedly")
            self._cache.fail_full_sync("OTTO full cache sync failed unexpectedly.")

    def _sync_attributes(self, category_ids: list[str]) -> None:
        if not category_ids:
            self._cache.complete_full_sync(message="No OTTO categories were returned.")
            return

        cached = failed = 0
        with ThreadPoolExecutor(max_workers=self._settings.attribute_workers) as executor:
            futures = [executor.submit(self._sync_category_attributes, category_id) for category_id in category_ids]
            for completed, future in enumerate(as_completed(futures), start=1):
                error = future.result()
                if error:
                    failed += 1
                else:
                    cached += 1
                self._cache.update_full_sync(completed=completed, cached=cached, failed=failed)

        self._cache.complete_full_sync(
            completed=len(category_ids),
            cached=cached,
            failed=failed,
            message="OTTO categories and attributes are up to date.",
        )

    def _sync_category_attributes(self, category_id: str) -> str:
        try:
            payload = OttoExternalProductsClient().fetch_attributes(category_id=category_id)
            self._cache.store_attributes(category_id, payload["attributes"])
        except OttoExternalAPIError as error:
            logger.warning("OTTO attributes sync failed for category %s: %s", category_id, error)
            return str(error)
        return ""


_job_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="otto-full-cache-sync")
_service_lock = Lock()
_service: OttoFullCacheSyncService | None = None


def get_otto_full_cache_sync_service() -> OttoFullCacheSyncService:
    global _service
    with _service_lock:
        if _service is None:
            _service = OttoFullCacheSyncService()
        return _service
