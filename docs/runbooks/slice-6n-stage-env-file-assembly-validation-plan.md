# Slice 6N - STAGE_ENV_FILE Assembly And Validation Plan

## 1. Scope

- Goal: define how the final `STAGE_ENV_FILE` should be assembled, validated, stored, and later written to `/opt/warehub/stage/.env` without committing real secrets.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This slice is planning-only.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- Slice 6L contract exists.
- Slice 6M checklist exists.
- Sanitized stage env template exists:
  - `infra/deploy/stage/env.stage.sanitized.template`
- No real `STAGE_ENV_FILE` has been created yet.
- No deploy has been performed yet.

## 3. STAGE_ENV_FILE Purpose

- `STAGE_ENV_FILE` is the final runtime env payload for stage.
- It must be created from the sanitized template plus GitHub Environment secrets and variables.
- It must be stored as GitHub Environment secret `STAGE_ENV_FILE`.
- It may later be written to `/opt/warehub/stage/.env` only during an approved deploy or preflight slice.
- It must never be committed to the repository.

## 4. Assembly Input Sources

| Source | Type | Examples | Security handling |
|---|---|---|---|
| `infra/deploy/stage/env.stage.sanitized.template` | repository template | `STAGE_DOMAIN`, `STAGE_FRONTEND_PORT`, placeholder secret fields | safe to read from repo; never treat placeholders as final values |
| GitHub Environment variables | non-secret deployment metadata | `STAGE_DOMAIN`, `STAGE_DEPLOY_PATH`, `STAGE_IMAGE_TAG`, image refs, ports | values may be listed carefully; avoid unnecessary log sharing |
| GitHub Environment secrets | secret-bearing runtime values | `STAGE_POSTGRES_PASSWORD`, `STAGE_GHCR_TOKEN`, `STAGE_SERVICES_SECRET_KEY` | names may be verified; values must never be printed |
| operator or password manager values | operator-only source of truth | missing `TODO / unknown` keys, integration toggles, DSNs, storage settings | must stay outside git and outside shared logs |

## 5. Non-Secret Values Expected In STAGE_ENV_FILE

### Domain and URLs

- `STAGE_DOMAIN=stagewarehub.automatonsoft.de`
- `STAGE_PUBLIC_API_BASE_URL=TODO / unknown`
- `STAGE_PUBLIC_SERVICES_API_BASE_URL=TODO / unknown`
- `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL=TODO / unknown`

### Ports

- `STAGE_FRONTEND_PORT=8941`
- `STAGE_BACKEND_PORT=8942`
- `STAGE_POSTGRES_PORT=8943`
- `STAGE_SERVICES_PORT=8944`
- `STAGE_ORCHESTRATOR_PORT=8945`

### Image refs and tags

- `BACKEND_IMAGE=ghcr.io/ravilkadev0/warehub/backend`
- `BACKEND_STAGE_TAG=stage-a1c2946`
- `FRONTEND_IMAGE=ghcr.io/ravilkadev0/warehub/frontend`
- `FRONTEND_STAGE_TAG=stage-a1c2946`
- `MOBILE_IMAGE=ghcr.io/ravilkadev0/warehub/mobile`
- `MOBILE_STAGE_TAG=stage-a1c2946`
- `SERVICES_IMAGE=ghcr.io/ravilkadev0/warehub/services`
- `SERVICES_STAGE_TAG=stage-a1c2946`
- `ORCHESTRATOR_IMAGE=ghcr.io/ravilkadev0/warehub/orchestrator`
- `ORCHESTRATOR_STAGE_TAG=stage-a1c2946`
- `ORCHESTRATOR_APP_VERSION=TODO / unknown`

### Runtime toggles and non-secret runtime settings

