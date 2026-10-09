from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from multiprocessing import get_context
import sqlite3
import uuid
from unittest.mock import patch

import pytest

from src.sofort_orchestrator.domain.models import CreateJobRequest
from src.sofort_orchestrator.infra.job_replay_schema import migrate_job_replays
from src.sofort_orchestrator.infra.job_store import SqliteJobStore


def enqueue(db_path, key="same-key", count=1):
    store = SqliteJobStore(db_path)
    items = [(str(uuid.uuid4()), CreateJobRequest.model_validate({
        "ean": str(4012345678901 + index),
        "command": {"operation": "update", "payload": {"title": "Desk"},
                    "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title"]}]},
    })) for index in range(count)]
    payload = {"job_ids": [job_id for job_id, _ in items]}
    return store.create_jobs_once(items=items, request_id="request", payload=payload, replay_key=key, ttl_seconds=60)


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "jobs.sqlite3")
    SqliteJobStore(path)
    migrate_job_replays(path)
    return path


@pytest.mark.parametrize("count", [1, 3])
def test_parallel_connections_enqueue_one_set_and_restart_replays(db_path, count):
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: enqueue(db_path, count=count), range(8)))
    assert all(result == results[0] for result in results)
    assert enqueue(db_path, count=count) == results[0]
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM orchestrator_jobs").fetchone()[0] == count
        assert conn.execute("SELECT COUNT(*) FROM orchestrator_job_events").fetchone()[0] == count
        assert conn.execute("SELECT COUNT(*) FROM orchestrator_job_replays").fetchone()[0] == 1


def test_separate_processes_enqueue_only_one_job(db_path):
    with ProcessPoolExecutor(max_workers=4, mp_context=get_context("spawn")) as pool:
        results = list(pool.map(enqueue, [db_path] * 8))
    assert all(result == results[0] for result in results)
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM orchestrator_jobs").fetchone()[0] == 1


def test_failure_during_batch_rolls_back_jobs_events_and_replay(db_path):
    original = SqliteJobStore._insert_job
    calls = 0

    def fail_second(store, conn, **kwargs):
        nonlocal calls
        calls += 1
        original(store, conn, **kwargs)
        if calls == 2:
            raise RuntimeError("simulated crash before replay commit")

    with patch.object(SqliteJobStore, "_insert_job", fail_second), pytest.raises(RuntimeError):
        enqueue(db_path, count=3)
    with sqlite3.connect(db_path) as conn:
        for table in ("orchestrator_jobs", "orchestrator_job_events", "orchestrator_job_replays"):
            assert conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
    assert len(enqueue(db_path, count=3)["job_ids"]) == 3


def test_expired_keys_and_requests_without_keys_can_enqueue_again(db_path):
    first = enqueue(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE orchestrator_job_replays SET expires_at = 0")
    assert SqliteJobStore(db_path).get_job_replay("same-key") is None
    assert enqueue(db_path) != first
    assert enqueue(db_path, key=None) != enqueue(db_path, key=None)


def test_migration_is_explicit_additive_and_repeatable(tmp_path):
    path = str(tmp_path / "jobs.sqlite3")
    store = SqliteJobStore(path)
    with pytest.raises(sqlite3.OperationalError):
        store.check_replay_schema()
    migrate_job_replays(path)
    first = enqueue(path)
    migrate_job_replays(path)
    store.check_replay_schema()
    assert enqueue(path) == first
    missing = tmp_path / "missing.sqlite3"
    with pytest.raises(sqlite3.OperationalError):
        migrate_job_replays(str(missing))
    assert not missing.exists()
