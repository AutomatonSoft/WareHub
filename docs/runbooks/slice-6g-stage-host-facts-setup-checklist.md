# Slice 6G - Stage Host Facts And Setup Checklist

## 1. Scope

- Goal: record known non-secret stage host facts and prepare a stage environment setup checklist before any deploy.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This report is factual and based only on repository files plus the provided verified non-secret GHCR facts.
- Slice 6G is planning-only.

## 2. Confirmed Baseline

- CI is green.
- GHCR publish is verified.
- Verified immutable image tag: `stage-a1c2946`
- No deploy has been performed yet.
- Slice 6G is planning-only.

## 3. Non-Secret Stage Host Facts Table

| Item | Value | Status | Notes |
|---|---|---|---|
| stage host/IP | `TODO / unknown` | unknown | not confirmed in inspected repository files |
| SSH user | `TODO / unknown` | unknown | not confirmed in inspected repository files |
| SSH port | `TODO / unknown` | unknown | `22` appears only as an example in repo docs and scripts |
| deploy path | `TODO / unknown` | unknown | repo shows candidate paths but no final approved path |
| server OS | `TODO / unknown` | unknown | not confirmed in inspected repository files |
| stage domain | `stagewarehub.automatonsoft.de` | confirmed | found in infra docs and nginx setup docs |
| Docker installed | `TODO / unknown` | unknown | required by deploy model, but server fact is not confirmed |
| Docker Compose plugin installed | `TODO / unknown` | unknown | required by deploy scripts, but server fact is not confirmed |
| nginx installed | `TODO / unknown` | unknown | nginx template and install docs exist, but live host fact is unknown |
| SSL/TLS certificate status | `TODO / unknown` | unknown | certbot setup is documented, but live certificate status is unknown |
| GHCR pull access | `TODO / unknown` | unknown | verified package publish exists, but server-side pull auth is not confirmed |
| firewall status | `TODO / unknown` | unknown | expected rules are documented, but live server status is unknown |

## 4. Stage Domain And DNS Checklist

- domain: `stagewarehub.automatonsoft.de`
- DNS `A` or `AAAA` record verification
- expected public HTTPS URL:
  - `https://stagewarehub.automatonsoft.de`
- nginx `server_name` check:
  - `__STAGE_DOMAIN__` must resolve to `stagewarehub.automatonsoft.de` in the installed config
- SSL certificate check:
  - certbot or equivalent certificate exists for `stagewarehub.automatonsoft.de`
- firewall `80/443` check:
  - public HTTP and HTTPS access allowed

## 5. Stage Server Setup Checklist

- create deploy user
- configure SSH access
- install Docker
- install Docker Compose plugin
- prepare deploy path
- clone repository or copy infra bundle
- configure GHCR login for image pulls
- create `.env` from `STAGE_ENV_FILE`
- validate nginx config
- prepare persistent volumes
- prepare rollback notes

## 6. Stage `.env` Preparation Checklist

`STAGE_ENV_FILE` must later contain these values securely. Do not place real values in the repository.

### Images / tags

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

### Ports / domains

- `STAGE_FRONTEND_PORT`
- `STAGE_BACKEND_PORT`
- `STAGE_POSTGRES_PORT`
- `STAGE_SERVICES_PORT`
- `STAGE_ORCHESTRATOR_PORT`
- `STAGE_DOMAIN`
- `STAGE_PUBLIC_API_BASE_URL`
- `STAGE_PUBLIC_SERVICES_API_BASE_URL`
- `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL`

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

### Integrations

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

## 7. GHCR Pull Verification Checklist

These commands are documented only. NOT EXECUTED.

```bash
docker login ghcr.io
docker pull ghcr.io/ravilkadev0/warehub/backend:stage-a1c2946
docker pull ghcr.io/ravilkadev0/warehub/frontend:stage-a1c2946
docker pull ghcr.io/ravilkadev0/warehub/mobile:stage-a1c2946
docker pull ghcr.io/ravilkadev0/warehub/services:stage-a1c2946
docker pull ghcr.io/ravilkadev0/warehub/orchestrator:stage-a1c2946
docker pull ghcr.io/ravilkadev0/warehub/infra:stage-a1c2946
docker image ls
```

## 8. Server Preflight Command Plan

These commands are documented only. NOT EXECUTED.

```bash
uname -a
cat /etc/os-release
docker --version
docker compose version
df -h
free -h
nginx -t
docker compose -f deploy/stage/docker-compose.yml --env-file .env config
docker compose -f deploy/stage/docker-compose.yml --env-file .env pull
docker compose -f deploy/stage/docker-compose.yml --env-file .env ps
```

## 9. Deploy Readiness Decision Gate

All of the following must be true before any real deploy:

- host confirmed
- SSH user confirmed
- deploy path confirmed
- Docker confirmed
- Compose confirmed
- GHCR pull confirmed
- `STAGE_ENV_FILE` prepared
- rollback immutable tag known
- migration plan reviewed
- DNS, SSL, and nginx confirmed
- approval given

## 10. What Remains Blocked

- no actual host facts confirmed unless provided
- no SSH key installed
- no GitHub Environment secrets created
- no `STAGE_ENV_FILE` created
- no server preflight executed
- no deploy workflow added

## 11. Recommended Next Slice

- `Slice 6H - stage server access preflight without deploy`

Important:

- Slice 6H may use SSH only after explicit approval.
- Slice 6H still should not deploy.
- Slice 6H should verify server facts and prerequisites only.

## 12. Explicit Non-Goals

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
