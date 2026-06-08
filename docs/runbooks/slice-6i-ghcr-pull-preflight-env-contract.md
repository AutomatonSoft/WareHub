# Slice 6I - GHCR Pull Preflight And Stage/Prod Env Contract

## 1. Scope

- Goal: document successful GHCR pull preflight from the shared stage/prod server and define the stage/prod env contract before any deploy.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This report is based on repository files and the provided verified non-secret server and GHCR pull facts.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- CI is green.
- GHCR publish was verified in an earlier slice.
- GHCR pull from the server is now verified.
- Verified immutable image tag: `stage-a1c2946`
- No deploy has been performed yet.

## 3. GHCR Pull Verification Summary

- `docker login ghcr.io` succeeded on the server as user `cddeploy`.
- Login used `password-stdin`.
- Token values are intentionally not included in this report.
- All six image pulls succeeded for immutable tag `stage-a1c2946`.
- A second `docker pull` check reported the images were already up to date.
- `docker image ls` confirmed all six images are now present on the server.
- Verification command output confirmed:
  - `cddeploy`
  - `betterserver-new`
  - `/home/cddeploy`
  - `Docker version 29.4.1, build 055a478`
  - `Docker Compose version v5.1.3`
  - `NO_DEPLOY_EXECUTED`

## 4. Pulled Image Inventory

| Image | Tag | Image ID | Size | Status |
|---|---|---|---|---|
| `ghcr.io/ravilkadev0/warehub/backend` | `stage-a1c2946` | `b1ea76b6ce41` | `149MB` | pulled and present on server |
| `ghcr.io/ravilkadev0/warehub/frontend` | `stage-a1c2946` | `1ab09d9b34f9` | `1.56GB` | pulled and present on server |
| `ghcr.io/ravilkadev0/warehub/mobile` | `stage-a1c2946` | `06a2b7d5eda7` | `127MB` | pulled and present on server |
| `ghcr.io/ravilkadev0/warehub/services` | `stage-a1c2946` | `84511058e958` | `402MB` | pulled and present on server |
| `ghcr.io/ravilkadev0/warehub/orchestrator` | `stage-a1c2946` | `f40539a04a7e` | `262MB` | pulled and present on server |
| `ghcr.io/ravilkadev0/warehub/infra` | `stage-a1c2946` | `d038f4174e4a` | `63.4MB` | pulled and present on server |

## 5. Commands Executed

The following command shapes are documented as evidence for this slice. Token content is intentionally omitted.

```bash
# local token piped to remote docker login over SSH
<token-source> | ssh warehub-stage "docker login ghcr.io -u RavilkaDev0 --password-stdin"

ssh warehub-stage "docker pull ghcr.io/ravilkadev0/warehub/backend:stage-a1c2946"
ssh warehub-stage "docker pull ghcr.io/ravilkadev0/warehub/frontend:stage-a1c2946"
ssh warehub-stage "docker pull ghcr.io/ravilkadev0/warehub/mobile:stage-a1c2946"
ssh warehub-stage "docker pull ghcr.io/ravilkadev0/warehub/services:stage-a1c2946"
ssh warehub-stage "docker pull ghcr.io/ravilkadev0/warehub/orchestrator:stage-a1c2946"
ssh warehub-stage "docker pull ghcr.io/ravilkadev0/warehub/infra:stage-a1c2946"

ssh warehub-stage "docker image ls --format '{{.Repository}}|{{.Tag}}|{{.ID}}|{{.Size}}' | grep 'ghcr.io/ravilkadev0/warehub/'"

ssh warehub-stage "whoami && hostname && pwd && docker --version && docker compose version && echo NO_DEPLOY_EXECUTED"
```

No deploy command was executed in this slice.

## 6. Security Notes

- Token values are intentionally not included in this report.
- Any previously exposed token must be revoked and replaced outside the repository if that has not already happened.
- `docker login` typically stores credentials under the deploy user's Docker config unless a credential helper is configured.
- Future GitHub Environment secret handling should manage `GHCR_TOKEN` or the final approved registry secret name.
- Real `.env` files and token material must not be committed.

## 7. Stage/Prod Env File Separation Contract

- Stage and prod must use separate deploy paths:
  - stage: `/opt/warehub/stage`
  - prod: `/opt/warehub/prod`
- Stage and prod must not share the same runtime `.env` file.
- Stage and prod must not share the same compose project name.
- Stage and prod must not share conflicting host ports.
- Stage and prod must not share mutable image tags as the rollback source of truth.
- Stage and prod must remain separated by:
  - deploy path
  - env file
  - compose file
  - compose project name
  - ports
  - volumes
  - logs path
  - backup path
  - image tags
  - nginx server blocks

