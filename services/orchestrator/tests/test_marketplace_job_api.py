from __future__ import annotations

import sqlite3

from fastapi.testclient import TestClient

from src.sofort_orchestrator.api.marketplace_job_routes import MarketplaceJobDeps
from src.sofort_orchestrator.api.product_editor_routes import ProductEditorDeps
from src.sofort_orchestrator.api.routes import Deps
from src.sofort_orchestrator.application.marketplace_job_service import MarketplaceJobService
from src.sofort_orchestrator.application.orchestrator_service import OrchestratorService
from src.sofort_orchestrator.application.product_editor_service import ProductEditorService
from src.sofort_orchestrator.infra.idempotency import SqliteIdempotencyStore
from src.sofort_orchestrator.infra.job_store import SqliteJobStore
from src.sofort_orchestrator.infra.http_client import RetryExhaustedError
from src.sofort_orchestrator.infra.marketplace_job_store import SqliteMarketplaceJobStore
from src.sofort_orchestrator.infra.product_editor_store import SqliteProductEditorStore
from src.sofort_orchestrator.main import app


class NoopAdapters:
    def dispatch(self, *, ean: str, request_id: str, channel, payload: dict):
        return type("R", (), {"status_code": 200, "body": {"ok": True}})()


class NoopProductEditorGateway:
    pass


class FakeMarketplaceGateway:
    def toggle_all_by_kid(self, *, kid_number: str, inactive: bool, request_id: str, place: str | None = None):
        return type(
            "R",
            (),
            {
                "status_code": 200,
                "body": {
                    "status": "ok",
                    "inactive": inactive,
                    "results": [
                        {
                            "ok": True,
                            "site_key": "JV_DE",
                            "channel": "JV",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive, "place": place},
                        },
                        {
                            "ok": True,
                            "site_key": "HOOD_JV",
                            "channel": "HOOD",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive, "place": place},
                        },
                    ],
                },
            },
        )()

    def toggle_jv_by_kid(self, *, kid_number: str, inactive: bool, request_id: str, place: str | None = None):
        return type(
            "R",
            (),
            {
                "status_code": 200,
                "body": {
                    "status": "ok",
                    "inactive": inactive,
                    "results": [
                        {
                            "ok": True,
                            "site_key": "JV_DE",
                            "channel": "JV",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive, "place": place},
                        },
                        {
                            "ok": True,
                            "site_key": "JV_AT",
                            "channel": "JV",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive, "place": place},
                        },
                    ],
                },
            },
        )()

    def toggle_xl_by_kid(self, *, kid_number: str, inactive: bool, request_id: str, place: str | None = None):
        return type(
            "R",
            (),
            {
                "status_code": 200,
                "body": {
                    "status": "ok",
                    "inactive": inactive,
                    "results": [
                        {
                            "ok": True,
                            "site_key": "XLMOEBEL_DE",
                            "channel": "XL",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive, "place": place},
                        }
                    ],
                },
            },
        )()

    def toggle_local_statuses_by_kid(self, *, kid_number: str, inactive: bool, request_id: str):
        return type(
            "R",
            (),
            {
                "status_code": 200,
                "body": {
                    "status": "ok",
                    "inactive": inactive,
                    "results": [
                        {
                            "ok": True,
                            "site_key": "HOOD_JV",
                            "channel": "HOOD",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive},
                        },
                        {
                            "ok": True,
                            "site_key": "EBAY_JV",
                            "channel": "EBAY",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive},
                        },
                    ],
                },
            },
        )()

    def toggle_hood_by_kid(self, *, kid_number: str, inactive: bool, request_id: str, place: str | None = None):
        return type(
            "R",
            (),
            {
                "status_code": 200,
                "body": {
                    "status": "ok",
                    "inactive": inactive,
                    "results": [
                        {
                            "ok": True,
                            "site_key": "HOOD_JV",
                            "channel": "HOOD",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive, "place": place},
                        }
                    ],
                },
            },
        )()

    def toggle_kaufland_by_kid(self, *, kid_number: str, inactive: bool, request_id: str, place: str | None = None):
        return type(
            "R",
            (),
            {
                "status_code": 200,
                "body": {
                    "status": "ok",
                    "inactive": inactive,
                    "results": [
                        {
                            "ok": True,
                            "site_key": "KAUFLAND_JV",
                            "channel": "KAUFLAND",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive, "place": place},
                        }
                    ],
                },
            },
        )()

    def toggle_otto_by_kid(self, *, kid_number: str, inactive: bool, request_id: str, place: str | None = None):
        return type(
            "R",
            (),
            {
                "status_code": 200,
                "body": {
                    "status": "ok",
                    "inactive": inactive,
                    "results": [
                        {
                            "ok": True,
                            "site_key": "OTTO_JV",
                            "channel": "OTTO",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive, "place": place},
                        },
                        {
                            "ok": True,
                            "site_key": "OTTO_XL",
                            "channel": "OTTO",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive, "place": place},
                        },
                    ],
                },
            },
        )()


class TimeoutMarketplaceGateway(FakeMarketplaceGateway):
    def toggle_jv_by_kid(self, *, kid_number: str, inactive: bool, request_id: str, place: str | None = None):
        raise RetryExhaustedError("timed out", kind="timeout")


