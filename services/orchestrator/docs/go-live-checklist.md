# Orchestrator Go-Live Checklist

Status date: 2026-05-16

## 1) Pre-Flight (T-1 day)

1. Confirm release candidate commit/tag is frozen.
2. Run quality gates:
- `ruff check src tests tools`
- `pytest -q`
- `python tools/export_openapi.py`
3. Confirm docs are up to date:
- `docs/error-codes.md`
- `docs/slo-targets.md`
- `docs/alerts-spec.md`
- `docs/runbooks/orchestrator-incidents.md`
4. Confirm env config reviewed:
- worker/scheduler flags
- rate-limit and priority limits
- circuit-breaker settings

## 2) Stage Verification (T-0 before prod)

1. Deploy release candidate to stage.
2. Verify service health:
- `GET /api/v1/healthz` returns `ok`
- `GET /api/v1/readyz` returns `ready`
3. Verify metrics contract:
- `GET /api/v1/metrics` includes `job_store_metrics` and `circuit_breaker_metrics`.
4. Run stage smoke scenarios:
- single job create + status polling
- batch job create + batch status
- scheduled job execution after `scheduled_at_unix_ms`
- reconciliation diff + report read
5. Verify alert routing test:
- test alert reaches on-call channel.

## 3) Production Rollout

1. Announce maintenance/release window in team channel.
2. Deploy orchestrator image/tag to production.
3. Run immediate post-deploy checks:
- `/api/v1/healthz`
- `/api/v1/readyz`
- sample `/api/v1/metrics`
4. Execute one controlled canary flow:
- one known EAN through orchestrator update/job path.

## 4) First 60 Minutes Monitoring

1. Watch dashboard panels:
- error rate
- jobs queued/running/completed/failed
- breaker open channels
- rate-limited intake ratio
2. Check top error codes from logs.
3. Validate queue is draining (no sustained queued growth).

## 5) Rollback Trigger and Action

Trigger if any:
1. readiness failing > 5 minutes.
2. severe error-rate spike persists > 10 minutes.
3. queue backlog grows continuously with no recovery trend.

Action:
1. rollback to previous known-good release.
2. verify `/api/v1/healthz` and `/api/v1/readyz`.
3. confirm jobs resume progression.
4. record incident notes and root-cause task.

## 6) Go-Live Sign-Off

1. Product/owner confirms critical flows healthy.
2. On-call confirms alerts and runbook links are correct.
3. Team posts final go-live confirmation with:
- release tag
- timestamp
- known limitations (if any)