## 8. Stage Env Contract

### Images and tags

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

### Public URLs, domain, and ports

- `STAGE_DOMAIN=stagewarehub.automatonsoft.de`
- `STAGE_PUBLIC_API_BASE_URL=TODO / unknown`
- `STAGE_PUBLIC_SERVICES_API_BASE_URL=TODO / unknown`
- `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL=TODO / unknown`
- `STAGE_FRONTEND_PORT=8941`
- `STAGE_BACKEND_PORT=8942`
- `STAGE_POSTGRES_PORT=8943`
- `STAGE_SERVICES_PORT=8944`
- `STAGE_ORCHESTRATOR_PORT=8945`

### Postgres

- `STAGE_POSTGRES_DB=TODO / unknown`
- `STAGE_POSTGRES_USER=TODO / unknown`
- `STAGE_POSTGRES_PASSWORD=TODO / secret / GitHub Environment`

### Backend runtime

- `BACKEND_STAGE_SENTRY_DSN=TODO / secret / GitHub Environment`
- `BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=TODO / unknown`
- `BACKEND_UPLOAD_STORAGE_BACKEND=TODO / unknown`
- `BACKEND_UPLOAD_FTP_HOST=TODO / unknown`
- `BACKEND_UPLOAD_FTP_USER=TODO / unknown`
- `BACKEND_UPLOAD_FTP_PASS=TODO / secret / GitHub Environment`
- `BACKEND_UPLOAD_FTP_PORT=TODO / unknown`
- `BACKEND_UPLOAD_FTP_ROOT_DIR=TODO / unknown`
- `BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR=TODO / unknown`
- `BACKEND_UPLOAD_FTP_AVATAR_DIR=TODO / unknown`
- `BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL=TODO / unknown`
- `MOBILE_STAGE_APP_VERSION=TODO / unknown`
- `MOBILE_STAGE_APK_URL=TODO / unknown`
- `MOBILE_PROD_APP_VERSION=TODO / unknown`
- `MOBILE_PROD_APK_URL=TODO / unknown`

### Services runtime

- `SERVICES_SECRET_KEY=TODO / secret / GitHub Environment`
- `STAGE_RUN_MIGRATIONS_ON_STARTUP=TODO / unknown`
- `STAGE_SERVICES_ALLOWED_HOSTS=TODO / unknown`

### Orchestrator runtime

- `STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL=TODO / unknown`
- `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS=TODO / unknown`
- `ORCHESTRATOR_HTTP_RETRIES=TODO / unknown`
- `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS=TODO / unknown`
- `ORCHESTRATOR_SERVICE_NAME=TODO / unknown`
- `ORCHESTRATOR_LOG_LEVEL=TODO / unknown`

### Integrations

- `AFTERBUY_JV_LOGIN=TODO / unknown`
- `AFTERBUY_JV_PASS=TODO / secret / GitHub Environment`
- `AFTERBUY_XL_LOGIN=TODO / unknown`
- `AFTERBUY_XL_PASS=TODO / secret / GitHub Environment`
- `AFTERBUY_JV_LOGIN_URL=TODO / unknown`
- `AFTERBUY_XL_LOGIN_URL=TODO / unknown`
- `AFTERBUY_JV_COOKIE_CACHE_FILE=TODO / unknown`
- `AFTERBUY_XL_COOKIE_CACHE_FILE=TODO / unknown`
- `FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=TODO / unknown`
- `FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=TODO / unknown`
- `FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=TODO / unknown`

## 9. Prod Env Contract

### Images and versions

- `BACKEND_IMAGE=ghcr.io/ravilkadev0/warehub/backend`
- `BACKEND_APP_VERSION=TODO / unknown`
- `FRONTEND_IMAGE=ghcr.io/ravilkadev0/warehub/frontend`
- `FRONTEND_APP_VERSION=TODO / unknown`
- `MOBILE_IMAGE=ghcr.io/ravilkadev0/warehub/mobile`
- `MOBILE_APP_VERSION=TODO / unknown`
- `SERVICES_IMAGE=ghcr.io/ravilkadev0/warehub/services`
- `SERVICES_APP_VERSION=TODO / unknown`
- `ORCHESTRATOR_IMAGE=ghcr.io/ravilkadev0/warehub/orchestrator`
- `ORCHESTRATOR_APP_VERSION=TODO / unknown`

### Public URLs, domain, and ports