- `STAGE_RUN_MIGRATIONS_ON_STARTUP=TODO / unknown`
- `STAGE_POSTGRES_DB=TODO / unknown`
- `STAGE_POSTGRES_USER=TODO / unknown`
- `BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=TODO / unknown`
- `BACKEND_UPLOAD_STORAGE_BACKEND=TODO / unknown`
- `BACKEND_UPLOAD_FTP_HOST=TODO / unknown`
- `BACKEND_UPLOAD_FTP_USER=TODO / unknown`
- `BACKEND_UPLOAD_FTP_PORT=TODO / unknown`
- `BACKEND_UPLOAD_FTP_ROOT_DIR=TODO / unknown`
- `BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR=TODO / unknown`
- `BACKEND_UPLOAD_FTP_AVATAR_DIR=TODO / unknown`
- `BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL=TODO / unknown`
- `MOBILE_STAGE_APP_VERSION=TODO / unknown`
- `MOBILE_STAGE_APK_URL=TODO / unknown`
- `MOBILE_PROD_APP_VERSION=TODO / unknown`
- `MOBILE_PROD_APK_URL=TODO / unknown`
- `STAGE_SERVICES_ALLOWED_HOSTS=TODO / unknown`
- `STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL=TODO / unknown`
- `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS=TODO / unknown`
- `ORCHESTRATOR_HTTP_RETRIES=TODO / unknown`
- `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS=TODO / unknown`
- `ORCHESTRATOR_SERVICE_NAME=TODO / unknown`
- `ORCHESTRATOR_LOG_LEVEL=TODO / unknown`
- `AFTERBUY_JV_LOGIN=TODO / unknown`
- `AFTERBUY_XL_LOGIN=TODO / unknown`
- `AFTERBUY_JV_LOGIN_URL=TODO / unknown`
- `AFTERBUY_XL_LOGIN_URL=TODO / unknown`
- `AFTERBUY_JV_COOKIE_CACHE_FILE=TODO / unknown`
- `AFTERBUY_XL_COOKIE_CACHE_FILE=TODO / unknown`
- `FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=TODO / unknown`
- `FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=TODO / unknown`
- `FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=TODO / unknown`

## 6. Secret Values Expected In STAGE_ENV_FILE

### Postgres password

- `STAGE_POSTGRES_PASSWORD`

### Services secret key

- `SERVICES_SECRET_KEY`

### Backend Sentry DSN

- `BACKEND_STAGE_SENTRY_DSN`

### FTP password

- `BACKEND_UPLOAD_FTP_PASS`

### Afterbuy JV and XL passwords

- `AFTERBUY_JV_PASS`
- `AFTERBUY_XL_PASS`

## 7. Unknown Values Still Requiring Operator Decision

- `STAGE_POSTGRES_DB`
- `STAGE_POSTGRES_USER`
- `STAGE_PUBLIC_API_BASE_URL`
- `STAGE_PUBLIC_SERVICES_API_BASE_URL`
- `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL`
- `ORCHESTRATOR_APP_VERSION`
- `ORCHESTRATOR_SERVICE_NAME`
- `ORCHESTRATOR_LOG_LEVEL`
- `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS`
- `ORCHESTRATOR_HTTP_RETRIES`
- `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS`
- `BACKEND_UPLOAD_FTP_HOST`
- `BACKEND_UPLOAD_FTP_USER`
- `BACKEND_UPLOAD_FTP_PORT`
- `BACKEND_UPLOAD_FTP_ROOT_DIR`
- `BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR`
- `BACKEND_UPLOAD_FTP_AVATAR_DIR`
- `AFTERBUY_JV_LOGIN_URL`
- `AFTERBUY_XL_LOGIN_URL`
- `AFTERBUY_JV_COOKIE_CACHE_FILE`
- `AFTERBUY_XL_COOKIE_CACHE_FILE`
- `BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE`
- `FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE`
- `FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`
- `FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`
- `STAGE_RUN_MIGRATIONS_ON_STARTUP`

## 8. Local/Operator-Only Assembly Plan

Command shapes only. NOT EXECUTED in this slice.

```bash
# copy sanitized template outside the repository
cp infra/deploy/stage/env.stage.sanitized.template <local_operator_only_path>/stage.env

# replace TODO / unknown fields with operator-approved non-secret values
# replace __SET_IN_GITHUB_ENVIRONMENT__ placeholders with operator-only secret values

# validate that no placeholders remain
grep -n "TODO_UNKNOWN\|__SET_IN_GITHUB_ENVIRONMENT__" <local_operator_only_path>/stage.env

# upload the final file as GitHub Environment secret
gh secret set STAGE_ENV_FILE --env stage < <local_operator_only_path>/stage.env
```

