import os
import time
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from contextlib import closing

from django.core.management.base import BaseCommand, CommandError
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from jv_services.aftercool_gallery_client import AftercoolGalleryClient
from jv_services.gallery_mapping import match_gallery
from jv_services.gallery_mapping_store import GalleryMappingStore


class Command(BaseCommand):
    help = "Map JV to XL by exact GalleryURL. Defaults to a read-only sample."

    def add_arguments(self, parser):
        parser.add_argument("--write", action="store_true")
        parser.add_argument("--max-products", type=int, default=10)
        parser.add_argument("--dataset", default="lister")
        parser.add_argument("--page-size", type=int, default=500)
        parser.add_argument("--workers", type=int, default=3)

    def handle(self, *args, **options):
        maximum = options["max_products"]
        page_size = options["page_size"]
        workers = options["workers"]
        if not 1 <= workers <= 3:
            raise CommandError("workers must be between 1 and 3.")
        if not 1 <= page_size <= 500:
            raise CommandError("page-size must be between 1 and 500.")
        if maximum < 0:
            raise CommandError("max-products must be nonnegative; 0 means all.")
        username, password = os.getenv("AFTERCOOL_USERNAME"), os.getenv("AFTERCOOL_PASSWORD")
        if not username or not password:
            raise CommandError("Set AFTERCOOL_USERNAME and AFTERCOOL_PASSWORD in the environment.")
        client = mongo = store = None
        owner = uuid4().hex
        locked = False
        try:
            if options["write"]:
                uri, database = os.getenv("JV_XL_MAPPING_MONGO_URI"), os.getenv("JV_XL_MAPPING_MONGO_DATABASE")
                if not uri or not database:
                    raise CommandError("Explicit JV_XL_MAPPING_MONGO_URI and JV_XL_MAPPING_MONGO_DATABASE required.")
                mongo_username = os.getenv("JV_XL_MAPPING_MONGO_USERNAME")
                mongo_password = os.getenv("JV_XL_MAPPING_MONGO_PASSWORD")
                if bool(mongo_username) != bool(mongo_password):
                    raise CommandError("Both MongoDB username and password are required when using separate credentials.")
                credentials = {"username": mongo_username, "password": mongo_password} if mongo_username else {}
                mongo = MongoClient(uri, serverSelectionTimeoutMS=5000, timeoutMS=10000, **credentials)
                store = GalleryMappingStore(mongo[database], source_url=AftercoolGalleryClient.base_url,
                                            dataset=options["dataset"])
                now = datetime.now(UTC)
                try:
                    store.progress.update_one(
                        {"_id": store.scope_id, "$or": [{"lease_until": {"$lt": now}}, {"lease_until": {"$exists": False}}]},
                        {"$set": {"owner": owner, "lease_until": now + timedelta(minutes=10)},
                         "$setOnInsert": {"next_offset": 0}}, upsert=True,
                    )
                except DuplicateKeyError:
                    raise CommandError("Another mapping worker holds the lease.") from None
                locked = True
            client = AftercoolGalleryClient(username, password, options["dataset"])
            if store:
                store.prepare_cache()
                state = store.progress.find_one({"_id": store.scope_id}) or {}
                if not state.get("jv_complete"):
                    with closing(client.iter_product_pages("jv", state.get("jv_offset", 0), page_size, workers=workers)) as pages:
                        for page_offset, products, more in pages:
                            self._renew(store, owner)
                            store.cache_jv_page(products, page_offset, more)
                            self.stdout.write(f"phase=jv_cache next_offset={page_offset + len(products)}")
                state = store.progress.find_one({"_id": store.scope_id}) or {}
                xl_offset = state.get("xl_offset", 0)
                if not state.get("xl_complete"):
                    with closing(client.iter_product_pages("xl", xl_offset, page_size, workers=workers)) as pages:
                        for page_offset, products, more in pages:
                            self._renew(store, owner)
                            store.cache_xl_page(products, page_offset, more)
                            self.stdout.write(f"phase=xl_cache next_offset={page_offset + len(products)}")
                state = store.progress.find_one({"_id": store.scope_id}) or {}
                offset = state.get("jv_first_next_offset", 0)
            else:
                offset = 0
            processed = 0
            if store:
                while not maximum or processed < maximum:
                    self._renew(store, owner)
                    limit = min(page_size, maximum - processed) if maximum else page_size
                    products = store.get_jv_page(offset, limit)
                    if not products:
                        break
                    store.map_cached_page(products, offset)
                    offset += len(products)
                    processed += len(products)
                    self.stdout.write(f"phase=jv_mapping processed={processed} next_offset={offset}")
                self.stdout.write(f"processed={processed} next_offset={offset} write=True")
                return
            while not maximum or processed < maximum:
                product = client.get_product(offset)
                if product is None:
                    break
                candidates = client.find_candidates(product.gallery_url) if product.gallery_url else ()
                result = match_gallery(product, candidates)
                self.stdout.write(f"offset={offset} reason={result.reason}")
                offset += 1
                processed += 1
                if processed % 100 == 0:
                    self.stdout.write(f"processed={processed} next_offset={offset}")
                time.sleep(0.2)
            self.stdout.write(f"processed={processed} next_offset={offset} write={options['write']}")
        except CommandError:
            raise
        except Exception as exc:
            raise CommandError(f"Mapping stopped ({type(exc).__name__}); retry resumes the saved checkpoint.") from None
        finally:
            if client:
                client.close()
            if locked:
                store.progress.update_one({"_id": store.scope_id, "owner": owner},
                                          {"$unset": {"owner": "", "lease_until": ""}})
            if mongo:
                mongo.close()

    def _renew(self, store, owner):
        now = datetime.now(UTC)
        renewed = store.progress.update_one(
            {"_id": store.scope_id, "owner": owner, "lease_until": {"$gt": now}},
            {"$set": {"lease_until": now + timedelta(minutes=10)}},
        )
        if renewed.matched_count != 1:
            raise CommandError("Mapping lease lost.")