- `PROD_DOMAIN=warehub.automatonsoft.de`
- `PROD_PUBLIC_API_BASE_URL=TODO / unknown`
- `PROD_PUBLIC_SERVICES_API_BASE_URL=TODO / unknown`
- `PROD_PUBLIC_ORCHESTRATOR_API_BASE_URL=TODO / unknown`
- `PROD_FRONTEND_PORT=8951`
- `PROD_BACKEND_PORT=8952`
- `PROD_POSTGRES_PORT=8953`
- `PROD_SERVICES_PORT=8954`
- `PROD_ORCHESTRATOR_PORT=8955`

### Postgres

- `PROD_POSTGRES_DB=TODO / unknown`
- `PROD_POSTGRES_USER=TODO / unknown`
- `PROD_POSTGRES_PASSWORD=TODO / secret / GitHub Environment`

### Backend runtime

- `BACKEND_PROD_SENTRY_DSN=TODO / secret / GitHub Environment`
- `BACKEND_PROD_SENTRY_TRACES_SAMPLE_RATE=TODO / unknown`
- `BACKEND_UPLOAD_STORAGE_BACKEND=TODO / unknown`
- `BACKEND_UPLOAD_FTP_HOST=TODO / unknown`
- `BACKEND_UPLOAD_FTP_USER=TODO / unknown`
- `BACKEND_UPLOAD_FTP_PASS=TODO / secret / GitHub Environment`
- `BACKEND_UPLOAD_FTP_PORT=TODO / unknown`
- `BACKEND_UPLOAD_FTP_ROOT_DIR=TODO / unknown`
- `BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR=TODO / unknown`
- `BACKEND_UPLOAD_FTP_AVATAR_DIR=TODO / unknown`
- `BACKEND_PROD_UPLOAD_FTP_PUBLIC_BASE_URL=TODO / unknown`
- `MOBILE_PROD_APP_VERSION=TODO / unknown`
- `MOBILE_PROD_APK_URL=TODO / unknown`

### Services runtime

- `SERVICES_SECRET_KEY=TODO / secret / GitHub Environment`
- `PROD_RUN_MIGRATIONS_ON_STARTUP=TODO / unknown`
- `PROD_SERVICES_ALLOWED_HOSTS=TODO / unknown`

### Orchestrator runtime

- `PROD_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL=TODO / unknown`
- `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS=TODO / unknown`
- `ORCHESTRATOR_HTTP_RETRIES=TODO / unknown`
- `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS=TODO / unknown`
- `ORCHESTRATOR_SERVICE_NAME=TODO / unknown`
- `ORCHESTRATOR_LOG_LEVEL=TODO / unknown`

### Integrations

- `AFTERBUY_JV_LOGIN=TODO / unknown`
- `AFTERBUY_JV_PASS=TODO / secret / GitHub Environment`
- `AFTERBUY_XL_LOGIN=TODO / unknown`
- `AFTERBUY_XL_PASS=TODO / secret / GitHub Environment`
- `AFTERBUY_JV_LOGIN_URL=TODO / unknown`
- `AFTERBUY_XL_LOGIN_URL=TODO / unknown`
- `AFTERBUY_JV_COOKIE_CACHE_FILE=TODO / unknown`
- `AFTERBUY_XL_COOKIE_CACHE_FILE=TODO / unknown`
- `FRONTEND_PROD_SENTRY_TRACES_SAMPLE_RATE=TODO / unknown`
- `FRONTEND_PROD_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=TODO / unknown`
- `FRONTEND_PROD_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=TODO / unknown`

## 10. Remaining Blockers Before First Stage Deploy

- `STAGE_ENV_FILE` has not been created.
- GitHub Environment secrets have not been created.
- DNS for `stagewarehub.automatonsoft.de` was not verified in this slice.
- SSL certificate for the stage domain was not verified in this slice.
- nginx WareHub server block was not installed or verified in this slice.
- `docker compose config` was not run with a real stage env file.
- Migration plan was not executed.
- No deploy workflow was added.
- Any exposed GHCR token must be revoked and replaced if that has not already happened.

## 11. Recommended Next Slice

- `Slice 6J - stage/prod env template generation and DNS/TLS/nginx preflight plan`

Important:

- Slice 6J should not deploy.
- Slice 6J should not commit real secrets.
- Slice 6J may prepare sanitized `.env` templates only.

## 12. Explicit Non-Goals

- no deploy
- no docker compose up
- no `.env` creation on server
- no GitHub Secrets changes
- no deploy workflow added
- no runtime changes
- no script changes
- no compose changes
- no Dockerfile changes
- no source changes
