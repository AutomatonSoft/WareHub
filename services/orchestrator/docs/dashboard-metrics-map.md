# Orchestrator Dashboard Metrics Map

Status date: 2026-05-16

## Scope

Mapping of existing service metrics to dashboard panels, alert rules, and runbook actions.

## Mapping Table

1. Availability
- Metric source: readiness probe (`/api/v1/readyz`) + HTTP status stream.
- Dashboard panel: `Ready State` + `API Availability % (30d)`.
- Alert link: `P1 Readiness failure`, `P1 API error-rate spike`.
- Runbook link: `docs/runbooks/orchestrator-incidents.md` (Fast Triage, Scenario A).

2. Request Error Rate
- Metric source: `/api/v1/metrics -> error_rate`.
- Dashboard panel: `HTTP Error Rate (5m/1h)`.
- Alert link: `P1 API error-rate spike`.
- Runbook link: `docs/runbooks/orchestrator-incidents.md` (Fast Triage, Scenario C).

3. Request Latency
- Metric source: `/api/v1/metrics -> latency_histogram_ms`.
- Dashboard panel: `Latency p50/p95/p99`.
- Alert link: optional latency threshold (team-defined in monitoring stack).
- Runbook link: `docs/runbooks/orchestrator-incidents.md` (Scenario A/C).

4. Queue Backlog
- Metric source: `/api/v1/metrics -> job_store_metrics.jobs_by_status`.
- Dashboard panel: `Jobs by Status` (queued/running/completed/failed).
- Alert link: `P2 Job backlog growth`.
- Runbook link: `docs/runbooks/orchestrator-incidents.md` (Scenario A).

5. Queue Throughput
- Metric source: job events and status transitions over time.
- Dashboard panel: `Job Completion Throughput`.
- Alert link: optional throughput degradation alarm (team-defined threshold).
- Runbook link: `docs/runbooks/orchestrator-incidents.md` (Scenario A).

6. Priority Mix
- Metric source: `/api/v1/metrics -> job_store_metrics.jobs_by_priority`.
- Dashboard panel: `Queue Priority Mix` (urgent/normal/background).
- Alert link: optional urgent backlog saturation (team-defined threshold).
- Runbook link: `docs/runbooks/orchestrator-incidents.md` (Scenario A).

7. Circuit Breaker State
- Metric source: `/api/v1/metrics -> circuit_breaker_metrics`.
- Dashboard panel: `Open Breaker Channels`.
- Alert link: `P2 Circuit breaker saturation`.
- Runbook link: `docs/runbooks/orchestrator-incidents.md` (Scenario C).

8. Intake Throttling
- Metric source: error code `orchestrator_jobs_rate_limited`.
- Dashboard panel: `Rate-Limited Intake %`.
- Alert link: `P2 Rate-limit pressure`.
- Runbook link: `docs/runbooks/orchestrator-incidents.md` (Scenario B).

9. Reconciliation Volume
- Metric source: `/api/v1/metrics -> job_store_metrics.reconciliation_reports_total`.
- Dashboard panel: `Reconciliation Reports Total`.
- Alert link: `P3 Reconciliation drift persistence`.
- Runbook link: `docs/runbooks/orchestrator-incidents.md` (Scenario D).

## Dashboard Layout Recommendation

1. Row 1 (Service Health)
- Ready state
- Availability %
- Error rate

2. Row 2 (Queue)
- Jobs by status
- Job throughput
- Priority mix

3. Row 3 (Reliability Controls)
- Circuit breaker open channels
- Rate-limited intake %

4. Row 4 (Reconciliation)
- Reconciliation reports total
- Drift trend (if external aggregation available)

## Implementation Notes

1. This document defines mapping and ownership boundaries only.
2. Actual dashboard/alert wiring is implemented in the external monitoring stack.
3. Alert thresholds are specified in `docs/alerts-spec.md`.
4. Machine-readable dashboard starter template:
   - `docs/monitoring/dashboard-panels.example.yaml`
