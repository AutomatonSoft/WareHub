# Slice 6F - Stage Host Contract And Deploy Preflight Checklist

## 1. Scope

- Goal: define the stage host contract and deploy preflight checklist before any real stage deploy implementation.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This report is factual and based only on repository files and the provided verified GHCR publish facts.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- CI is green.
- Docker build validation coverage is complete for the currently identified Dockerfiles.
- GHCR publish has been verified successfully.
- Verified immutable image tag: `stage-a1c2946`
- No deploy has been performed yet.

## 3. Stage Host Contract

| Item | Value | Status | Notes |
|---|---|---|---|
| stage host/IP | `TODO / unknown` | unknown | not present in inspected repository files |
| SSH user | `TODO / unknown` | unknown | not present in inspected repository files |
| SSH port | `TODO / unknown` | unknown | `22` appears only as an example in some repo docs and scripts |
| deploy path | `TODO / unknown` | unknown | candidate paths exist in docs, but no final approved path is confirmed |
| server OS | `TODO / unknown` | unknown | repository files do not confirm the target host OS |
| Docker installed | `TODO / unknown` | unknown | required by deploy model, but server fact is not confirmed |
| Docker Compose plugin installed | `TODO / unknown` | unknown | required by deploy scripts, but server fact is not confirmed |
| nginx installed/configured | `TODO / unknown` | unknown | nginx template and install docs exist, but live host state is unknown |
| domain | `stagewarehub.automatonsoft.de` | confirmed | found in infra docs and nginx install/template files |
| registry | `GHCR` | decided | selected in Slice 6C and verified in Slice 6E |
| deploy method | `direct SSH + infra/up-stage.sh` | decided | selected in Slice 6C |
| immutable image tag | `stage-a1c2946` | confirmed | verified GHCR publish result from Slice 6E |

## 4. Stage GHCR Image Contract

- `ghcr.io/ravilkadev0/warehub/backend:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/frontend:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/mobile:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/services:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/orchestrator:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/infra:stage-a1c2946`

Note:

- `stage-latest` was intentionally not pushed.

## 5. Required GitHub Environment Secrets For Stage

| Secret name | Purpose | Value status |
|---|---|---|
| `STAGE_SSH_HOST` | stage host target for remote deploy connection | `TODO / unknown` |
| `STAGE_SSH_USER` | remote deploy user | `TODO / unknown` |
| `STAGE_SSH_PORT` | SSH port for stage host connection | `TODO / unknown` |
| `STAGE_SSH_KEY` | SSH private key for stage host access | `TODO / unknown` |
| `STAGE_DEPLOY_PATH` | target remote infra checkout or deploy bundle path | `TODO / unknown` |
| `STAGE_ENV_FILE` | stage runtime `.env` payload for deploy | `TODO / unknown` |
| `GHCR_USERNAME` | GHCR authentication identity for pull or workflow auth model | `TODO / unknown` |
| `GHCR_TOKEN` | GHCR token if server-side pull auth needs explicit credentials | `TODO / unknown` |

## 6. Required Stage `.env` Keys

### Image refs and tags

- `BACKEND_IMAGE`
- `BACKEND_STAGE_TAG`
- `FRONTEND_IMAGE`
- `FRONTEND_STAGE_TAG`
- `MOBILE_IMAGE`
- `MOBILE_STAGE_TAG`
- `SERVICES_IMAGE`
- `SERVICES_STAGE_TAG`
- `ORCHESTRATOR_IMAGE`
- `ORCHESTRATOR_STAGE_TAG`
- `ORCHESTRATOR_APP_VERSION`

Known notes:

- The verified immutable release tag is `stage-a1c2946`.
- Exact image-ref values in the future server `.env` remain `TODO / unknown` until the runtime contract is finalized.

### Ports, domains, and public URLs

- `STAGE_FRONTEND_PORT`
- `STAGE_BACKEND_PORT`
- `STAGE_POSTGRES_PORT`
- `STAGE_SERVICES_PORT`
- `STAGE_ORCHESTRATOR_PORT`
- `STAGE_PUBLIC_API_BASE_URL`
- `STAGE_PUBLIC_SERVICES_API_BASE_URL`
- `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL`
- `STAGE_DOMAIN`

Known notes:

- `stagewarehub.automatonsoft.de` is confirmed from repo docs.
- Placeholder stage URL values in `infra/.env.example` are examples and not approved runtime truth.

### Postgres

- `STAGE_POSTGRES_DB`
- `STAGE_POSTGRES_USER`
- `STAGE_POSTGRES_PASSWORD`

### Backend runtime

- `BACKEND_STAGE_SENTRY_DSN`
- `BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE`
- `BACKEND_UPLOAD_STORAGE_BACKEND`
- `BACKEND_UPLOAD_FTP_HOST`
- `BACKEND_UPLOAD_FTP_USER`
- `BACKEND_UPLOAD_FTP_PASS`
- `BACKEND_UPLOAD_FTP_PORT`
- `BACKEND_UPLOAD_FTP_ROOT_DIR`
- `BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR`
- `BACKEND_UPLOAD_FTP_AVATAR_DIR`
- `BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL`
- `MOBILE_STAGE_APP_VERSION`
- `MOBILE_STAGE_APK_URL`
- `MOBILE_PROD_APP_VERSION`
- `MOBILE_PROD_APK_URL`

### Services runtime

- `SERVICES_SECRET_KEY`
- `STAGE_RUN_MIGRATIONS_ON_STARTUP`
- `STAGE_SERVICES_ALLOWED_HOSTS`

