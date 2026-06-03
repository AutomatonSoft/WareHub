# Orchestrator Alerts Specification

Status date: 2026-05-16

## Scope

Alert rules for `sb-sofort-orchestrator-service` based on currently exposed metrics and stable error codes.

## Severity Levels

1. `P1` critical
- immediate action required (service unavailable or major reliability failure).

2. `P2` high
- degraded behavior with active user/business impact.

3. `P3` medium
- early warning, potential degradation trend.

## Alert Rules

1. Readiness failure (`P1`)
- Condition: `/readyz` non-ready for 5 consecutive minutes.
- Signal: readiness probe.
- Action: trigger incident runbook, consider rollback criteria.

2. API error-rate spike (`P1`)
- Condition: `error_rate` > 5% for 10 minutes.
- Signal: `/metrics` `error_rate`.
- Action: inspect top error codes and recent deploy/config changes.

3. Job backlog growth (`P2`)
- Condition: `job_store_metrics.jobs_by_status.queued` grows continuously for 15 minutes.
- Signal: `/metrics` `job_store_metrics`.
- Action: verify worker throughput, scheduled jobs share, upstream health.

4. Rate-limit pressure (`P2`)
- Condition: `orchestrator_jobs_rate_limited` responses > 1% of job intake traffic for 10 minutes.
- Signal: response/log error code.
- Action: evaluate intake burst profile and current rate-limit settings.

5. Circuit breaker saturation (`P2`)
- Condition: `circuit_breaker_metrics.open_channels_total >= 2` for 10 minutes.
- Signal: `/metrics` `circuit_breaker_metrics`.
- Action: investigate upstream marketplace instability and preserve fail-fast behavior.

6. Reconciliation drift persistence (`P3`)
- Condition: `reconciliation_reports_total` grows while unresolved drift count trend increases for 24h.
- Signal: reconciliation reports + periodic sampling.
- Action: inspect repair effectiveness and desired payload correctness.

## Routing

1. `P1`
- page on-call immediately.
- incident channel + owner escalation.

2. `P2`
- notify service owner + on-call.
- response target <= 30 minutes.

3. `P3`
- create tracked issue for triage within business day.

## Dependencies

Alert rules depend on:
- `GET /readyz`
- `GET /metrics`
- structured logs carrying `request_id`, route, status, latency.

## Handoff Artifact

- Machine-readable starter template for monitoring stack integration:
  - `docs/monitoring/alert-rules.example.yaml`

## Review Cadence

1. Weekly
- validate false positive/false negative ratio.

2. Monthly
- tune thresholds using recent load profile and SLO budget burn.
