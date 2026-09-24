from django.core.management.base import BaseCommand, CommandError

from ebay_service.client import EbayApiError, EbayOAuthClient
from ebay_service.location_sync import plan_location_copy


JV_LOCATION_KEYS = {
    "BE_1050", "BG_Burgrieden", "DE_3", "DE_83483", "DE_88438", "DE_88483",
    "DE_88487", "DE_88843", "DE_Burgrieden", "DE_Mietingen, Baden-Württemberg",
    "ES_28046", "FR_75001", "GB_EC1V 2NX", "GB_EC1V2NX", "IT_20124",
    "NL_1082", "PL_50043",
}
EXCLUDED_LOCATION_KEYS = {
    "BG_Burgrieden", "DE_3", "DE_Burgrieden", "DE_Mietingen, Baden-Württemberg",
    "NL_1082",
}


class Command(BaseCommand):
    help = "Preview or copy valid JV eBay warehouse locations to XL and DEP."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Create missing locations after reviewing the dry-run output.")

    def handle(self, *args, **options):
        try:
            client = EbayOAuthClient()
            plan = plan_location_copy(client, expected_keys=JV_LOCATION_KEYS, excluded_keys=EXCLUDED_LOCATION_KEYS)
            for key in sorted(EXCLUDED_LOCATION_KEYS):
                self.stdout.write(f"excluded {key}")
            for entry in plan:
                self.stdout.write(f"{entry['action']} {entry['account']} {entry['key']} name={entry['name']} address={entry['address']}")
            if not options["apply"]:
                self.stdout.write("Dry run only. Pass --apply after reviewing the locations.")
                return
            for entry in plan:
                if entry["action"] == "skip":
                    continue
                client.create_inventory_location(
                    account=entry["account"], merchant_location_key=entry["key"],
                    name=entry["name"], address=entry["address"],
                )
                self.stdout.write(self.style.SUCCESS(f"created {entry['account']} {entry['key']}"))
        except EbayApiError as error:
            raise CommandError(str(error)) from error
