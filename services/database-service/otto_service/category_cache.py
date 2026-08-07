from __future__ import annotations

import os
import re
from datetime import UTC, datetime, timedelta
from typing import Any

from pymongo import ASCENDING, MongoClient, ReturnDocument, UpdateOne
from pymongo.errors import DuplicateKeyError


class OttoCategoryCache:
    FULL_SYNC_JOB_ID = "full_sync"
    FULL_SYNC_LEASE = timedelta(hours=2)

    def __init__(self) -> None:
        database_name = os.getenv("OTTO_CATEGORY_CACHE_MONGO_DATABASE", "warehub")
        host = os.getenv("OTTO_CATEGORY_CACHE_MONGO_HOST", "").strip()
        username = os.getenv("OTTO_CATEGORY_CACHE_MONGO_USERNAME", "").strip()
        password = os.getenv("OTTO_CATEGORY_CACHE_MONGO_PASSWORD", "")
        port = int(os.getenv("OTTO_CATEGORY_CACHE_MONGO_PORT", "27017"))
        if not host or not username or not password:
            raise RuntimeError("OTTO category cache is not configured.")
        self._client = MongoClient(
            host=host,
            port=port,
            username=username,
            password=password,
            authSource="admin",
            serverSelectionTimeoutMS=5000,
        )
        database = self._client[database_name]
        self._categories = database["otto_categories"]
        self._attributes = database["otto_category_attributes"]
        self._meta = database["otto_cache_metadata"]
        self._categories.create_index(
            [("search_name", ASCENDING), ("name", ASCENDING)],
            name="otto_categories_search_name_name",
        )

    def list_categories(self) -> list[dict[str, Any]]:
        return [
            {"id": str(row["_id"]), "name": row["name"]}
            for row in self._categories.find({}, {"name": 1}).sort("name", 1)
        ]

    def search_categories(
        self,
        *,
        query: str = "",
        selected_category_id: str = "",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        normalized_query = query.strip().lower()
        normalized_selected_id = selected_category_id.strip()

        if normalized_selected_id and not normalized_query:
            row = self._categories.find_one({"_id": normalized_selected_id}, {"name": 1})
            return [{"id": str(row["_id"]), "name": row["name"]}] if row else []

        if not normalized_query:
            return []

        prefix_pattern = f"^{re.escape(normalized_query)}"
        cursor = self._categories.find(
            {
                "$or": [
                    {"search_name": {"$regex": prefix_pattern}},
                    {
                        "search_name": {"$exists": False},
                        "name": {"$regex": prefix_pattern, "$options": "i"},
                    },
                ]
            },
            {"name": 1},
        ).sort("name", ASCENDING).limit(limit)
        return [{"id": str(row["_id"]), "name": row["name"]} for row in cursor]

    def attributes(self, category_id: str) -> list[dict[str, Any]] | None:
        row = self._attributes.find_one({"_id": category_id}, {"_id": 0, "attributes": 1})
        return row.get("attributes", []) if row else None

    def category_ids(self) -> list[str]:
        return [str(row["_id"]) for row in self._categories.find({}, {"_id": 1})]

    def has_attributes(self, category_id: str) -> bool:
        return self._attributes.find_one({"_id": category_id}, {"_id": 1}) is not None

    def categories_due(self, interval_days: int = 30) -> bool:
        row = self._meta.find_one({"_id": "categories"}) or {}
        refreshed = row.get("refreshed_at")
        if not isinstance(refreshed, datetime):
            return True
        if refreshed.tzinfo is None:
            refreshed = refreshed.replace(tzinfo=UTC)
        return refreshed < datetime.now(UTC) - timedelta(days=interval_days)

    def replace_categories(self, categories: list[dict[str, Any]]) -> int:
        now = datetime.now(UTC)
        operations = []
        ids = []
        for raw in categories:
            category_id = str(raw.get("id") or raw.get("categoryId") or "").strip()
            name = str(raw.get("name") or raw.get("category") or raw.get("label") or "").strip()
            if not category_id or not name:
                continue
            ids.append(category_id)
            operations.append(UpdateOne(
                {"_id": category_id},
                {"$set": {"name": name, "search_name": name.lower(), "raw": raw, "synced_at": now}},
                upsert=True,
            ))
        if operations:
            self._categories.bulk_write(operations, ordered=False)
        self._categories.delete_many({"_id": {"$nin": ids}})
        self._meta.update_one({"_id": "categories"}, {"$set": {"refreshed_at": now, "count": len(ids)}}, upsert=True)
        return len(ids)

    def store_attributes(self, category_id: str, attributes: list[dict[str, Any]]) -> None:
        self._attributes.update_one({"_id": category_id}, {"$set": {"attributes": attributes, "synced_at": datetime.now(UTC)}}, upsert=True)

    def full_sync_status(self) -> dict[str, Any]:
        return self._meta.find_one({"_id": self.FULL_SYNC_JOB_ID}) or {}

    def claim_full_sync(self) -> dict[str, Any] | None:
        now = datetime.now(UTC)
        try:
            job = self._meta.find_one_and_update(
                {
                    "_id": self.FULL_SYNC_JOB_ID,
                    "$or": [
                        {"status": {"$ne": "running"}},
                        {"lease_expires_at": {"$lt": now}},
                    ],
                },
                {
                    "$set": {
                        "status": "running",
                        "phase": "categories",
                        "total": 0,
                        "completed": 0,
                        "cached": 0,
                        "failed": 0,
                        "message": "Refreshing OTTO categories.",
                        "started_at": now,
                        "updated_at": now,
                        "lease_expires_at": now + self.FULL_SYNC_LEASE,
                    },
                    "$unset": {"finished_at": "", "error": ""},
                },
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError:
            return None
        return job

    def update_full_sync(self, **fields: Any) -> None:
        now = datetime.now(UTC)
        fields["updated_at"] = now
        fields["lease_expires_at"] = now + self.FULL_SYNC_LEASE
        self._meta.update_one({"_id": self.FULL_SYNC_JOB_ID}, {"$set": fields})

    def complete_full_sync(self, **fields: Any) -> None:
        now = datetime.now(UTC)
        fields.update({"status": "completed", "phase": "completed", "updated_at": now, "finished_at": now})
        self._meta.update_one(
            {"_id": self.FULL_SYNC_JOB_ID},
            {"$set": fields, "$unset": {"lease_expires_at": ""}},
        )

    def fail_full_sync(self, error: str) -> None:
        now = datetime.now(UTC)
        self._meta.update_one(
            {"_id": self.FULL_SYNC_JOB_ID},
            {
                "$set": {
                    "status": "failed",
                    "phase": "failed",
                    "error": error,
                    "updated_at": now,
                    "finished_at": now,
                },
                "$unset": {"lease_expires_at": ""},
            },
        )