def _client(tmp_path) -> TestClient:
    Deps.service = OrchestratorService(adapters=NoopAdapters())
    Deps.idempotency_store = SqliteIdempotencyStore(db_path=str(tmp_path / "idem.sqlite3"), ttl_seconds=60)
    Deps.job_store = SqliteJobStore(db_path=str(tmp_path / "jobs.sqlite3"))
    MarketplaceJobDeps.store = SqliteMarketplaceJobStore(db_path=str(tmp_path / "marketplace.sqlite3"))
    MarketplaceJobDeps.service = MarketplaceJobService(gateway=FakeMarketplaceGateway())
    ProductEditorDeps.service = ProductEditorService(
        gateway=NoopProductEditorGateway(),  # type: ignore[arg-type]
        store=SqliteProductEditorStore(db_path=str(tmp_path / "product_editor.sqlite3")),
        orchestrator_job_store=Deps.job_store,
    )
    return TestClient(app)


def test_marketplace_toggle_job_create_and_fetch_queued(tmp_path):
    client = _client(tmp_path)
    created = client.post("/api/v1/orchestrator/marketplace/toggle-by-kid", json={"kid_number": "566725168", "inactive": True})
    assert created.status_code == 200
    create_payload = created.json()
    assert create_payload["status"] == "queued"
    job_id = create_payload["job_id"]

    fetched = client.get(f"/api/v1/orchestrator/marketplace/jobs/{job_id}")
    assert fetched.status_code == 200
    fetched_payload = fetched.json()
    assert fetched_payload["job_status"] == "queued"
    assert fetched_payload["status"] == "queued"
    assert fetched_payload["kid_number"] == "566725168"
    assert fetched_payload["results"] == []


def test_marketplace_toggle_jobs_list_includes_queued_job(tmp_path):
    client = _client(tmp_path)
    created = client.post("/api/v1/orchestrator/marketplace/toggle-by-kid", json={"kid_number": "566725168", "inactive": True})

    response = client.get("/api/v1/orchestrator/marketplace/jobs?limit=1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["limit"] == 1
    assert payload["offset"] == 0
    assert payload["jobs"][0]["job_id"] == created.json()["job_id"]
    assert payload["jobs"][0]["status"] == "queued"
    assert payload["jobs"][0]["created_at_unix_ms"] > 0

    searched = client.get("/api/v1/orchestrator/marketplace/jobs?limit=1&query=566725168")
    assert searched.status_code == 200
    assert searched.json()["total"] == 1


def test_marketplace_job_service_combines_real_and_stub_channels():
    service = MarketplaceJobService(gateway=FakeMarketplaceGateway())
    result = service.execute(kid_number="566725168", inactive=True, request_id="req-1", place=None)
    assert result.status == "ok"
    assert result.summary.total == 8
    assert result.summary.success == 8
    assert result.summary.failed == 0
    site_keys = {item.site_key: item for item in result.results}
    assert site_keys["JV_DE"].ok is True
    assert site_keys["JV_AT"].ok is True
    assert site_keys["XLMOEBEL_DE"].ok is True
    assert site_keys["HOOD_JV"].ok is True
    assert site_keys["OTTO_JV"].ok is True
    assert site_keys["OTTO_XL"].ok is True
    assert site_keys["EBAY_JV"].ok is True
    assert site_keys["KAUFLAND_JV"].ok is True


def test_marketplace_job_service_activate_combines_jv_and_local_channels():
    service = MarketplaceJobService(gateway=FakeMarketplaceGateway())
    result = service.execute(kid_number="566725168", inactive=False, request_id="req-2", place="12")
    assert result.status == "ok"
    site_keys = {item.site_key: item for item in result.results}
    assert site_keys["JV_DE"].ok is True
    assert site_keys["JV_AT"].ok is True
    assert site_keys["XLMOEBEL_DE"].ok is True
    assert site_keys["HOOD_JV"].ok is True
    assert site_keys["OTTO_JV"].ok is True
    assert site_keys["OTTO_XL"].ok is True
    assert site_keys["EBAY_JV"].ok is True
    assert site_keys["KAUFLAND_JV"].ok is True


def test_marketplace_job_service_returns_partial_result_when_jv_times_out():
    service = MarketplaceJobService(gateway=TimeoutMarketplaceGateway())
    result = service.execute(kid_number="566725168", inactive=True, request_id="req-timeout", place=None)
    assert result.status == "partial"
    row = next(item for item in result.results if item.site_key == "JV")
    assert row.ok is False
    assert row.status_code == 504
    assert row.details["code"] == "orchestrator_marketplace_toggle_timeout"
    assert any(item.site_key == "HOOD_JV" and item.ok for item in result.results)


def test_marketplace_toggle_job_create_accepts_place(tmp_path):
    client = _client(tmp_path)
    created = client.post(
        "/api/v1/orchestrator/marketplace/toggle-by-kid",
        json={"kid_number": "566725168", "inactive": False, "place": "18"},
    )
    assert created.status_code == 200
    job_id = created.json()["job_id"]

    stored = MarketplaceJobDeps.store.get_job(job_id=job_id)
    assert stored is not None
    assert stored.job_id == job_id

    with sqlite3.connect(str(tmp_path / "marketplace.sqlite3")) as conn:
        row = conn.execute(
            "SELECT place FROM marketplace_toggle_jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()
    assert row is not None
    assert row[0] == "18"


def test_marketplace_toggle_job_persists_verified_actor_for_worker(tmp_path):
    client = _client(tmp_path)
    created = client.post(
        "/api/v1/orchestrator/marketplace/toggle-by-kid",
        json={"kid_number": "566725168", "inactive": True},
        headers={"X-WareHub-Actor-Login": "katerina", "X-WareHub-Actor-Name": "Katerina Krisling"},
    )
    assert created.status_code == 200

    claimed = MarketplaceJobDeps.store.claim_next_queued_job()
    assert claimed is not None
    assert claimed["actor_login"] == "katerina"
    assert claimed["actor_name"] == "Katerina Krisling"
