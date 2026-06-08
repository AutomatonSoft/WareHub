# Slice 6P - STAGE_ENV_FILE Concrete Key Map And Operator Checklist

## 1. Scope

- Goal: define the concrete key map required to assemble `STAGE_ENV_FILE` before uploading it as a GitHub Environment secret.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This slice is planning-only.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- GitHub Environment `stage` exists.
- Initial stage variables exist.
- Initial stage secrets exist:
  - `STAGE_SSH_KEY`
  - `STAGE_GHCR_TOKEN`
  - `STAGE_POSTGRES_PASSWORD`
  - `STAGE_SERVICES_SECRET_KEY`
- `STAGE_ENV_FILE` has not been created yet.
- No deploy has been performed.

## 3. Required Key Sources

| Key group | Source file | Status |
|---|---|---|
| base stage env keys and placeholders | `infra/deploy/stage/env.stage.sanitized.template` | confirmed |
| runtime env keys consumed by stage services | `infra/deploy/stage/docker-compose.yml` | confirmed |
| required validation keys for env preflight | `infra/scripts/verify-required-env.ps1` | confirmed |

## 4. Required Keys From verify-required-env.ps1

- `ORCHESTRATOR_IMAGE`
- `ORCHESTRATOR_STAGE_TAG`
- `ORCHESTRATOR_APP_VERSION`
- `STAGE_PUBLIC_SERVICES_API_BASE_URL`
- `PROD_PUBLIC_SERVICES_API_BASE_URL`
- `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL`
- `PROD_PUBLIC_ORCHESTRATOR_API_BASE_URL`

## 5. Gap Found

- The stage sanitized template does not include `PROD_PUBLIC_SERVICES_API_BASE_URL`.
- The stage sanitized template does not include `PROD_PUBLIC_ORCHESTRATOR_API_BASE_URL`.
- `STAGE_ENV_FILE` must include both missing `PROD_PUBLIC_*` keys manually before upload unless the template or validation script is changed in a future slice.

## 6. Proposed Non-Secret Stage Values

- `STAGE_POSTGRES_DB=warehub_stage`
- `STAGE_POSTGRES_USER=warehub_stage`
- `STAGE_PUBLIC_API_BASE_URL=https://stagewarehub.automatonsoft.de/api`
- `STAGE_PUBLIC_SERVICES_API_BASE_URL=https://stagewarehub.automatonsoft.de/services`
- `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL=https://stagewarehub.automatonsoft.de/orchestrator`
- `PROD_PUBLIC_SERVICES_API_BASE_URL=https://warehub.automatonsoft.de/services`
- `PROD_PUBLIC_ORCHESTRATOR_API_BASE_URL=https://warehub.automatonsoft.de/orchestrator`
- `ORCHESTRATOR_APP_VERSION=stage-a1c2946`
- `ORCHESTRATOR_SERVICE_NAME=warehub-orchestrator-stage`
- `ORCHESTRATOR_LOG_LEVEL=INFO`
- `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS=8`
- `ORCHESTRATOR_HTTP_RETRIES=2`
- `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS=86400`
- `STAGE_RUN_MIGRATIONS_ON_STARTUP=false`
- `STAGE_SERVICES_ALLOWED_HOSTS=127.0.0.1,localhost,stagewarehub.automatonsoft.de`
- `STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL=http://services:8000`

## 7. Integration Placeholders For Disabled Stage Integrations

- If Sentry, FTP, or Afterbuy are disabled for the first stage preflight, their values still must be decided intentionally before `STAGE_ENV_FILE` upload.
- No real credentials, DSNs, passwords, or tokens belong in this runbook.
- `BACKEND_STAGE_SENTRY_DSN` may be empty only if the application tolerates an empty DSN.
- FTP fields may be empty only if the storage backend is changed away from `ftp` or the application tolerates empty FTP settings.
- Afterbuy values must not reuse prod credentials unless that is explicitly approved.

## 8. Secret Keys Still Needed For STAGE_ENV_FILE

- `STAGE_POSTGRES_PASSWORD`
- `SERVICES_SECRET_KEY`
- `BACKEND_STAGE_SENTRY_DSN`
- `BACKEND_UPLOAD_FTP_PASS`
- `AFTERBUY_JV_PASS`
- `AFTERBUY_XL_PASS`

## 9. Operator Checklist Before Uploading STAGE_ENV_FILE

- fill every `TODO_UNKNOWN`
- remove every `__SET_IN_GITHUB_ENVIRONMENT__`
- add missing `PROD_PUBLIC_*` keys
- verify stage values do not point to prod DB or prod storage
- verify no secret values are printed
- upload as `STAGE_ENV_FILE` only after review

## 10. Recommended Next Action

- operator assembles `STAGE_ENV_FILE` locally outside the repository
- then uploads it as GitHub Environment secret `STAGE_ENV_FILE`
- then verifies by secret name only

## 11. Explicit Non-Goals

- no deploy
- no docker compose up
- no real `.env` creation
- no GitHub Secret changes
- no server changes
- no SSH
- no source changes
- no script changes
- no compose changes
- no template changes
