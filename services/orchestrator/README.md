# sb-sofort-orchestrator-service

Dedicated orchestration service for product updates from Sofort list.

## Purpose

- Receive one canonical product command from UI (`operation` + payload).
- Validate and normalize once.
- Route changes to marketplace adapters (HOOD, XL/JV, Kaufland, OTTO).
- Return per-channel status and final aggregated result.

## API

- `POST /api/v1/orchestrator/products/{ean}/update`
- `POST /api/v1/orchestrator/jobs`
- `POST /api/v1/orchestrator/jobs/batch`
- `POST /api/v1/orchestrator/jobs/status/batch`
- `GET /api/v1/orchestrator/jobs/{job_id}`
- `GET /api/v1/orchestrator/jobs/{job_id}/events`
- `GET /api/v1/orchestrator/jobs/{job_id}/attempts`
- `POST /api/v1/orchestrator/reconciliation/diff`
- `GET /api/v1/orchestrator/reconciliation/reports/{report_id}`
- `GET /api/v1/orchestrator/reconciliation/reports?ean={ean}`
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

## Request example

```json
{
  "operation": "update",
  "payload": {
    "title": "Desk",
    "description": "Oak desk",
    "price": "199.99",
    "quantity": 3,
    "storefront": "de",
    "productReference": "OTTO-123"
  },
  "channels": [
    {
      "marketplace": "hood",
      "account": "jv",
      "changed_fields": ["title", "price", "quantity"]
    },
    {
      "marketplace": "kaufland",
      "account": "jv",
      "changed_fields": ["title", "description", "storefront", "price"]
    },
    {
      "marketplace": "xljv",
      "site": "JV",
      "site_key": "JV_DE",
      "changed_fields": ["price", "quantity"]
    }
  ]
}
```

Notes:
- `operation` defaults to `update` if omitted (backward compatibility).
- Runtime channel execution is currently active for `update`; other operations return per-channel `orchestrator_operation_not_supported`.
- Job API is available as control-plane surface; jobs are queued in SQLite and processed by background worker loop.
- Job create and batch create support `Idempotency-Key` replay protection.
- Job create and batch create support deferred execution via `scheduled_at_unix_ms`.
- Job priority classes are supported: `urgent`, `normal`, `background` (worker claims by priority then FIFO inside class).
- Reconciliation diff endpoint accepts desired command + actual per-channel state and can enqueue a safe `repair` job for drifted channels only (`apply_repair=true`).

## Unified error contract

All orchestrator errors follow:

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "request_id": "uuid",
  "details": {}
}
```

- Request validation errors (`422`) follow this structure.
- Per-channel failures are embedded in `results[*].error` with the same structure.
- Full stable code list: `docs/error-codes.md`.

## Field routing policy

- Each marketplace has its own allow-list in `domain/field_registry.py`.
- Unknown `changed_fields` per marketplace are rejected per channel.
- Payload is filtered per marketplace before dispatch.
- `overrides` in channel target can inject marketplace-specific fields.

## Reliability baseline

- Request id generated if absent, and always returned in `X-Request-Id`.
- Idempotency key support (`Idempotency-Key` header, persistent SQLite replay cache).
- Per-channel timeout and bounded retries.
- Per-channel circuit-breaker fail-fast support (`orchestrator_channel_circuit_open`).
- Per-channel concurrency limiter fail-fast support (`orchestrator_channel_busy`).
- Partial success reporting (no false all-green responses).

## Observability

- `GET /healthz`: process liveness.
- `GET /readyz`: readiness with dependency check for idempotency SQLite.
- `GET /metrics`: request/error/latency counters + SQLite store metrics.
- State-changing update requests emit `audit_event=orchestrator_update` log entries.

## OpenAPI

- Generated schema: `openapi/orchestrator-openapi.json`
- Regenerate:

```bash
python tools/export_openapi.py
```

## Run locally

```bash
pip install -r requirements.txt
uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8011 --reload
```

## Env

See `.env.example`.

Worker controls:
- `ORCHESTRATOR_ENABLE_JOB_WORKER=1|0`
- `ORCHESTRATOR_JOB_WORKER_POLL_INTERVAL_SECONDS=0.2`
- `ORCHESTRATOR_ENABLE_RECONCILIATION_SCHEDULER=1|0`
- `ORCHESTRATOR_RECONCILIATION_SCHEDULER_POLL_INTERVAL_SECONDS=5`
- `ORCHESTRATOR_RECONCILIATION_REPORTS_TTL_SECONDS=604800`
- `ORCHESTRATOR_RECONCILIATION_REPORTS_MAX_PER_EAN=50`
- `ORCHESTRATOR_JOBS_BATCH_MAX_ITEMS=100`
- `ORCHESTRATOR_JOBS_STATUS_BATCH_MAX_ITEMS=200`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_WINDOW_SECONDS=60`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_JOBS=10000`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_URGENT_JOBS=10000`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_NORMAL_JOBS=10000`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_BACKGROUND_JOBS=10000`

Circuit breaker controls:
- `ORCHESTRATOR_ENABLE_CIRCUIT_BREAKER=1|0`
- `ORCHESTRATOR_CIRCUIT_BREAKER_FAILURE_THRESHOLD=3`
- `ORCHESTRATOR_CIRCUIT_BREAKER_OPEN_SECONDS=10`

Channel limiter controls:
- `ORCHESTRATOR_ENABLE_CHANNEL_LIMITER=1|0`
- `ORCHESTRATOR_CHANNEL_LIMITER_MAX_INFLIGHT_PER_KEY=1`

## MVP Tracking

- Readiness checklist: `docs/mvp-readiness-checklist.md`
- Stable error codes: `docs/error-codes.md`
- Capability matrix: `docs/capability-matrix.md`
- Frontend compatibility notes: `docs/frontend-compatibility-notes.md`
- SLO targets: `docs/slo-targets.md`
- Alerts spec: `docs/alerts-spec.md`
- Monitoring alert template: `docs/monitoring/alert-rules.example.yaml`
- Dashboard metrics map: `docs/dashboard-metrics-map.md`
- Monitoring dashboard template: `docs/monitoring/dashboard-panels.example.yaml`
- Incident runbook: `docs/runbooks/orchestrator-incidents.md`
- Release governance checklist: `docs/release-governance-checklist.md`
- Go-live checklist: `docs/go-live-checklist.md`

## Test

```bash
pytest -q
```
