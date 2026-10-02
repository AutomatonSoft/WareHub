from datetime import UTC, datetime
from hashlib import sha256
import json

from pymongo.database import Database
from pymongo import UpdateOne
from pymongo.collation import Collation

from .gallery_mapping import GalleryMapping, GalleryProduct, match_gallery


class GalleryMappingStore:
    def __init__(self, database: Database, *, source_url: str, dataset: str, factory_id: str = ""):
        if not source_url or not dataset:
            raise ValueError("Aftercool source URL and dataset are required.")
        self.scope = {"source_url": source_url, "dataset": dataset, "factory_id": factory_id}
        self.scope_id = sha256(json.dumps(self.scope, sort_keys=True).encode()).hexdigest()
        self.rows = database["jv_xl_product_mapping"]
        self.progress = database["jv_xl_product_mapping_progress"]
        self.xl_cache = database["jv_xl_gallery_cache"]

    def prepare_cache(self):
        self.xl_cache.create_index([("scope_id", 1), ("gallery_url", 1)], collation=Collation("simple"))
        self.rows.create_index([("scope_id", 1), ("jv_position", 1)])

    def cache_jv_page(self, products, offset, has_more):
        operations = []
        for position, product in enumerate(products, offset):
            if product.account != "jv":
                raise ValueError("JV cache requires JV products.")
            operations.append(self._operation(GalleryMapping(product, None, "lookup_pending"), position))
        if operations:
            self.rows.bulk_write(operations, ordered=True)
        self.progress.update_one({"_id": self.scope_id}, {"$set": {
            "jv_offset": offset + len(products), "jv_complete": not has_more,
        }}, upsert=True)

    def get_jv_page(self, offset, limit):
        state = self.progress.find_one({"_id": self.scope_id}) or {}
        if not state.get("jv_complete"):
            raise ValueError("JV cache is incomplete.")
        end = min(offset + limit, state["jv_offset"])
        rows = list(self.rows.find({"scope_id": self.scope_id, "jv_position": {"$gte": offset, "$lt": end}},
                                  {"jv_position": 1, "jv_source_id": 1, "jv_ean": 1, "gallery_url": 1})
                    .sort("jv_position", 1).limit(limit))
        if [row["jv_position"] for row in rows] != list(range(offset, end)):
            raise ValueError("JV cache contains a gap; mapping stopped.")
        return [GalleryProduct(row["jv_source_id"], "jv", row.get("jv_ean"), row.get("gallery_url")) for row in rows]

    def cache_xl_page(self, products, offset, has_more):
        operations = []
        for position, product in enumerate(products, offset):
            if product.account != "xl":
                raise ValueError("XL cache requires XL products.")
            operations.append(UpdateOne({"_id": f"{self.scope_id}:{position}"}, {"$set": {
                "scope_id": self.scope_id, "source_id": product.source_id,
                "ean": product.ean, "gallery_url": product.gallery_url,
            }}, upsert=True))
        if operations:
            self.xl_cache.bulk_write(operations, ordered=True)
        self.progress.update_one({"_id": self.scope_id}, {"$set": {
            "xl_offset": offset + len(products), "xl_complete": not has_more,
        }}, upsert=True)

    def map_cached_page(self, products, offset):
        state = self.progress.find_one({"_id": self.scope_id}) or {}
        if not state.get("xl_complete"):
            raise ValueError("XL cache is incomplete.")
        urls = list({product.gallery_url for product in products if product.gallery_url})
        candidates_by_url = {}
        if urls:
            rows = self.xl_cache.aggregate([
                {"$match": {"scope_id": self.scope_id, "gallery_url": {"$in": urls}}},
                {"$group": {"_id": "$gallery_url", "count": {"$sum": 1},
                            "source_id": {"$first": "$source_id"}, "ean": {"$first": "$ean"}}},
            ], collation=Collation("simple"), maxTimeMS=10000)
            for row in rows:
                candidate = GalleryProduct(row["source_id"], "xl", row.get("ean"), row["_id"])
                candidates_by_url[row["_id"]] = [candidate] * min(row["count"], 2)
        operations = []
        for product in products:
            candidates = candidates_by_url.get(product.gallery_url, ())
            mapping = match_gallery(product, candidates)
            operations.append(self._operation(mapping))
        if operations:
            self.rows.bulk_write(operations, ordered=True)
        self.progress.update_one({"_id": self.scope_id}, {"$set": {
            "jv_first_next_offset": offset + len(products), "updated_at": datetime.now(UTC),
        }}, upsert=True)

    def save(self, mapping: GalleryMapping) -> None:
        self.rows.bulk_write([self._operation(mapping)], ordered=True)

    def _operation(self, mapping: GalleryMapping, position=None):
        product = mapping.product
        row_id = sha256(json.dumps([self.scope_id, product.source_id]).encode()).hexdigest()
        now = datetime.now(UTC)
        return UpdateOne(
            {"_id": row_id},
            {
                "$set": {
                    **self.scope,
                    "scope_id": self.scope_id,
                    **({"jv_position": position} if position is not None else {}),
                    "jv_source_id": product.source_id,
                    "jv_ean": product.ean,
                    "gallery_url": product.gallery_url,
                    "xl_ean": mapping.xl_ean,
                    "reason": mapping.reason,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

    def next_offset(self) -> int:
        state = self.progress.find_one({"_id": self.scope_id})
        offset = state["next_offset"] if state else 0
        if type(offset) is not int or offset < 0:
            raise ValueError("Invalid mapping checkpoint.")
        return offset

    def checkpoint(self, next_offset: int) -> None:
        if type(next_offset) is not int or next_offset < 0:
            raise ValueError("Invalid mapping checkpoint.")
        self.progress.update_one(
            {"_id": self.scope_id},
            {"$set": {**self.scope, "next_offset": next_offset, "updated_at": datetime.now(UTC)}},
            upsert=True,
        )
