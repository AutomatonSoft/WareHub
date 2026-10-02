import os
import logging
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from django.core.management import call_command
from pymongo import MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError

from .aftercool_gallery_client import AftercoolGalleryClient
from .gallery_mapping_store import GalleryMappingStore
from .management.commands.map_jv_xl_gallery import GalleryMappingCommandError

logger = logging.getLogger(__name__)

JOB_KEY = "lister"
LEASE_DURATION = timedelta(minutes=10)
REQUIRED_ENV = ("AFTERCOOL_USERNAME", "AFTERCOOL_PASSWORD", "JV_XL_MAPPING_MONGO_URI",
                "JV_XL_MAPPING_MONGO_DATABASE")


def missing_configuration():
    missing = [key for key in REQUIRED_ENV if not os.getenv(key)]
    if bool(os.getenv("JV_XL_MAPPING_MONGO_USERNAME")) != bool(os.getenv("JV_XL_MAPPING_MONGO_PASSWORD")):
        missing.append("JV_XL_MAPPING_MONGO_USERNAME / JV_XL_MAPPING_MONGO_PASSWORD")
    return missing


@contextmanager
def mapping_database():
    if any(key.startswith("JV_XL_MAPPING_") for key in missing_configuration()):
        raise ValueError("Aftercool mapping configuration is incomplete.")
    credentials = {}
    if os.getenv("JV_XL_MAPPING_MONGO_USERNAME"):
        credentials = {"username": os.environ["JV_XL_MAPPING_MONGO_USERNAME"],
                       "password": os.environ["JV_XL_MAPPING_MONGO_PASSWORD"]}
    with MongoClient(os.environ["JV_XL_MAPPING_MONGO_URI"], timeoutMS=10000,
                     serverSelectionTimeoutMS=5000, **credentials) as client:
        yield client[os.environ["JV_XL_MAPPING_MONGO_DATABASE"]]


def enqueue_mapping(database):
    now = datetime.now(UTC)
    job_id = uuid4().hex
    try:
        database.jv_xl_mapping_jobs.update_one(
            {"_id": JOB_KEY, "status": {"$nin": ["queued", "running"]}},
            {"$set": {"job_id": job_id, "status": "queued", "phase": "queued",
                      "error": None, "updated_at": now, "created_at": now},
             "$unset": {"lease_until": ""}}, upsert=True,
        )
    except DuplicateKeyError:
        return False
    return True


def mapping_status(database):
    job = database.jv_xl_mapping_jobs.find_one({"_id": JOB_KEY}) or {}
    store = GalleryMappingStore(database, source_url=AftercoolGalleryClient.base_url, dataset=JOB_KEY)
    progress = store.progress.find_one({"_id": store.scope_id}) or {}
    lease = job.get("lease_until")
    return {"job_id": job.get("job_id"), "status": job.get("status", "idle"),
            "phase": job.get("phase", "idle"), "error": job.get("error"),
            "updated_at": job.get("updated_at"),
            "recovering": bool(lease and lease.replace(tzinfo=UTC) < datetime.now(UTC)
                               and job.get("status") == "running"),
            "jv_loaded": progress.get("jv_offset", 0), "xl_loaded": progress.get("xl_offset", 0),
            "mapped": progress.get("jv_first_next_offset", 0),
            "jv_complete": progress.get("jv_complete", False),
            "xl_complete": progress.get("xl_complete", False)}


def run_next_mapping(database):
    now = datetime.now(UTC)
    job = database.jv_xl_mapping_jobs.find_one_and_update(
        {"_id": JOB_KEY, "$or": [{"status": "queued"},
                                  {"status": "running", "lease_until": {"$lt": now}}]},
        {"$set": {"status": "running", "updated_at": now, "lease_until": now + LEASE_DURATION}},
        return_document=ReturnDocument.AFTER,
    )
    if not job:
        return False
    owner = {"_id": JOB_KEY, "job_id": job["job_id"], "status": "running",
             "lease_until": now + LEASE_DURATION}

    class ProgressOutput:
        def write(self, message):
            phase = next((part[6:] for part in message.split() if part.startswith("phase=")), None)
            heartbeat = datetime.now(UTC)
            values = {"updated_at": heartbeat, "lease_until": heartbeat + LEASE_DURATION}
            if phase:
                values["phase"] = phase
            result = database.jv_xl_mapping_jobs.update_one(owner, {"$set": values})
            if result.matched_count != 1:
                raise RuntimeError("Mapping job lease lost.")
            owner["lease_until"] = values["lease_until"]

        def flush(self):
            pass

    try:
        call_command("map_jv_xl_gallery", write=True, max_products=0, page_size=500, workers=3,
                     dataset=JOB_KEY, stdout=ProgressOutput())
        values = {"status": "completed", "phase": "completed", "error": None}
    except Exception as exc:
        error = str(exc) if isinstance(exc, GalleryMappingCommandError) else f"mapping_failed:{type(exc).__name__}"
        logger.error("AFTERCOOL_MAPPING_JOB_FAILED job_id=%s error=%s", job["job_id"], error)
        values = {"status": "failed", "error": error}
    values["updated_at"] = datetime.now(UTC)
    database.jv_xl_mapping_jobs.update_one(owner, {"$set": values, "$unset": {"lease_until": ""}})
    return True
