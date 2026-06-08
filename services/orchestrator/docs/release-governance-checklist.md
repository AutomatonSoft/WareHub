# Orchestrator Release Governance Checklist

Status date: 2026-05-16

## Scope

Release governance for `sb-sofort-orchestrator-service` changes before stage/prod rollout.

## Pre-Release Gates

1. Contract gate
- `python tools/export_openapi.py` executed.
- no unintended OpenAPI drift in `openapi/orchestrator-openapi.json`.
- new/changed error codes documented in `docs/error-codes.md`.

2. Quality gate
- `ruff check src tests tools` passes.
- `pytest -q` passes.
- no failing regression in job/reconciliation/bulk paths.

3. Runtime config gate
- `.env.example` updated for new required flags.
- defaults reviewed for:
  - rate-limit controls
  - scheduler controls
  - retry/circuit controls

4. Observability gate
- `/healthz`, `/readyz`, `/metrics` respond in target environment.
- key metrics visible:
  - `request_rate`
  - `error_rate`
  - `job_store_metrics`
  - `circuit_breaker_metrics`

5. Operations docs gate
- `docs/slo-targets.md` reviewed.
- `docs/runbooks/orchestrator-incidents.md` updated for new failure modes.

## Rollback Checklist

1. Trigger criteria
- sustained readiness failures
- severe queue growth without recovery
- critical channel failure wave with elevated 5xx/timeouts

2. Rollback actions
- deploy previous known-good image/tag.
- restore previous environment config if release changed limits/flags.
- validate post-rollback:
  - `/healthz` = ok
  - `/readyz` = ready
  - queue transition resumes (`queued -> running/completed`)

3. Data safety checks
- ensure rollback does not require schema downgrade.
- verify queued jobs remain readable and processable by rollback version.

## On-Call Handoff Template

1. Release summary
- release id/tag:
- key changes:
- config changes:

2. Risk focus
- highest-risk endpoints:
- expected transient symptoms:

3. Monitoring focus (first 60 minutes)
- error rate trend:
- rate-limit rejections:
- queue backlog trend:
- breaker open channels:

4. Escalation path
- primary owner:
- secondary owner:
- rollback approver:
