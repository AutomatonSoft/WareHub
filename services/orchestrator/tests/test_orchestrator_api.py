from __future__ import annotations

import time
import pytest
from fastapi.testclient import TestClient

from src.sofort_orchestrator.api.routes import Deps, _JOB_INTAKE_PRIORITY_TIMESTAMPS_MS, _JOB_INTAKE_TIMESTAMPS_MS
from src.sofort_orchestrator.application.orchestrator_service import OrchestratorService
from src.sofort_orchestrator.domain.models import ChannelTarget, Marketplace
from src.sofort_orchestrator.infra.channel_limiter import InMemoryChannelLimiter
from src.sofort_orchestrator.infra.circuit_breaker import InMemoryCircuitBreaker
from src.sofort_orchestrator.infra.http_client import RetryExhaustedError
from src.sofort_orchestrator.infra.idempotency import SqliteIdempotencyStore
from src.sofort_orchestrator.infra.job_store import SqliteJobStore
from src.sofort_orchestrator.main import app
from src.sofort_orchestrator.infra.settings import settings
from src.sofort_orchestrator.domain.models import JobPriority, Operation, OrchestrateRequest


settings.enable_job_worker = False


class FakeAdapters:
    def __init__(self) -> None:
        self.calls = 0

    def dispatch(
        self,
        *,
        ean: str,
        request_id: str,
        channel: ChannelTarget,
        payload: dict,
        operation: Operation = Operation.UPDATE,
    ):
        self.calls += 1
        if channel.marketplace is Marketplace.KAUFLAND:
            return type("R", (), {"status_code": 502, "body": {"code": "kaufland_down"}})()
        return type("R", (), {"status_code": 200, "body": {"ok": True, "ean": ean, "payload": payload}})()


class TimeoutAdapters(FakeAdapters):
    def dispatch(
        self,
        *,
        ean: str,
        request_id: str,
        channel: ChannelTarget,
        payload: dict,
        operation: Operation = Operation.UPDATE,
    ):
        raise RetryExhaustedError("timed out", kind="timeout")


class SuccessfulAdapters(FakeAdapters):
    def dispatch(
        self,
        *,
        ean: str,
        request_id: str,
        channel: ChannelTarget,
        payload: dict,
        operation: Operation = Operation.UPDATE,
    ):
        self.calls += 1
        return type("R", (), {"status_code": 200, "body": {"ok": True, "ean": ean, "payload": payload}})()


class FakeEanPoolGateway:
    def __init__(self) -> None:
        self.eans_by_job_id: dict[str, str] = {}
        self.claimed_job_ids: list[str] = []
        self.used_job_ids: list[str] = []

    def claim_for_job(
        self,
        *,
        job_id: str,
        request_id: str,
        kid_number: str | None = None,
        reservation_family: str | None = None,
    ) -> str:
        self.claimed_job_ids.append(job_id)
        return self.eans_by_job_id.setdefault(job_id, f"4098765432{len(self.eans_by_job_id) + 100}")

    def mark_used_for_job(
        self,
        *,
        job_id: str,
        request_id: str,
        kid_number: str | None = None,
        reservation_family: str | None = None,
    ) -> None:
        self.used_job_ids.append(job_id)


class FakeMarketplaceEanMappingGateway:
    def __init__(self) -> None:
        self.calls: list[dict[str, str]] = []

    def confirm(
        self,
        *,
        request_id: str,
        kid_number: str,
        marketplace: str,
        account: str,
        ean: str,
    ) -> dict[str, object]:
        self.calls.append(
            {
                "request_id": request_id,
                "kid_number": kid_number,
                "marketplace": marketplace,
                "account": account,
                "ean": ean,
            }
        )
        return {"confirmed": True, "ean": ean}


class BrokenIdempotencyStore:
    def ping(self) -> bool:
        raise RuntimeError("sqlite unavailable")

    def get(self, key: str):
        return None

    def put(self, key: str, payload: dict) -> None:
        return None

    def metrics(self) -> dict:
        return {"idempotency_records_total": 0, "idempotency_records_active": 0}


def _client_with_fake_adapters(fake: FakeAdapters, tmp_path) -> TestClient:
    db_path = tmp_path / "idem.sqlite3"
    jobs_path = tmp_path / "jobs.sqlite3"
    Deps.service = OrchestratorService(adapters=fake)
    Deps.idempotency_store = SqliteIdempotencyStore(db_path=str(db_path), ttl_seconds=60)
    Deps.job_store = SqliteJobStore(db_path=str(jobs_path))
    _JOB_INTAKE_TIMESTAMPS_MS.clear()
    for queue in _JOB_INTAKE_PRIORITY_TIMESTAMPS_MS.values():
        queue.clear()
    return TestClient(app)


def _client_with_service(service: OrchestratorService, tmp_path) -> TestClient:
    db_path = tmp_path / "idem.sqlite3"
    jobs_path = tmp_path / "jobs.sqlite3"
    Deps.service = service
    Deps.idempotency_store = SqliteIdempotencyStore(db_path=str(db_path), ttl_seconds=60)
    Deps.job_store = SqliteJobStore(db_path=str(jobs_path))
    _JOB_INTAKE_TIMESTAMPS_MS.clear()
    for queue in _JOB_INTAKE_PRIORITY_TIMESTAMPS_MS.values():
        queue.clear()
    return TestClient(app)


