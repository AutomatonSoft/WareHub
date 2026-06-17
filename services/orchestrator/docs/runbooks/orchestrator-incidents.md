# Orchestrator Incident Runbook

Status date: 2026-05-16

## Scope

Runbook for `sb-sofort-orchestrator-service` incidents affecting:
- request handling
- job queue processing
- reconciliation automation

## Fast Triage Checklist

1. Check liveness/readiness:
- `GET /api/v1/healthz`
- `GET /api/v1/readyz`

2. Check live metrics:
- `GET /api/v1/metrics`
- focus on:
  - `error_rate`
  - `job_store_metrics.jobs_by_status`
  - `circuit_breaker_metrics`

3. Check recent error codes:
- from logs / API responses:
  - `orchestrator_jobs_rate_limited`
  - `orchestrator_channel_circuit_open`
  - `orchestrator_channel_timeout`
  - `orchestrator_channel_upstream_5xx`

## Scenario A: Queue Backlog Growth

Symptoms:
- many jobs in `queued`
- slow transition to `running/completed`

Actions:
1. verify worker enabled:
- `ORCHESTRATOR_ENABLE_JOB_WORKER=1`
2. verify poll interval:
- `ORCHESTRATOR_JOB_WORKER_POLL_INTERVAL_SECONDS`
3. sample job timelines:
- `GET /api/v1/orchestrator/jobs/{job_id}/events`
4. if scheduled jobs dominate queue:
- inspect `scheduled_at_unix_ms` distribution in fetched jobs.

Mitigation:
- temporarily increase worker throughput by reducing poll interval.
- reduce intake pressure using stricter batch usage or temporary client-side backoff.

## Scenario B: High Rate-Limit Rejections

Symptoms:
- many `429` with `orchestrator_jobs_rate_limited`

Actions:
1. confirm current limits:
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_WINDOW_SECONDS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_JOBS`
2. inspect whether bursts are expected or abusive.
3. compare queued backlog before raising limits.

Mitigation:
- short-term: slightly increase `MAX_JOBS` if worker can absorb.
- long-term: enforce client batching cadence and retry jitter.

## Scenario C: Upstream Marketplace Instability

Symptoms:
- rising per-channel failures:
  - timeout/network/upstream_5xx
- open breaker channels

Actions:
1. inspect `circuit_breaker_metrics.open_channels`.
2. inspect channel failure mix from recent responses/logs.
3. verify upstream dependency health independently.

Mitigation:
- keep breaker enabled.
- avoid disabling fail-fast protections during instability.
- re-run failed operations through queued jobs after upstream recovery.

## Scenario D: Reconciliation Drift Not Converging

Symptoms:
- repeated reports with drift
- repair jobs not reducing mismatch

Actions:
1. fetch latest reports:
- `GET /api/v1/orchestrator/reconciliation/reports?ean={ean}`
2. inspect `diffs` fields and `repair_job_id`.
3. inspect repair job events/attempts:
- `/jobs/{job_id}`
- `/jobs/{job_id}/events`
- `/jobs/{job_id}/attempts`

Mitigation:
- verify desired payload correctness first.
- verify upstream channel data acceptance/validation constraints.

## Escalation

Escalate to service owner when:
1. readiness fails > 5 minutes.
2. queue backlog grows for > 15 minutes with no recovery trend.
3. breaker remains open for critical channels beyond expected upstream outage window.