### Orchestrator runtime

- `STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL`
- `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS`
- `ORCHESTRATOR_HTTP_RETRIES`
- `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS`
- `ORCHESTRATOR_SERVICE_NAME`
- `ORCHESTRATOR_LOG_LEVEL`

### Integrations / optional services

- `AFTERBUY_JV_LOGIN`
- `AFTERBUY_JV_PASS`
- `AFTERBUY_XL_LOGIN`
- `AFTERBUY_XL_PASS`
- `AFTERBUY_JV_LOGIN_URL`
- `AFTERBUY_XL_LOGIN_URL`
- `AFTERBUY_JV_COOKIE_CACHE_FILE`
- `AFTERBUY_XL_COOKIE_CACHE_FILE`
- `FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE`
- `FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`
- `FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`

Rule:

- Exact values should be treated as `TODO / unknown` unless the value is already non-secret and explicitly documented in repository files.

## 7. Server Preflight Checklist Before First Deploy

- DNS resolution for `stagewarehub.automatonsoft.de`
- SSH connectivity to the target stage host
- deploy user permissions are confirmed
- deploy path exists
- repo checkout or infra bundle exists on the host
- Docker version is available
- Docker Compose version is available
- GHCR login or pull access is confirmed
- `.env` is present
- `docker compose -f deploy/stage/docker-compose.yml --env-file .env config`
- disk space is sufficient for image pulls and volumes
- firewall rules are reviewed
- nginx config is installed and valid
- SSL/TLS certificate status is confirmed

## 8. Repository Preflight Checklist Before First Deploy

- stage branch state is understood and clean at deploy time
- main and stage relation is understood
- CI is green
- GHCR images exist
- immutable tag is chosen
- `STAGE_ENV_FILE` is prepared
- no real `.env` is committed
- migration plan is reviewed
- rollback tag is known

## 9. Dry-Run Command Plan

These commands are documented only and were not executed in this slice.

```bash
docker compose -f deploy/stage/docker-compose.yml --env-file .env config
docker compose -f deploy/stage/docker-compose.yml --env-file .env pull
docker compose -f deploy/stage/docker-compose.yml --env-file .env ps
curl -I https://stagewarehub.automatonsoft.de
curl https://stagewarehub.automatonsoft.de/api/v1/meta
curl http://127.0.0.1:8011/healthz
curl http://127.0.0.1:8942/healthz
curl http://127.0.0.1:8942/api/v1/healthz
curl http://127.0.0.1:8944/api/v1/healthz
gh api /users/RavilkaDev0/packages/container/warehub%2Fbackend/versions --jq '.[0].metadata.container.tags'
gh api /users/RavilkaDev0/packages/container/warehub%2Ffrontend/versions --jq '.[0].metadata.container.tags'
gh api /users/RavilkaDev0/packages/container/warehub%2Fmobile/versions --jq '.[0].metadata.container.tags'
gh api /users/RavilkaDev0/packages/container/warehub%2Fservices/versions --jq '.[0].metadata.container.tags'
gh api /users/RavilkaDev0/packages/container/warehub%2Forchestrator/versions --jq '.[0].metadata.container.tags'
gh api /users/RavilkaDev0/packages/container/warehub%2Finfra/versions --jq '.[0].metadata.container.tags'
powershell -ExecutionPolicy Bypass -File scripts/verify-stage-migration-plan.ps1 -EnvFile .env -ComposeFile deploy/stage/docker-compose.yml
```

## 10. First Deploy Command Plan

This section documents the intended command shape only. NOT EXECUTED.

```bash
cd <STAGE_DEPLOY_PATH>
# ensure .env is written from STAGE_ENV_FILE
powershell -ExecutionPolicy Bypass -File scripts/security-preflight.ps1 -RepoPath .
powershell -ExecutionPolicy Bypass -File scripts/ops-preflight.ps1 -RepoPath .
./up-stage.sh stage-a1c2946
docker compose -f deploy/stage/docker-compose.yml --env-file .env ps
curl -I https://stagewarehub.automatonsoft.de
curl https://stagewarehub.automatonsoft.de/api/v1/meta
```

## 11. Post-Deploy Smoke Checklist

- containers are running
- postgres is healthy
- orchestrator is healthy
- backend health endpoint responds
- services health endpoint responds
- frontend HTTPS domain is reachable
- API meta endpoint responds if applicable
- APK URL responds if applicable
- logs are checked
- smoke signoff is written

## 12. Rollback Preflight

- previous immutable tag is required
- `stage-latest` is not a valid rollback source
- rollback command shape:
  - `./up-stage.sh <previous-immutable-tag>`
- rollback healthchecks must be rerun
- rollback signoff must be written

## 13. Risks / Blockers Before Deploy

- host/IP unknown
- SSH user unknown
- deploy path unknown
- server Docker status unknown
- GHCR pull permission from server unknown
- `STAGE_ENV_FILE` not yet created
- migration policy must be respected
- Node.js 20 GitHub Actions deprecation warning from the `GHCR Publish` run remains open

## 14. Recommended Next Slice

- `Slice 6G - collect stage host facts and create stage environment setup checklist`
- Slice 6G should still avoid committing secrets.

## 15. Explicit Non-Goals

- no deploy
- no SSH
- no server changes
- no GitHub Secrets changes
- no deploy workflow added
- no runtime changes
- no script changes
- no compose changes
- no Dockerfile changes
- no source changes
