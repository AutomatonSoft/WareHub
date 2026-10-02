import logging
import time

from django.core.management.base import BaseCommand, CommandError

from jv_services.gallery_mapping_jobs import mapping_database, missing_configuration, run_next_mapping
from jv_services.gallery_mapping_store import GalleryMappingStore
from jv_services.aftercool_gallery_client import AftercoolGalleryClient

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Process durable Aftercool JV–XL mapping jobs queued by administrators."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        if options["once"] and missing_configuration():
            raise CommandError("Missing mapping configuration: " + ", ".join(missing_configuration()))
        self.stdout.write("Aftercool mapping worker started.")
        indexes_ready = False
        while True:
            missing = missing_configuration()
            if missing:
                logger.warning("AFTERCOOL_MAPPING_WORKER_WAITING missing=%s", ",".join(missing))
                time.sleep(60)
                continue
            try:
                with mapping_database() as database:
                    if not indexes_ready:
                        GalleryMappingStore(database, source_url=AftercoolGalleryClient.base_url,
                                            dataset="lister").prepare_lookup_indexes()
                        indexes_ready = True
                    processed = run_next_mapping(database)
                if processed:
                    logger.info("AFTERCOOL_MAPPING_JOB_PROCESSED")
            except Exception as exc:
                logger.error("AFTERCOOL_MAPPING_WORKER_FAILED error_type=%s", type(exc).__name__)
                if options["once"]:
                    raise CommandError("Mapping worker failed; check storage configuration.") from None
            if options["once"]:
                return
            time.sleep(2)
