# Orchestrator SLO Targets

Status date: 2026-05-16

## Scope

This document defines service-level objectives for `sb-sofort-orchestrator-service` control-plane and orchestration request paths.

## SLIs

1. API availability
- Definition: successful responses / total requests for orchestrator API routes.
- Source: HTTP status codes in structured logs and `/api/v1/metrics` request counters.

2. Update request success quality
- Definition: share of `POST /api/v1/orchestrator/products/{ean}/update` requests that finish without top-level validation/transport failure.
- Source: API responses + error codes in logs.

3. Queue processing latency
- Definition: time from `job_created` to terminal state (`job_completed` or `job_failed`).
- Source: `orchestrator_job_events` timeline + `/api/v1/orchestrator/jobs/{job_id}/events`.

4. Intake throttling pressure
- Definition: rate of `orchestrator_jobs_rate_limited` errors.
- Source: error contract codes in responses/logs.

## Initial Targets

1. API availability (rolling 30d)
- Target: >= 99.5%

2. Update path server-side reliability (rolling 30d)
- Target: >= 99.0% requests produce deterministic orchestrator response envelope (including partial success/failure matrix).

3. Queue processing latency (rolling 7d)
- Target: p95 <= 60s for queued jobs under normal load profile.

4. Intake throttling pressure (rolling 7d)
- Target: <= 1.0% of job intake requests rejected by rate governance.

## Error Budget Policy

1. If API availability budget burn exceeds 50% mid-window:
- freeze non-critical feature releases for orchestrator stream.
- prioritize reliability fixes and test hardening.

2. If intake throttling exceeds target for 2 consecutive days:
- review `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_*` values.
- evaluate worker throughput and queue backlog before increasing limits.

## Review Cadence

1. Weekly:
- inspect `/api/v1/metrics` snapshots and top error codes.

2. Monthly:
- adjust targets based on observed production traffic shape and incident history.
