from django.core.management.base import BaseCommand
from django.db import transaction

from database.ftp_upload import normalize_managed_public_photo_value
from database.models import Kid


class Command(BaseCommand):
    help = "Normalize managed kid photo URLs to the current environment root (dev/stage/prod)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show how many rows would be updated without saving changes.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        updated = 0

        queryset = Kid.objects.only("id", "photo").iterator(chunk_size=500)

        with transaction.atomic():
            for kid in queryset:
                current_photo = kid.photo
                normalized_photo = normalize_managed_public_photo_value(current_photo)
                if normalized_photo == current_photo:
                    continue

                updated += 1
                self.stdout.write(f"normalize kid_id={kid.id}")
                if not dry_run:
                    kid.photo = normalized_photo
                    kid.save(update_fields=["photo"])

            if dry_run:
                transaction.set_rollback(True)

        mode = "dry-run" if dry_run else "updated"
        self.stdout.write(self.style.SUCCESS(f"{mode}: {updated} kid photo rows"))
