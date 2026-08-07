from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from time import sleep

from django.core.management.base import BaseCommand, CommandError

from otto_service.category_cache import OttoCategoryCache
from otto_service.external_requests import OttoExternalAPIError, OttoExternalProductsClient


class Command(BaseCommand):
    help = "Fetch OTTO attributes for cached categories and store them in MongoDB."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--force",
            action="store_true",
            help="Refresh categories that already have attributes in MongoDB.",
        )
        parser.add_argument(
            "--delay-ms",
            type=int,
            default=0,
            help="Delay before each OTTO request in milliseconds (default: 0).",
        )
        parser.add_argument(
            "--workers",
            type=int,
            default=8,
            help="Concurrent OTTO requests (default: 8, maximum: 16).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Process at most this many categories; useful for a smoke check.",
        )

    def handle(self, *args, **options) -> None:
        delay_ms = options["delay_ms"]
        limit = options["limit"]
        workers = options["workers"]
        if delay_ms < 0:
            raise CommandError("--delay-ms must be zero or greater.")
        if limit is not None and limit < 1:
            raise CommandError("--limit must be one or greater.")
        if not 1 <= workers <= 16:
            raise CommandError("--workers must be between 1 and 16.")

        cache = OttoCategoryCache()
        category_ids = cache.category_ids()
        if limit is not None:
            category_ids = category_ids[:limit]
        if not category_ids:
            raise CommandError("No OTTO categories are cached. Run the category sync first.")

        targets = [
            category_id
            for category_id in category_ids
            if options["force"] or not cache.has_attributes(category_id)
        ]
        skipped = len(category_ids) - len(targets)
        refreshed = failed = 0
        delay_seconds = delay_ms / 1000
        total = len(category_ids)

        def sync_category(category_id: str) -> tuple[str, str]:
            try:
                if delay_seconds > 0:
                    sleep(delay_seconds)
                payload = OttoExternalProductsClient().fetch_attributes(category_id=category_id)
                cache.store_attributes(category_id, payload["attributes"])
            except OttoExternalAPIError as error:
                return category_id, str(error)
            return category_id, ""

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [executor.submit(sync_category, category_id) for category_id in targets]
            for completed, future in enumerate(as_completed(futures), start=1):
                category_id, error = future.result()
                if error:
                    failed += 1
                    self.stderr.write(f"category {category_id}: {error}")
                else:
                    refreshed += 1
                if completed % 25 == 0 or completed == len(targets):
                    self.stdout.write(f"Progress: {completed}/{len(targets)} processed.")

        self.stdout.write(
            self.style.SUCCESS(
                f"OTTO attribute sync complete: cached={refreshed}, skipped={skipped}, failed={failed}, total={total}."
            )
        )
        if failed:
            raise CommandError("One or more OTTO attribute requests failed; rerun the command to retry them.")
