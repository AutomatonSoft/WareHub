from __future__ import annotations

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
    def toggle_jv_by_kid(self, *, kid_number: str, inactive: bool, request_id: str):
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
                            "details": {"kid_number": kid_number, "inactive": inactive},
                        },
                        {
                            "ok": True,
                            "site_key": "JV_AT",
                            "channel": "JV",
                            "status_code": 200,
                            "details": {"kid_number": kid_number, "inactive": inactive},
                        },
                    ],
                },
            },
        )()

    def toggle_hood_by_kid(self, *, kid_number: str, inactive: bool, request_id: str):
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
                        }
                    ],
                },
            },
        )()


class TimeoutMarketplaceGateway(FakeMarketplaceGateway):
    def toggle_jv_by_kid(self, *, kid_number: str, inactive: bool, request_id: str):
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


def test_marketplace_job_service_combines_real_and_stub_channels():
    service = MarketplaceJobService(gateway=FakeMarketplaceGateway())
    result = service.execute(kid_number="566725168", inactive=True, request_id="req-1")
    assert result.status == "partial"
    assert result.summary.total == 6
    assert result.summary.success == 3
    assert result.summary.failed == 3
    site_keys = {item.site_key: item for item in result.results}
    assert site_keys["JV_DE"].ok is True
    assert site_keys["JV_AT"].ok is True
    assert site_keys["HOOD_JV"].ok is True
    assert site_keys["OTTO"].status_code == 501
    assert site_keys["EBAY"].status_code == 501
    assert site_keys["KAUFLAND"].status_code == 501


def test_marketplace_job_service_does_not_call_hood_activate():
    service = MarketplaceJobService(gateway=FakeMarketplaceGateway())
    result = service.execute(kid_number="566725168", inactive=False, request_id="req-2")
    hood = next(item for item in result.results if item.site_key == "HOOD")
    assert hood.ok is False
    assert hood.status_code == 501
    assert hood.details["code"] == "marketplace_toggle_not_supported_yet"


def test_marketplace_job_service_returns_partial_result_when_jv_times_out():
    service = MarketplaceJobService(gateway=TimeoutMarketplaceGateway())
    result = service.execute(kid_number="566725168", inactive=True, request_id="req-timeout")
    assert result.status == "partial"
    jv = next(item for item in result.results if item.site_key == "JV")
    assert jv.ok is False
    assert jv.status_code == 504
    assert jv.details["code"] == "orchestrator_marketplace_toggle_timeout"
    hood = next(item for item in result.results if item.site_key == "HOOD_JV")
    assert hood.ok is True
