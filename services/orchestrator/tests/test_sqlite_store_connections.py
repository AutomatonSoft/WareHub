from __future__ import annotations

from contextlib import contextmanager

from src.sofort_orchestrator.infra.idempotency import SqliteIdempotencyStore
from src.sofort_orchestrator.infra.job_store import SqliteJobStore
from src.sofort_orchestrator.infra.product_editor_store import SqliteProductEditorStore


class _FakeConnection:
    def __init__(self) -> None:
        self.closed = False

    def execute(self, *_args, **_kwargs):
        return self

    def fetchone(self):
        return None

    def fetchall(self):
        return []

    def commit(self) -> None:
        return None

    def close(self) -> None:
        self.closed = True


@contextmanager
def _fake_connecting_store(store):
    connections: list[_FakeConnection] = []

    @contextmanager
    def fake_connect():
        conn = _FakeConnection()
        connections.append(conn)
        yield conn
        conn.close()

    store._connect = fake_connect
    yield connections


def test_idempotency_store_closes_connections(tmp_path):
    store = SqliteIdempotencyStore(db_path=str(tmp_path / "idempotency.sqlite3"), ttl_seconds=60)

    with _fake_connecting_store(store) as connections:
        store.ping()

    assert connections
    assert all(conn.closed for conn in connections)


def test_job_store_closes_connections(tmp_path):
    store = SqliteJobStore(db_path=str(tmp_path / "jobs.sqlite3"))

    with _fake_connecting_store(store) as connections:
        store.metrics()

    assert connections
    assert all(conn.closed for conn in connections)


def test_product_editor_store_closes_connections(tmp_path):
    store = SqliteProductEditorStore(db_path=str(tmp_path / "product_editor.sqlite3"))

    with _fake_connecting_store(store) as connections:
        assert store.get_plan(plan_id="missing") is None

    assert connections
    assert all(conn.closed for conn in connections)