def test_orchestrator_success(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "payload": {
            "title": "Desk",
            "description": "Oak",
            "price": "199.99",
            "quantity": 3,
            "productReference": "OTTO-1",
            "ean": "4012345678901",
        },
        "channels": [
            {"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]},
            {"marketplace": "otto", "profile": "jv", "changed_fields": ["productReference", "ean"]},
        ],
    }
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body, headers={"X-Request-Id": "req-1"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert len(payload["results"]) == 2
    assert fake.calls == 2
    assert payload["request_id"] == "req-1"


def test_orchestrator_partial_success_upstream_5xx(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "payload": {"title": "Desk", "price": "199.99", "storefront": "de"},
        "channels": [
            {"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]},
            {"marketplace": "kaufland", "account": "jv", "changed_fields": ["title", "storefront", "price"]},
        ],
    }
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "partial_success"
    assert payload["results"][1]["error"]["code"] == "orchestrator_channel_upstream_5xx"


def test_orchestrator_circuit_breaker_opens_after_failure_threshold(tmp_path):
    fake = FakeAdapters()
    breaker = InMemoryCircuitBreaker(failure_threshold=1, open_seconds=60, enabled=True)
    service = OrchestratorService(adapters=fake, circuit_breaker=breaker)
    client = _client_with_service(service, tmp_path)
    body = {
        "payload": {"title": "Desk", "price": "199.99", "storefront": "de"},
        "channels": [{"marketplace": "kaufland", "account": "jv", "changed_fields": ["title", "storefront", "price"]}],
    }

    first = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert first.status_code == 200
    assert first.json()["results"][0]["error"]["code"] == "orchestrator_channel_upstream_5xx"

    second = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert second.status_code == 200
    payload = second.json()
    assert payload["results"][0]["error"]["code"] == "orchestrator_channel_circuit_open"
    assert payload["results"][0]["status_code"] == 503


def test_orchestrator_circuit_breaker_closes_after_open_window(tmp_path):
    fake = FakeAdapters()
    breaker = InMemoryCircuitBreaker(failure_threshold=1, open_seconds=0.2, enabled=True)
    service = OrchestratorService(adapters=fake, circuit_breaker=breaker)
    client = _client_with_service(service, tmp_path)
    body = {
        "payload": {"title": "Desk", "price": "199.99", "storefront": "de"},
        "channels": [{"marketplace": "kaufland", "account": "jv", "changed_fields": ["title", "storefront", "price"]}],
    }

    first = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert first.status_code == 200
    assert first.json()["results"][0]["error"]["code"] == "orchestrator_channel_upstream_5xx"

    second = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert second.status_code == 200
    assert second.json()["results"][0]["error"]["code"] == "orchestrator_channel_circuit_open"

    time.sleep(0.25)
    third = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert third.status_code == 200
    assert third.json()["results"][0]["error"]["code"] == "orchestrator_channel_upstream_5xx"
    assert fake.calls == 2


def test_orchestrator_channel_limiter_returns_busy_without_dispatch(tmp_path):
    fake = FakeAdapters()
    limiter = InMemoryChannelLimiter(max_inflight_per_key=1, enabled=True)
    key = "hood,account=jv"
    assert limiter.try_acquire(key) is True
    service = OrchestratorService(adapters=fake, channel_limiter=limiter)
    client = _client_with_service(service, tmp_path)
    body = {
        "payload": {"title": "Desk", "price": "199.99"},
        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
    }
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    payload = response.json()
    assert response.status_code == 200
    assert payload["results"][0]["error"]["code"] == "orchestrator_channel_busy"
    assert payload["results"][0]["status_code"] == 429
    assert fake.calls == 0


def test_orchestrator_rejects_unknown_fields_per_marketplace(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "payload": {"sku": "SKU-1"},
        "channels": [
            {"marketplace": "hood", "account": "jv", "changed_fields": ["sku"]},
        ],
    }
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["results"][0]["error"]["code"] == "orchestrator_channel_validation_failed"


def test_orchestrator_rejects_missing_required_fields(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "payload": {"title": "Desk"},
        "channels": [
            {"marketplace": "hood", "account": "jv", "changed_fields": ["title"]},
        ],
    }
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["results"][0]["error"]["code"] == "orchestrator_channel_validation_failed"


def test_orchestrator_timeout_error_code(tmp_path):
    client = _client_with_fake_adapters(TimeoutAdapters(), tmp_path)
    body = {
        "payload": {"title": "Desk", "price": "199.99"},
        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
    }
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["results"][0]["error"]["code"] == "orchestrator_channel_timeout"


def test_orchestrator_idempotency_replay(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "payload": {"title": "Desk", "price": "199.99"},
        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
    }
    headers = {"Idempotency-Key": "idem-1"}
    first = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body, headers=headers)
    second = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body, headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert fake.calls == 1


def test_orchestrator_validation_error_contract(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json={"payload": {"unknown": 1}, "channels": []})
    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "orchestrator_request_validation_failed"
    assert payload["request_id"]


def test_orchestrator_defaults_operation_to_update_for_backward_compatibility(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "payload": {"title": "Desk", "price": "199.99"},
        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
    }
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_orchestrator_rejects_unknown_operation_value(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "operation": "rotate",
        "payload": {"title": "Desk", "price": "199.99"},
        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
    }
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "orchestrator_request_validation_failed"


@pytest.mark.parametrize("operation", ["unpublish", "relist"])
def test_orchestrator_returns_not_supported_for_non_update_operations(tmp_path, operation: str):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "operation": operation,
        "payload": {"title": "Desk", "price": "199.99"},
        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
    }
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["results"][0]["status_code"] == 501
    assert payload["results"][0]["error"]["code"] == "orchestrator_operation_not_supported"
    assert payload["results"][0]["error"]["details"]["operation"] == operation
    assert fake.calls == 0


def test_orchestrator_publishes_to_hood(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "operation": "publish",
        "payload": {"title": "Desk", "description": "Oak", "price": "199.99", "quantity": 1},
        "channels": [
            {
                "marketplace": "hood",
                "account": "jv",
                "changed_fields": ["title", "description", "price", "quantity"],
            }
        ],
    }

    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert fake.calls == 1


def test_orchestrator_publishes_to_all_main_create_marketplaces(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "operation": "publish",
        "payload": {
            "title": "Desk",
            "description": "Oak",
            "price": "199.99",
            "quantity": 1,
            "source_model": "4012345678901",
        },
        "channels": [
            {"marketplace": "xljv", "site": "JV", "site_key": "JV_DE", "changed_fields": ["title", "description", "source_model", "price"]},
            {"marketplace": "xljv", "site": "XL", "site_key": "XLMOEBEL_DE", "changed_fields": ["title", "description", "source_model", "price"]},
            {"marketplace": "hood", "account": "jv", "changed_fields": ["title", "description", "price", "quantity"]},
            {"marketplace": "hood", "account": "xl", "changed_fields": ["title", "description", "price", "quantity"]},
            {"marketplace": "kaufland", "account": "jv", "changed_fields": ["title", "description", "price"]},
            {"marketplace": "kaufland", "account": "xl", "changed_fields": ["title", "description", "price"]},
        ],
    }

    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "partial_success"
    assert len(payload["results"]) == 6
    assert fake.calls == 6


def test_publish_uses_a_distinct_pool_ean_for_each_pool_channel():
    adapters = SuccessfulAdapters()
    pool_gateway = FakeEanPoolGateway()
    service = OrchestratorService(adapters=adapters, ean_pool_gateway=pool_gateway)
    command = OrchestrateRequest.model_validate(
        {
            "operation": "publish",
            "kid_number": "13234455",
            "payload": {
                "title": "Desk",
                "description": "Oak",
                "price": "199.99",
                "quantity": 1,
                "source_model": "4012345678901",
                "productReference": "4012345678901",
                "ean": "4012345678901",
            },
            "channels": [
                {"marketplace": "xljv", "site": "JV", "site_key": "JV_DE", "changed_fields": ["title", "description", "source_model", "price"]},
                {"marketplace": "xljv", "site": "XL", "site_key": "XLMOEBEL_DE", "changed_fields": ["title", "description", "source_model", "price"]},
                {"marketplace": "hood", "account": "jv", "ean_source": "pool", "changed_fields": ["title", "description", "price", "quantity"]},
                {"marketplace": "hood", "account": "xl", "ean_source": "pool", "changed_fields": ["title", "description", "price", "quantity"]},
                {"marketplace": "kaufland", "account": "jv", "ean_source": "pool", "changed_fields": ["title", "description", "price"]},
                {"marketplace": "kaufland", "account": "xl", "ean_source": "pool", "changed_fields": ["title", "description", "price"]},
                {"marketplace": "otto", "profile": "jv", "ean_source": "pool", "changed_fields": ["productReference", "ean"]},
                {"marketplace": "otto", "profile": "xl", "ean_source": "pool", "changed_fields": ["productReference", "ean"]},
            ],
        }
    )

    result = service.execute(ean="4012345678901", request_id="request-1", job_id="job-1", command=command)

    assert result.status == "success"
    assert len(pool_gateway.claimed_job_ids) == 2
    assert set(pool_gateway.claimed_job_ids) == set(pool_gateway.used_job_ids)
    by_target = {item.target: item.data["ean"] for item in result.results}
    assert by_target["xljv,site=JV,site_key=JV_DE"] == "4012345678901"
    assert by_target["xljv,site=XL,site_key=XLMOEBEL_DE"] == "4012345678901"
    assert by_target["hood,account=jv"] != "4012345678901"
    assert by_target["kaufland,account=jv"] == by_target["hood,account=jv"]
    assert by_target["hood,account=jv"] != by_target["hood,account=xl"]
    assert by_target["hood,account=xl"] == by_target["kaufland,account=xl"]
    assert by_target["otto,profile=jv"] == by_target["hood,account=jv"]
    assert by_target["otto,profile=xl"] == by_target["hood,account=xl"]
    hood_payload = next(item.data["payload"] for item in result.results if item.target == "hood,account=jv")
    assert hood_payload["__source_ean"] == "4012345678901"

    retry_result = service.execute(ean="4012345678901", request_id="request-2", job_id="job-1", command=command)
    retry_by_target = {item.target: item.data["ean"] for item in retry_result.results}
    assert retry_by_target["hood,account=jv"] == by_target["hood,account=jv"]
    assert retry_by_target["hood,account=xl"] == by_target["hood,account=xl"]
    assert retry_by_target["kaufland,account=jv"] == by_target["kaufland,account=jv"]
    assert retry_by_target["kaufland,account=xl"] == by_target["kaufland,account=xl"]
    assert retry_by_target["otto,profile=jv"] == by_target["otto,profile=jv"]
    assert retry_by_target["otto,profile=xl"] == by_target["otto,profile=xl"]
    assert len(set(pool_gateway.claimed_job_ids)) == 2


def test_publish_confirms_pool_ean_mappings_after_marketplace_success():
    adapters = SuccessfulAdapters()
    pool_gateway = FakeEanPoolGateway()
    mapping_gateway = FakeMarketplaceEanMappingGateway()
    service = OrchestratorService(
        adapters=adapters,
        ean_pool_gateway=pool_gateway,
        marketplace_ean_mapping_gateway=mapping_gateway,
    )
    command = OrchestrateRequest.model_validate(
        {
            "operation": "publish",
            "kid_number": "13234455",
            "payload": {
                "title": "Desk",
                "description": "Oak",
                "price": "199.99",
                "quantity": 1,
                "productReference": "4012345678901",
                "ean": "4012345678901",
            },
            "channels": [
                {"marketplace": "hood", "account": "jv", "ean_source": "pool"},
                {"marketplace": "kaufland", "account": "jv", "ean_source": "pool"},
                {"marketplace": "hood", "account": "xl", "ean_source": "pool"},
                {"marketplace": "otto", "profile": "jv", "ean_source": "pool"},
            ],
        }
    )

    result = service.execute(ean="4012345678901", request_id="request-1", job_id="job-1", command=command)

    assert result.status == "success"
    assert [(call["marketplace"], call["account"]) for call in mapping_gateway.calls] == [
        ("hood", "jv"),
        ("kaufland", "jv"),
        ("hood", "xl"),
        ("otto", "jv"),
    ]
    assert mapping_gateway.calls[0]["ean"] == mapping_gateway.calls[1]["ean"]
    assert mapping_gateway.calls[0]["ean"] != mapping_gateway.calls[2]["ean"]
    assert mapping_gateway.calls[0]["ean"] == mapping_gateway.calls[3]["ean"]
    assert all(item.data["marketplace_ean_mapping"]["status"] == "confirmed" for item in result.results)


def test_orchestrator_response_request_id_matches_header_when_generated(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "payload": {"title": "Desk", "price": "199.99"},
        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
    }
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert response.headers["X-Request-Id"] == payload["request_id"]


def test_orchestrator_validation_request_id_matches_header_when_generated(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    response = client.post("/api/v1/orchestrator/products/4012345678901/update", json={"payload": {"unknown": 1}, "channels": []})
    assert response.status_code == 422
    payload = response.json()
    assert response.headers["X-Request-Id"] == payload["request_id"]


def test_metrics_exposes_required_sections(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "payload": {"title": "Desk", "price": "199.99"},
        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
    }
    client.post("/api/v1/orchestrator/products/4012345678901/update", json=body)
    response = client.get("/api/v1/metrics")
    assert response.status_code == 200
    payload = response.json()
    assert "request_rate" in payload
    assert "latency_histogram_ms" in payload
    assert "error_rate" in payload
    assert "database_pool_metrics" in payload
    assert "job_store_metrics" in payload
    assert "jobs_total" in payload["job_store_metrics"]
    assert "circuit_breaker_metrics" in payload


def test_readyz_returns_not_ready_on_store_failure(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    previous_store = Deps.idempotency_store
    try:
        Deps.idempotency_store = BrokenIdempotencyStore()  # type: ignore[assignment]
        response = client.get("/api/v1/readyz")
        assert response.status_code == 503
        assert response.json()["status"] == "not_ready"
    finally:
        Deps.idempotency_store = previous_store


def test_orchestrator_job_create_and_fetch(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "ean": "4012345678901",
        "command": {
            "operation": "update",
            "payload": {"title": "Desk", "price": "199.99"},
            "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
        },
    }
    created = client.post("/api/v1/orchestrator/jobs", json=body)
    assert created.status_code == 200
    create_payload = created.json()
    assert create_payload["status"] == "queued"
    job_id = create_payload["job_id"]

    fetched = client.get(f"/api/v1/orchestrator/jobs/{job_id}")
    assert fetched.status_code == 200
    fetched_payload = fetched.json()
    assert fetched_payload["status"] == "queued"
    assert fetched_payload["ean"] == "4012345678901"
    assert fetched_payload["operation"] == "update"
    assert fetched_payload["result"] is None


def test_orchestrator_job_create_rejects_scheduled_in_past(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "ean": "4012345678901",
        "scheduled_at_unix_ms": int(time.time() * 1000) - 1000,
        "command": {
            "operation": "update",
            "payload": {"title": "Desk", "price": "199.99"},
            "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
        },
    }
    response = client.post("/api/v1/orchestrator/jobs", json=body)
    assert response.status_code == 400
    assert response.json()["code"] == "orchestrator_job_scheduled_in_past"


def test_orchestrator_jobs_batch_create_success(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "items": [
            {
                "ean": "4012345678901",
                "command": {
                    "operation": "update",
                    "payload": {"title": "Desk", "price": "199.99"},
                    "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                },
            },
            {
                "ean": "4012345678902",
                "command": {
                    "operation": "update",
                    "payload": {"title": "Chair", "price": "99.99"},
                    "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                },
            },
        ]
    }
    response = client.post("/api/v1/orchestrator/jobs/batch", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["queued"] == 2
    assert payload["failed"] == 0
    assert len(payload["results"]) == 2
    for item in payload["results"]:
        assert item["status"] == "queued"
        job = client.get(f"/api/v1/orchestrator/jobs/{item['job_id']}")
        assert job.status_code == 200


def test_orchestrator_jobs_batch_create_partial_with_empty_ean(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "items": [
            {
                "ean": "  ",
                "command": {
                    "operation": "update",
                    "payload": {"title": "Desk", "price": "199.99"},
                    "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                },
            },
            {
                "ean": "4012345678903",
                "command": {
                    "operation": "update",
                    "payload": {"title": "Lamp", "price": "49.99"},
                    "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                },
            },
        ]
    }
    response = client.post("/api/v1/orchestrator/jobs/batch", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["queued"] == 1
    assert payload["failed"] == 1
    assert payload["results"][0]["status"] == "failed"
    assert payload["results"][0]["error"]["code"] == "orchestrator_ean_empty"
    assert payload["results"][1]["status"] == "queued"


def test_orchestrator_jobs_batch_rejects_too_large_payload(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    previous_max = settings.jobs_batch_max_items
    settings.jobs_batch_max_items = 1
    try:
        body = {
            "items": [
                {
                    "ean": "4012345678901",
                    "command": {
                        "operation": "update",
                        "payload": {"title": "Desk", "price": "199.99"},
                        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                    },
                },
                {
                    "ean": "4012345678902",
                    "command": {
                        "operation": "update",
                        "payload": {"title": "Chair", "price": "99.99"},
                        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                    },
                },
            ]
        }
        response = client.post("/api/v1/orchestrator/jobs/batch", json=body)
        assert response.status_code == 400
        assert response.json()["code"] == "orchestrator_jobs_batch_too_large"
    finally:
        settings.jobs_batch_max_items = previous_max


def test_orchestrator_jobs_single_idempotency_replay(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "ean": "4012345678901",
        "command": {
            "operation": "update",
            "payload": {"title": "Desk", "price": "199.99"},
            "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
        },
    }
    headers = {"Idempotency-Key": "jobs-single-1"}
    first = client.post("/api/v1/orchestrator/jobs", json=body, headers=headers)
    second = client.post("/api/v1/orchestrator/jobs", json=body, headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["job_id"] == second.json()["job_id"]


def test_orchestrator_jobs_single_idempotency_key_with_different_body_creates_distinct_jobs(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    headers = {"Idempotency-Key": "jobs-single-same-key"}
    first = client.post(
        "/api/v1/orchestrator/jobs",
        json={
            "ean": "4012345678901",
            "command": {
                "operation": "update",
                "payload": {"title": "Desk", "price": "199.99"},
                "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
            },
        },
        headers=headers,
    )
    second = client.post(
        "/api/v1/orchestrator/jobs",
        json={
            "ean": "4012345678902",
            "command": {
                "operation": "update",
                "payload": {"title": "Chair", "price": "99.99"},
                "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
            },
        },
        headers=headers,
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["job_id"] != second.json()["job_id"]


def test_orchestrator_jobs_batch_idempotency_replay(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "items": [
            {
                "ean": "4012345678901",
                "command": {
                    "operation": "update",
                    "payload": {"title": "Desk", "price": "199.99"},
                    "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                },
            },
            {
                "ean": "4012345678902",
                "command": {
                    "operation": "update",
                    "payload": {"title": "Chair", "price": "99.99"},
                    "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                },
            },
        ]
    }
    headers = {"Idempotency-Key": "jobs-batch-1"}
    first = client.post("/api/v1/orchestrator/jobs/batch", json=body, headers=headers)
    second = client.post("/api/v1/orchestrator/jobs/batch", json=body, headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    first_payload = first.json()
    second_payload = second.json()
    assert first_payload["queued"] == 2
    assert second_payload["queued"] == 2
    first_ids = [item["job_id"] for item in first_payload["results"]]
    second_ids = [item["job_id"] for item in second_payload["results"]]
    assert first_ids == second_ids


def test_orchestrator_jobs_status_batch_returns_mixed_found_and_not_found(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    create_one = client.post(
        "/api/v1/orchestrator/jobs",
        json={
            "ean": "4012345678901",
            "command": {
                "operation": "update",
                "payload": {"title": "Desk", "price": "199.99"},
                "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
            },
        },
    )
    assert create_one.status_code == 200
    job_id = create_one.json()["job_id"]

    response = client.post(
        "/api/v1/orchestrator/jobs/status/batch",
        json={"job_ids": [job_id, "missing-job-id"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert payload["found"] == 1
    assert payload["not_found"] == 1
    assert payload["results"][0]["job_id"] == job_id
    assert payload["results"][0]["found"] is True
    assert payload["results"][0]["status"] == "queued"
    assert payload["results"][1]["job_id"] == "missing-job-id"
    assert payload["results"][1]["found"] is False
    assert payload["results"][1]["status"] == "not_found"


def test_orchestrator_jobs_status_batch_rejects_too_large_payload(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    previous_max = settings.jobs_status_batch_max_items
    settings.jobs_status_batch_max_items = 1
    try:
        response = client.post(
            "/api/v1/orchestrator/jobs/status/batch",
            json={"job_ids": ["a", "b"]},
        )
        assert response.status_code == 400
        assert response.json()["code"] == "orchestrator_jobs_status_batch_too_large"
    finally:
        settings.jobs_status_batch_max_items = previous_max


def test_orchestrator_job_events_endpoint(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "ean": "4012345678901",
        "command": {
            "operation": "update",
            "payload": {"title": "Desk", "price": "199.99"},
            "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
        },
    }
    created = client.post("/api/v1/orchestrator/jobs", json=body)
    job_id = created.json()["job_id"]
    events = client.get(f"/api/v1/orchestrator/jobs/{job_id}/events")
    assert events.status_code == 200
    event_payload = events.json()
    event_types = [event["event_type"] for event in event_payload["events"]]
    assert event_types == ["job_created"]


def test_orchestrator_job_endpoints_return_not_found(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    job_response = client.get("/api/v1/orchestrator/jobs/missing")
    assert job_response.status_code == 404
    assert job_response.json()["code"] == "orchestrator_job_not_found"
    events_response = client.get("/api/v1/orchestrator/jobs/missing/events")
    assert events_response.status_code == 404
    assert events_response.json()["code"] == "orchestrator_job_not_found"
    attempts_response = client.get("/api/v1/orchestrator/jobs/missing/attempts")
    assert attempts_response.status_code == 404
    assert attempts_response.json()["code"] == "orchestrator_job_not_found"


def test_orchestrator_worker_processes_queued_job_when_enabled(tmp_path):
    settings.enable_job_worker = True
    settings.job_worker_poll_interval_seconds = 0.05
    try:
        fake = FakeAdapters()
        with _client_with_fake_adapters(fake, tmp_path) as client:
            body = {
                "ean": "4012345678901",
                "command": {
                    "operation": "update",
                    "payload": {"title": "Desk", "price": "199.99"},
                    "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                },
            }
            created = client.post("/api/v1/orchestrator/jobs", json=body)
            assert created.status_code == 200
            job_id = created.json()["job_id"]

            deadline = time.time() + 2.0
            final_payload = None
            while time.time() < deadline:
                polled = client.get(f"/api/v1/orchestrator/jobs/{job_id}")
                assert polled.status_code == 200
                final_payload = polled.json()
                if final_payload["status"] == "completed":
                    break
                time.sleep(0.05)

            assert final_payload is not None
            assert final_payload["status"] == "completed"
            assert final_payload["result"]["status"] == "success"

            events = client.get(f"/api/v1/orchestrator/jobs/{job_id}/events")
            assert events.status_code == 200
            event_types = [event["event_type"] for event in events.json()["events"]]
            assert event_types == ["job_created", "job_running", "job_completed"]

            attempts = client.get(f"/api/v1/orchestrator/jobs/{job_id}/attempts")
            assert attempts.status_code == 200
            attempts_payload = attempts.json()["attempts"]
            assert len(attempts_payload) == 1
            assert attempts_payload[0]["attempt_no"] == 1
            assert attempts_payload[0]["status"] == "completed"
            assert attempts_payload[0]["finished_at_unix_ms"] is not None
    finally:
        settings.enable_job_worker = False


def test_orchestrator_worker_processes_main_create_publish_job(tmp_path):
    settings.enable_job_worker = True
    settings.job_worker_poll_interval_seconds = 0.05
    try:
        fake = SuccessfulAdapters()
        with _client_with_fake_adapters(fake, tmp_path) as client:
            body = {
                "ean": "4012345678901",
                "command": {
                    "operation": "publish",
                    "payload": {
                        "title": "Desk",
                        "description": "Oak desk",
                        "price": "199.99",
                        "quantity": 1,
                        "source_model": "4012345678901",
                    },
                    "channels": [
                        {"marketplace": "xljv", "site": "JV", "site_key": "JV_DE", "changed_fields": ["title", "description", "source_model", "price"]},
                        {"marketplace": "xljv", "site": "XL", "site_key": "XLMOEBEL_DE", "changed_fields": ["title", "description", "source_model", "price"]},
                        {"marketplace": "hood", "account": "jv", "changed_fields": ["title", "description", "price", "quantity"]},
                        {"marketplace": "hood", "account": "xl", "changed_fields": ["title", "description", "price", "quantity"]},
                        {"marketplace": "kaufland", "account": "jv", "changed_fields": ["title", "description", "price"]},
                        {"marketplace": "kaufland", "account": "xl", "changed_fields": ["title", "description", "price"]},
                    ],
                },
            }
            created = client.post("/api/v1/orchestrator/jobs", json=body)
            assert created.status_code == 200
            job_id = created.json()["job_id"]

            deadline = time.time() + 2.0
            job = None
            while time.time() < deadline:
                job = client.get(f"/api/v1/orchestrator/jobs/{job_id}").json()
                if job["status"] == "completed":
                    break
                time.sleep(0.05)

            assert job is not None
            assert job["status"] == "completed"
            assert job["operation"] == "publish"
            assert job["result"]["status"] == "success"
            assert len(job["result"]["results"]) == 6
            assert fake.calls == 6
    finally:
        settings.enable_job_worker = False


def test_orchestrator_worker_respects_scheduled_at_window(tmp_path):
    settings.enable_job_worker = True
    settings.job_worker_poll_interval_seconds = 0.05
    try:
        fake = FakeAdapters()
        with _client_with_fake_adapters(fake, tmp_path) as client:
            scheduled_at = int((time.time() + 0.35) * 1000)
            created = client.post(
                "/api/v1/orchestrator/jobs",
                json={
                    "ean": "4012345678901",
                    "scheduled_at_unix_ms": scheduled_at,
                    "command": {
                        "operation": "update",
                        "payload": {"title": "Desk", "price": "199.99"},
                        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                    },
                },
            )
            assert created.status_code == 200
            job_id = created.json()["job_id"]

            early = client.get(f"/api/v1/orchestrator/jobs/{job_id}")
            assert early.status_code == 200
            early_payload = early.json()
            assert early_payload["status"] == "queued"
            assert early_payload["scheduled_at_unix_ms"] == scheduled_at

            deadline = time.time() + 2.0
            final_payload = None
            while time.time() < deadline:
                polled = client.get(f"/api/v1/orchestrator/jobs/{job_id}")
                assert polled.status_code == 200
                final_payload = polled.json()
                if final_payload["status"] == "completed":
                    break
                time.sleep(0.05)

            assert final_payload is not None
            assert final_payload["status"] == "completed"
            assert final_payload["result"]["status"] == "success"
    finally:
        settings.enable_job_worker = False


def test_reconciliation_diff_detects_missing_and_mismatched_fields(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "ean": "4012345678901",
        "desired": {
            "operation": "update",
            "payload": {"title": "Desk", "price": "199.99"},
            "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
        },
        "actual": [
            {
                "target": {"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]},
                "payload": {"title": "Desk v2"},
            }
        ],
    }
    response = client.post("/api/v1/orchestrator/reconciliation/diff", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["report_id"]
    assert payload["channels_with_drift"] == 1
    assert payload["diffs"][0]["has_drift"] is True
    assert payload["diffs"][0]["missing_fields"] == ["price"]
    assert payload["diffs"][0]["mismatched_fields"] == ["title"]


def test_reconciliation_diff_can_create_repair_job_for_drifted_targets(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "ean": "4012345678901",
        "apply_repair": True,
        "desired": {
            "operation": "update",
            "payload": {"title": "Desk", "price": "199.99", "productReference": "OTTO-REF-1"},
            "channels": [
                {"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]},
                {"marketplace": "otto", "profile": "jv", "changed_fields": ["productReference"]},
            ],
        },
        "actual": [
            {
                "target": {"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]},
                "payload": {"title": "Desk", "price": "199.99"},
            },
            {
                "target": {"marketplace": "otto", "profile": "jv", "changed_fields": ["productReference"]},
                "payload": {},
            },
        ],
    }
    response = client.post("/api/v1/orchestrator/reconciliation/diff", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["channels_with_drift"] == 1
    assert payload["repair_job_id"] is not None

    repair_job = client.get(f"/api/v1/orchestrator/jobs/{payload['repair_job_id']}")
    assert repair_job.status_code == 200
    repair_job_payload = repair_job.json()
    assert repair_job_payload["status"] == "queued"
    assert repair_job_payload["operation"] == "update"


def test_reconciliation_direct_repair_forces_update_operation(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "ean": "4012345678901",
        "apply_repair": True,
        "desired": {
            "operation": "publish",
            "payload": {"title": "Desk", "price": "199.99"},
            "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
        },
        "actual": [{"target": {"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}, "payload": {}}],
    }
    response = client.post("/api/v1/orchestrator/reconciliation/diff", json=body)
    assert response.status_code == 200
    repair_job_id = response.json()["repair_job_id"]
    assert repair_job_id is not None
    repair_job = client.get(f"/api/v1/orchestrator/jobs/{repair_job_id}")
    assert repair_job.status_code == 200
    assert repair_job.json()["operation"] == "update"


def test_reconciliation_diff_rejects_empty_ean(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {"ean": "   ", "desired": {"payload": {}, "channels": []}, "actual": []}
    response = client.post("/api/v1/orchestrator/reconciliation/diff", json=body)
    assert response.status_code == 400
    assert response.json()["code"] == "orchestrator_ean_empty"


def test_reconciliation_report_get_and_list_by_ean(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    body = {
        "ean": "4012345678901",
        "desired": {
            "operation": "update",
            "payload": {"title": "Desk", "price": "199.99"},
            "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
        },
        "actual": [
            {
                "target": {"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]},
                "payload": {"title": "Desk"},
            }
        ],
    }
    created = client.post("/api/v1/orchestrator/reconciliation/diff", json=body)
    assert created.status_code == 200
    report_id = created.json()["report_id"]

    fetched = client.get(f"/api/v1/orchestrator/reconciliation/reports/{report_id}")
    assert fetched.status_code == 200
    fetched_payload = fetched.json()
    assert fetched_payload["report_id"] == report_id
    assert fetched_payload["ean"] == "4012345678901"
    assert fetched_payload["channels_with_drift"] == 1

    listed = client.get("/api/v1/orchestrator/reconciliation/reports", params={"ean": "4012345678901"})
    assert listed.status_code == 200
    list_payload = listed.json()
    assert list_payload["ean"] == "4012345678901"
    assert len(list_payload["reports"]) >= 1
    assert list_payload["reports"][0]["report_id"] == report_id


def test_reconciliation_report_not_found_and_empty_ean_contract(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)

    missing = client.get("/api/v1/orchestrator/reconciliation/reports/missing")
    assert missing.status_code == 404
    assert missing.json()["code"] == "orchestrator_reconciliation_report_not_found"

    invalid = client.get("/api/v1/orchestrator/reconciliation/reports", params={"ean": "   "})
    assert invalid.status_code == 400
    assert invalid.json()["code"] == "orchestrator_ean_empty"


def test_reconciliation_scheduler_auto_creates_repair_job_when_enabled(tmp_path):
    settings.enable_job_worker = False
    settings.enable_reconciliation_scheduler = True
    settings.reconciliation_scheduler_poll_interval_seconds = 0.05
    try:
        fake = FakeAdapters()
        with _client_with_fake_adapters(fake, tmp_path) as client:
            body = {
                "ean": "4012345678901",
                "apply_repair": False,
                "desired": {
                    "operation": "update",
                    "payload": {"title": "Desk", "price": "199.99"},
                    "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                },
                "actual": [
                    {
                        "target": {"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]},
                        "payload": {"title": "Desk"},
                    }
                ],
            }
            created = client.post("/api/v1/orchestrator/reconciliation/diff", json=body)
            assert created.status_code == 200
            report_id = created.json()["report_id"]

            deadline = time.time() + 2.0
            report_payload = None
            while time.time() < deadline:
                report = client.get(f"/api/v1/orchestrator/reconciliation/reports/{report_id}")
                assert report.status_code == 200
                report_payload = report.json()
                if report_payload.get("repair_job_id"):
                    break
                time.sleep(0.05)

            assert report_payload is not None
            assert report_payload["repair_job_id"] is not None

            repair_job = client.get(f"/api/v1/orchestrator/jobs/{report_payload['repair_job_id']}")
            assert repair_job.status_code == 200
            assert repair_job.json()["status"] in ("queued", "running", "completed")
            assert repair_job.json()["operation"] == "update"
    finally:
        settings.enable_reconciliation_scheduler = False


def test_reconciliation_reports_cleanup_ttl(tmp_path):
    store = SqliteJobStore(db_path=str(tmp_path / "jobs.sqlite3"))
    command = OrchestrateRequest.model_validate(
        {
            "operation": "update",
            "payload": {"title": "Desk", "price": "199.99"},
            "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
        }
    )
    store.create_reconciliation_report(
        report_id="report-old",
        request_id="req-old",
        ean="4012345678901",
        total_channels=1,
        channels_with_drift=1,
        diffs=[],
        desired_command=command,
        repair_job_id=None,
    )
    with store._connect() as conn:  # noqa: SLF001
        conn.execute(
            "UPDATE orchestrator_reconciliation_reports SET created_at_unix_ms = created_at_unix_ms - 86400000 WHERE report_id = ?",
            ("report-old",),
        )
        conn.commit()
    cleanup = store.cleanup_reconciliation_reports(ttl_seconds=60, max_per_ean=50)
    assert cleanup["deleted_by_ttl"] == 1


def test_reconciliation_reports_cleanup_max_per_ean(tmp_path):
    store = SqliteJobStore(db_path=str(tmp_path / "jobs.sqlite3"))
    command = OrchestrateRequest.model_validate(
        {
            "operation": "update",
            "payload": {"title": "Desk", "price": "199.99"},
            "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
        }
    )
    for idx in range(3):
        store.create_reconciliation_report(
            report_id=f"report-{idx}",
            request_id=f"req-{idx}",
            ean="4012345678901",
            total_channels=1,
            channels_with_drift=1,
            diffs=[],
            desired_command=command,
            repair_job_id=None,
        )

    cleanup = store.cleanup_reconciliation_reports(ttl_seconds=604800, max_per_ean=2)
    assert cleanup["deleted_by_limit"] == 1
    reports = store.list_reconciliation_reports_by_ean(ean="4012345678901", limit=10)
    assert len(reports) == 2


def test_job_store_claims_by_priority_order(tmp_path):
    store = SqliteJobStore(db_path=str(tmp_path / "jobs.sqlite3"))
    command = OrchestrateRequest.model_validate(
        {
            "operation": "update",
            "payload": {"title": "Desk", "price": "199.99"},
            "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
        }
    )
    store.create_job(job_id="job-bg", request_id="req-1", ean="1", command=command, priority=JobPriority.BACKGROUND)
    store.create_job(job_id="job-norm", request_id="req-2", ean="2", command=command, priority=JobPriority.NORMAL)
    store.create_job(job_id="job-urg", request_id="req-3", ean="3", command=command, priority=JobPriority.URGENT)

    first = store.claim_next_queued_job()
    second = store.claim_next_queued_job()
    third = store.claim_next_queued_job()
    assert first is not None and first["job_id"] == "job-urg"
    assert second is not None and second["job_id"] == "job-norm"
    assert third is not None and third["job_id"] == "job-bg"


def test_orchestrator_jobs_single_rate_limited(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    prev_window = settings.job_intake_rate_limit_window_seconds
    prev_max = settings.job_intake_rate_limit_max_jobs
    settings.job_intake_rate_limit_window_seconds = 60
    settings.job_intake_rate_limit_max_jobs = 1
    try:
        body = {
            "ean": "4012345678901",
            "command": {
                "operation": "update",
                "payload": {"title": "Desk", "price": "199.99"},
                "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
            },
        }
        first = client.post("/api/v1/orchestrator/jobs", json=body)
        assert first.status_code == 200
        second = client.post("/api/v1/orchestrator/jobs", json=body)
        assert second.status_code == 429
        assert second.json()["code"] == "orchestrator_jobs_rate_limited"
    finally:
        settings.job_intake_rate_limit_window_seconds = prev_window
        settings.job_intake_rate_limit_max_jobs = prev_max


def test_orchestrator_jobs_batch_rate_limited(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    prev_window = settings.job_intake_rate_limit_window_seconds
    prev_max = settings.job_intake_rate_limit_max_jobs
    settings.job_intake_rate_limit_window_seconds = 60
    settings.job_intake_rate_limit_max_jobs = 2
    try:
        body = {
            "items": [
                {
                    "ean": "4012345678901",
                    "command": {
                        "operation": "update",
                        "payload": {"title": "Desk", "price": "199.99"},
                        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                    },
                },
                {
                    "ean": "4012345678902",
                    "command": {
                        "operation": "update",
                        "payload": {"title": "Chair", "price": "99.99"},
                        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                    },
                },
                {
                    "ean": "4012345678903",
                    "command": {
                        "operation": "update",
                        "payload": {"title": "Lamp", "price": "49.99"},
                        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                    },
                },
            ]
        }
        response = client.post("/api/v1/orchestrator/jobs/batch", json=body)
        assert response.status_code == 429
        assert response.json()["code"] == "orchestrator_jobs_rate_limited"
    finally:
        settings.job_intake_rate_limit_window_seconds = prev_window
        settings.job_intake_rate_limit_max_jobs = prev_max


def test_orchestrator_jobs_single_rate_limited_by_priority_bucket(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    prev_window = settings.job_intake_rate_limit_window_seconds
    prev_max = settings.job_intake_rate_limit_max_jobs
    prev_urgent = settings.job_intake_rate_limit_max_urgent_jobs
    settings.job_intake_rate_limit_window_seconds = 60
    settings.job_intake_rate_limit_max_jobs = 100
    settings.job_intake_rate_limit_max_urgent_jobs = 1
    try:
        body = {
            "ean": "4012345678901",
            "priority": "urgent",
            "command": {
                "operation": "update",
                "payload": {"title": "Desk", "price": "199.99"},
                "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
            },
        }
        first = client.post("/api/v1/orchestrator/jobs", json=body)
        assert first.status_code == 200
        second = client.post("/api/v1/orchestrator/jobs", json=body)
        assert second.status_code == 429
        assert second.json()["code"] == "orchestrator_jobs_rate_limited"
    finally:
        settings.job_intake_rate_limit_window_seconds = prev_window
        settings.job_intake_rate_limit_max_jobs = prev_max
        settings.job_intake_rate_limit_max_urgent_jobs = prev_urgent


def test_orchestrator_jobs_batch_rate_limited_by_background_bucket(tmp_path):
    fake = FakeAdapters()
    client = _client_with_fake_adapters(fake, tmp_path)
    prev_window = settings.job_intake_rate_limit_window_seconds
    prev_max = settings.job_intake_rate_limit_max_jobs
    prev_background = settings.job_intake_rate_limit_max_background_jobs
    settings.job_intake_rate_limit_window_seconds = 60
    settings.job_intake_rate_limit_max_jobs = 100
    settings.job_intake_rate_limit_max_background_jobs = 1
    try:
        body = {
            "items": [
                {
                    "ean": "4012345678901",
                    "priority": "background",
                    "command": {
                        "operation": "update",
                        "payload": {"title": "Desk", "price": "199.99"},
                        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                    },
                },
                {
                    "ean": "4012345678902",
                    "priority": "background",
                    "command": {
                        "operation": "update",
                        "payload": {"title": "Chair", "price": "99.99"},
                        "channels": [{"marketplace": "hood", "account": "jv", "changed_fields": ["title", "price"]}],
                    },
                },
            ]
        }
        response = client.post("/api/v1/orchestrator/jobs/batch", json=body)
        assert response.status_code == 429
        assert response.json()["code"] == "orchestrator_jobs_rate_limited"
    finally:
        settings.job_intake_rate_limit_window_seconds = prev_window
        settings.job_intake_rate_limit_max_jobs = prev_max
        settings.job_intake_rate_limit_max_background_jobs = prev_background


def test_orchestrator_openapi_is_normalized(tmp_path):
    client = _client_with_fake_adapters(FakeAdapters(), tmp_path)
    response = client.get("/api/v1/openapi.json")
    assert response.status_code == 200
    payload = response.json()

    assert payload["tags"]
    assert payload["x-tagGroups"]

    create_job = payload["paths"]["/api/v1/orchestrator/jobs"]["post"]
    assert create_job["tags"] == ["Jobs"]
    assert create_job["description"]
    assert "200" in create_job["responses"]

    product_editor_load = payload["paths"]["/api/v1/orchestrator/product-editor/load"]["post"]
    assert product_editor_load["tags"] == ["Product Editor"]
    assert product_editor_load["description"]
