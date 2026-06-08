# Orchestrator MVP Readiness Checklist

Status date: 2026-05-16

## Contract

- [x] Versioned endpoint under `/api/v1`.
- [x] OpenAPI generated in `openapi/orchestrator-openapi.json`.
- [x] Frontend client generated/synced from OpenAPI.
- [x] Stable error code catalog documented (`docs/error-codes.md`).

## Core behavior

- [x] Canonical payload accepted and routed by channels.
- [x] Marketplace field allow-list + required fields enforced.
- [x] Partial success/failure aggregation implemented.
- [x] Idempotency replay by `Idempotency-Key`.

## Reliability

- [x] Timeout + bounded retry for upstream calls.
- [x] Request id propagated and returned in responses.
- [x] Circuit breaker or fail-fast policy for unstable upstreams.

## Observability

- [x] `GET /healthz`.
- [x] `GET /readyz` with dependency check (idempotency SQLite).
- [x] `GET /metrics` with request/error/latency + store metrics.
- [x] Structured logs with request metadata.
- [x] Audit event log for state-changing update operation.

## Testing

- [x] Unit/integration-style API tests for success, failures, validation.
- [x] Regression tests for request_id consistency.
- [x] Tests for readiness degradation and metrics endpoint.
- [x] End-to-end test with real `database_service` in docker-compose.

## Release gate before MVP sign-off

- [x] Run orchestrator in full local stack and validate all marketplaces.
- [x] Validate frontend UX mapping for all documented `error.code` values (automated Playwright mock suite with `E2E_BYPASS_AUTH=1`).
- [x] Add CI job for orchestrator service (`lint`, tests, OpenAPI drift check).

## Latest E2E Snapshot (2026-05-14)

- Request: `POST /api/v1/orchestrator/products/4012345678901/update` with all 4 channels.
- Final status: `partial_success`.
- `kaufland`: success (`200`).
- `otto`: success (`200`).
- `hood`: failed (`409`, upstream `hood_idempotency_in_progress`).
- `jv/xl`: failed (`404`, upstream product not found by EAN).

Interpretation:
- Orchestrator routing, error mapping, and partial-success aggregation are working in full stack.
- Remaining work is primarily data/state readiness in upstream services and frontend UX mapping for channel failures.

## Roadmap Progress Snapshot

- [x] Phase 1: Contract-first v1 (`operation`, compatibility, OpenAPI sync).
- [x] Phase 2: Async job control-plane (`/jobs`, worker, attempts/events).
- [x] Phase 3: Reliability hardening (circuit breaker, concurrency limiter, fail-fast paths).
- [x] Phase 4: Reconciliation base (`/reconciliation/diff`, reports, safe repair jobs, scheduler, retention).
- [x] Phase 5 (partial): Bulk + scheduling (`jobs/batch`, `jobs/status/batch`, `scheduled_at_unix_ms`, priority classes, intake rate governance).
- [ ] Phase 5 (remaining): advanced throttling policies beyond intake guard (if needed per production load profile).
- [x] Phase 6 (partial): operations docs foundation (`slo-targets`, `alerts-spec`, incident runbook, release governance checklist).
- [x] Phase 6 (partial+): dashboard mapping spec documented (`dashboard-metrics-map`).
- [ ] Phase 6 (remaining): production dashboard + alert automation wiring in monitoring stack.