Assembly expectations:

- copy the sanitized template to a temporary local file outside the repository
- replace `TODO_UNKNOWN` values with approved stage values
- replace `__SET_IN_GITHUB_ENVIRONMENT__` placeholders from password manager or operator records
- validate that no unresolved placeholders remain
- the `grep` command is intended to detect unresolved placeholders
- if `grep` finds `TODO_UNKNOWN` or `__SET_IN_GITHUB_ENVIRONMENT__`, validation must fail
- successful validation means the command returns no unresolved placeholders
- do not print secret values while debugging failures
- upload the final file as GitHub Environment secret `STAGE_ENV_FILE`

## 9. Validation Plan Before Writing To Server

- check that no `TODO_UNKNOWN` remains unless intentionally allowed
- check that no `__SET_IN_GITHUB_ENVIRONMENT__` remains
- treat any `grep` match for `TODO_UNKNOWN` or `__SET_IN_GITHUB_ENVIRONMENT__` as a validation failure
- successful placeholder validation means no unresolved placeholder lines are returned
- do not print secret values while debugging validation failures
- check that required keys exist
- check that there are no duplicate conflicting keys
- check that values match stage environment and not prod
- check that ports match `8941` to `8945`
- check that image tag matches `stage-a1c2946`
- check that no secrets are printed in CI logs
- check that `verify-required-env.ps1` required keys will be present:
  - `ORCHESTRATOR_IMAGE`
  - `ORCHESTRATOR_STAGE_TAG`
  - `ORCHESTRATOR_APP_VERSION`
  - `STAGE_PUBLIC_SERVICES_API_BASE_URL`
  - `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL`

## 10. Safe GitHub CLI Command Shapes

Command shapes only. NOT EXECUTED in this slice.

```bash
gh secret set STAGE_ENV_FILE --env stage < path/to/local/operator-only/stage.env
gh secret list --env stage
```

Important:

- do not print `STAGE_ENV_FILE`
- do not commit the local generated env file
- remove the local generated env file after upload

## 11. Future Server Write Plan

Documented only. NOT EXECUTED in this slice.

- a later deploy or preflight workflow should write `STAGE_ENV_FILE` to:
  - `/opt/warehub/stage/.env`
- file permissions should be restrictive
- owner should be `cddeploy`
- do not write the file in this slice

## 12. Risk Notes

- a single large `STAGE_ENV_FILE` secret is convenient but harder to audit and rotate
- individual secrets are easier to rotate
- a wrong env file could point stage to prod DB or prod storage
- leaking `STAGE_ENV_FILE` exposes multiple secrets at once
- the generated local file must be securely deleted after use
- any exposed GHCR token must be revoked or replaced if not already done

## 13. Completion Criteria

- all required GitHub Environment variables exist
- all required GitHub Environment secrets exist
- `STAGE_ENV_FILE` is assembled operator-side
- `STAGE_ENV_FILE` is uploaded as environment secret
- no real `.env` is committed
- no secret values are printed
- repo-safety is green

## 14. Remaining Blockers Before First Stage Deploy

- `STAGE_ENV_FILE` is not assembled or verified in this slice
- GitHub Environment is not verified yet
- `docker compose config` is not run with real env
- migration plan is not executed
- deploy workflow is not added
- cert renewal automation is not confirmed
- nginx upstream still returns `502` until containers run

## 15. Recommended Next Slice

- `Slice 6O - stage compose config preflight plan with real env after secret setup`

Important:

- Slice 6O should not deploy
- Slice 6O may write `.env` only after explicit approval
- Slice 6O should run `docker compose config` only, not `up`

## 16. Explicit Non-Goals

- no deploy
- no docker compose up
- no real `.env` creation
- no server changes
- no SSH
- no nginx reload
- no certbot changes
- no GitHub Secrets changes
- no GitHub Variables changes
- no deploy workflow added
- no runtime changes
- no script changes
- no compose changes
- no Dockerfile changes
- no source changes
