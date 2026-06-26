from django.core.management.base import BaseCommand

from ...kid_sheet_image_import import DEFAULT_SHEET_URL, DEFAULT_TIMEOUT_SEC, import_sheet_images


class Command(BaseCommand):
    help = "Import product images from a public Google Sheet into matching Kid.photo records."

    def add_arguments(self, parser):
        parser.add_argument("--sheet-url", default=DEFAULT_SHEET_URL, help="Public Google Sheet edit URL.")
        parser.add_argument(
            "--include-existing-photos",
            action="store_true",
            help="Also append imported images to kids that already have local photos.",
        )
        parser.add_argument("--limit", type=int, default=None, help="Process only the first N unique KIDs from the sheet.")
        parser.add_argument("--dry-run", action="store_true", help="Preview matches without uploading or saving.")
        parser.add_argument(
            "--timeout-sec",
            type=int,
            default=DEFAULT_TIMEOUT_SEC,
            help="HTTP timeout for sheet and image downloads.",
        )
        parser.add_argument(
            "--retry-rounds",
            type=int,
            default=3,
            help="How many full retry rounds to run for failed image downloads.",
        )
        parser.add_argument(
            "--retry-sleep-sec",
            type=float,
            default=1.0,
            help="Pause between retry rounds for failed image downloads.",
        )
        parser.add_argument(
            "--retry-until-done",
            action="store_true",
            help="Keep retrying failed downloads until all succeed or progress stops for several rounds.",
        )
        parser.add_argument(
            "--max-stalled-rounds",
            type=int,
            default=3,
            help="Stop retry-until-done mode after this many consecutive retry rounds with zero successful imports.",
        )

    def handle(self, *args, **options):
        stats, messages = import_sheet_images(
            sheet_url=options["sheet_url"],
            skip_existing_photos=not options["include_existing_photos"],
            limit=options["limit"],
            dry_run=options["dry_run"],
            timeout_sec=options["timeout_sec"],
            retry_rounds=options["retry_rounds"],
            retry_sleep_sec=options["retry_sleep_sec"],
            retry_until_done=options["retry_until_done"],
            max_stalled_rounds=options["max_stalled_rounds"],
        )
        for message in messages:
            self.stdout.write(message)
        self.stdout.write(self.style.SUCCESS(f"Done: {stats.to_dict()}"))
