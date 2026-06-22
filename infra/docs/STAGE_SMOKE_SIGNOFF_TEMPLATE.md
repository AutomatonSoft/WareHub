# STAGE_SMOKE_SIGNOFF_TEMPLATE

Date (UTC):
Environment: stage
Release/Version:
Operator:
Reviewer:

## Scope

- Frontend login flow: PASS/FAIL
- Backend health endpoints: PASS/FAIL
- Services health endpoints: PASS/FAIL
- Orchestrator health endpoints: PASS/FAIL
- Mobile update metadata endpoint: PASS/FAIL
- Critical inventory flow: PASS/FAIL
- Marketplace read flow (Hood/Kaufland/XLJV): PASS/FAIL
- Orchestrator job create/status flow: PASS/FAIL

## Evidence

- Attach links/paths to logs, screenshots, and preflight artifacts.
- Services health endpoint check (expected HTTP 200):
  - `curl -fsS http://127.0.0.1:${STAGE_GATEWAY_PORT:-8940}/api/v1/services/healthz`

## Known Issues

- List any observed issues and severity.

## Decision

- Stage smoke result: APPROVED / REJECTED
- Notes:
