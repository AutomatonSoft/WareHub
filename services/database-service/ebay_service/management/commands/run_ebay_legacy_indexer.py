import logging
import os
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from ebay_service.client import EbayApiError
from ebay_service.credentials import EbayCredentialError, load_refresh_token
from ebay_service.listing_operations import index_all_legacy_listings


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Periodically index all active eBay legacy listing pages for configured accounts."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--poll-interval", type=float, default=_env_float("EBAY_LEGACY_INDEXER_POLL_INTERVAL_SECONDS", 3600.0))

    def handle(self, *args, **options):
        poll_interval = max(1.0, float(options["poll_interval"]))
        run_once = bool(options["once"])
        self.stdout.write(self.style.SUCCESS(f"eBay legacy indexer started (poll_interval={poll_interval}s)"))

        while True:
            close_old_connections()
            self._run_cycle()
            if run_once:
                return
            time.sleep(poll_interval)

    def _run_cycle(self):
        accounts = _configured_accounts()
        limit = _bounded_int("EBAY_LEGACY_INDEXER_PAGE_SIZE", default=100, minimum=1, maximum=100)
        max_pages = _bounded_int("EBAY_LEGACY_INDEXER_MAX_PAGES", default=10_000, minimum=1, maximum=10_000)
        page_delay_seconds = max(0.0, _env_float("EBAY_LEGACY_INDEXER_PAGE_DELAY_SECONDS", 0.25))

        for account in accounts:
            try:
                refresh_token = load_refresh_token(account=account)
            except EbayCredentialError:
                logger.warning("EBAY_LEGACY_INDEX_SKIP code=ebay_legacy_index_skip account=%s reason=invalid_credential", account)
                continue
            if not refresh_token:
                logger.info("EBAY_LEGACY_INDEX_SKIP code=ebay_legacy_index_skip account=%s reason=missing_credential", account)
                continue
            try:
                result = index_all_legacy_listings(
                    account=account,
                    marketplace_id="EBAY_DE",
                    limit=limit,
                    max_pages=max_pages,
                    page_delay_seconds=page_delay_seconds,
                )
            except EbayApiError as error:
                logger.warning(
                    "EBAY_LEGACY_INDEX_FAILED code=ebay_legacy_index_failed account=%s operation=%s status_code=%s",
                    account,
                    error.operation,
                    error.status_code,
                )
                continue
            except Exception:
                logger.exception("EBAY_LEGACY_INDEX_FAILED code=ebay_legacy_index_failed account=%s", account)
                continue

            logger.info(
                "EBAY_LEGACY_INDEX_COMPLETED code=ebay_legacy_index_completed account=%s pages_scanned=%s indexed_listings=%s indexed_eans=%s skipped_inventory_listings=%s",
                account,
                result["pages_scanned"],
                result["indexed_listings"],
                result["indexed_eans"],
                result["skipped_inventory_listings"],
            )


def _configured_accounts() -> list[str]:
    values = os.getenv("EBAY_LEGACY_INDEXER_ACCOUNTS", "jv,xl,dep").split(",")
    return list(dict.fromkeys(value.strip().lower() for value in values if value.strip()))


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _bounded_int(name: str, *, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return min(maximum, max(minimum, value))
