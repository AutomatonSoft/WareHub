# Slice 6J - Env Templates And DNS/TLS/Nginx Preflight Plan

## 1. Scope

- Goal: add sanitized stage/prod env templates and document the DNS/TLS/nginx preflight plan before any deploy.
- Repository root: `I:\WareHub`
- Allowed changes in this slice:
  - `infra/deploy/stage/env.stage.sanitized.template`
  - `infra/deploy/prod/env.prod.sanitized.template`
  - this runbook
- This slice does not deploy anything.

## 2. Confirmed Baseline

- CI is green.
- GHCR publish is verified.
- GHCR pull from server is verified.
- Verified immutable image tag: `stage-a1c2946`
- Server access preflight is verified.
- No deploy has been performed yet.

## 3. Files Added

- Stage sanitized env template: `infra/deploy/stage/env.stage.sanitized.template`
- Prod sanitized env template: `infra/deploy/prod/env.prod.sanitized.template`
- Runbook: `docs/runbooks/slice-6j-env-templates-dns-nginx-preflight-plan.md`

## 4. Sanitized Env Template Rules

- Templates are safe to commit.
- Templates contain placeholders only.
- Secret-bearing values use `__SET_IN_GITHUB_ENVIRONMENT__`.
- Unknown non-secret values use `TODO_UNKNOWN`.
- Real `.env` files must never be committed.
- Stage and prod must remain separated by env file, deploy path, ports, volumes, and nginx routing.

## 5. Stage Env Template Summary

### Image refs and tags

- Uses verified GHCR image refs under `ghcr.io/ravilkadev0/warehub/...`
- Uses immutable stage tag `stage-a1c2946` for:
  - backend
  - frontend
  - mobile
  - services
  - orchestrator
- `ORCHESTRATOR_APP_VERSION` remains `TODO_UNKNOWN`

### Public URLs, domains, and ports

- `STAGE_DOMAIN=stagewarehub.automatonsoft.de`
- confirmed ports:
  - `STAGE_FRONTEND_PORT=8941`
  - `STAGE_BACKEND_PORT=8942`
  - `STAGE_POSTGRES_PORT=8943`
  - `STAGE_SERVICES_PORT=8944`
  - `STAGE_ORCHESTRATOR_PORT=8945`
- public URL values remain `TODO_UNKNOWN` where not directly verified

### Postgres

- includes placeholders for:
  - `STAGE_POSTGRES_DB`
  - `STAGE_POSTGRES_USER`
  - `STAGE_POSTGRES_PASSWORD`
- password stays secret-scoped

### Backend runtime

- includes placeholders for Sentry, FTP/media, and mobile APK metadata keys
- no secret values are present

### Services runtime

- includes placeholders for:
  - `SERVICES_SECRET_KEY`
  - `STAGE_RUN_MIGRATIONS_ON_STARTUP`
  - `STAGE_SERVICES_ALLOWED_HOSTS`

### Orchestrator runtime

- includes placeholders for:
  - `STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL`
  - `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS`
  - `ORCHESTRATOR_HTTP_RETRIES`
  - `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS`
  - `ORCHESTRATOR_SERVICE_NAME`
  - `ORCHESTRATOR_LOG_LEVEL`

### Integrations

- includes placeholders for Afterbuy credentials and related URLs/cache paths
- includes placeholders for frontend Sentry sampling keys

## 6. Prod Env Template Summary

### Image refs and tags

- Uses verified GHCR image refs under `ghcr.io/ravilkadev0/warehub/...`
- Prod version tags remain `TODO_UNKNOWN`
- Prod deploy is not in scope for this slice

### Public URLs, domains, and ports

- `PROD_DOMAIN=warehub.automatonsoft.de`
- confirmed ports:
  - `PROD_FRONTEND_PORT=8951`
  - `PROD_BACKEND_PORT=8952`
  - `PROD_POSTGRES_PORT=8953`
  - `PROD_SERVICES_PORT=8954`
  - `PROD_ORCHESTRATOR_PORT=8955`
- public URL values remain `TODO_UNKNOWN` where not directly verified

### Postgres

- includes placeholders for:
  - `PROD_POSTGRES_DB`
  - `PROD_POSTGRES_USER`
  - `PROD_POSTGRES_PASSWORD`
- password stays secret-scoped

### Backend runtime

- includes placeholders for Sentry, FTP/media, and mobile APK metadata keys
- no secret values are present

### Services runtime

- includes placeholders for:
  - `SERVICES_SECRET_KEY`
  - `PROD_RUN_MIGRATIONS_ON_STARTUP`
  - `PROD_SERVICES_ALLOWED_HOSTS`

### Orchestrator runtime

- includes placeholders for:
  - `PROD_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL`
  - `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS`
  - `ORCHESTRATOR_HTTP_RETRIES`
  - `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS`
  - `ORCHESTRATOR_SERVICE_NAME`
  - `ORCHESTRATOR_LOG_LEVEL`

### Integrations

- includes placeholders for Afterbuy credentials and related URLs/cache paths
- includes placeholders for frontend Sentry sampling keys

## 7. DNS Preflight Plan

Commands documented only. NOT EXECUTED in this slice.

```bash
nslookup stagewarehub.automatonsoft.de
nslookup warehub.automatonsoft.de
dig A stagewarehub.automatonsoft.de
dig AAAA stagewarehub.automatonsoft.de
dig A warehub.automatonsoft.de
dig AAAA warehub.automatonsoft.de
curl -I https://stagewarehub.automatonsoft.de
curl -I https://warehub.automatonsoft.de
```

Expected outcomes:

- stage domain resolves to the intended server host
- prod domain resolves to the intended server host
- HTTPS responds on both domains
- unexpected NXDOMAIN, wrong IP, timeout, or TLS failure should block deploy planning

TODOs:

- stage DNS status remains `TODO_UNKNOWN` in this slice
- prod DNS status remains `TODO_UNKNOWN` in this slice

## 8. TLS/Certificate Preflight Plan

Commands documented only. NOT EXECUTED in this slice.

```bash
openssl s_client -connect stagewarehub.automatonsoft.de:443 -servername stagewarehub.automatonsoft.de
openssl s_client -connect warehub.automatonsoft.de:443 -servername warehub.automatonsoft.de
certbot certificates
nginx -t
systemctl status nginx
```

Expected outcomes:

- certificate chain is present for stage and prod domains
- certificate CN or SAN matches the requested domain
- nginx config syntax is valid
- nginx service remains active

TODOs:

- stage certificate status is `TODO_UNKNOWN`
- prod certificate status is `TODO_UNKNOWN`

## 9. Nginx Preflight Plan

- confirm `server_name` for stage domain:
  - `stagewarehub.automatonsoft.de`
- confirm `server_name` for prod domain:
  - `warehub.automatonsoft.de`
- confirm upstream ports do not conflict:
  - stage frontend/backend: `8941/8942`
  - prod frontend/backend: `8951/8952`
- confirm nginx config syntax with `nginx -t`
- confirm reload plan exists for a later slice only
- confirm rollback plan exists for nginx config replacement or rollback to prior config
- do not install nginx in this slice
- do not reload nginx in this slice

## 10. Stage/Prod Separation Checklist

- separate deploy paths
- separate env files
- separate compose project names
- separate container names
- separate host ports
- separate volumes
- separate nginx server blocks
- separate backup paths
- separate logs paths
- immutable tags for rollback

## 11. Validation Commands Run Locally

Commands actually run in this slice:

- `git status --short`
- `git diff --stat`
- inspected contents of:
  - `docs/runbooks/slice-6i-ghcr-pull-preflight-env-contract.md`
  - `docs/runbooks/slice-6h-server-access-preflight-report.md`
  - `docs/runbooks/slice-6g-stage-host-facts-setup-checklist.md`
  - `docs/runbooks/slice-6f-stage-host-contract-preflight-checklist.md`
  - `docs/runbooks/slice-6e-ghcr-publish-verification-report.md`
  - `docs/runbooks/slice-6c-stage-environment-contract.md`
  - `infra/.env.example`
  - `infra/deploy/stage/docker-compose.yml`
  - `infra/deploy/prod/docker-compose.yml`
  - `infra/deploy/nginx/sofortbot.conf.template`
  - `infra/deploy/nginx/INSTALL.md`
  - `infra/up-stage.sh`
  - `infra/up-prod.sh`
  - `infra/scripts/verify-required-env.ps1`
  - `infra/scripts/security-preflight.ps1`
  - `infra/scripts/ops-preflight.ps1`
  - `infra/scripts/verify-stage-migration-plan.ps1`
  - `docs/ci-cd/deployment-policy.md`
  - `docs/ci-cd/secret-policy.md`

Not executed in this slice:

- DNS checks
- TLS checks
- nginx validation on the server
- `docker compose config`

## 12. Remaining Blockers Before First Stage Deploy

- real `STAGE_ENV_FILE` not created
- GitHub Environment secrets not created
- DNS not verified in this slice
- TLS not verified in this slice
- nginx WareHub server block not installed or verified in this slice
- `docker compose config` not run with real env
- migration plan not executed
- no deploy workflow added
- exposed GHCR token must be revoked or replaced if not already done

## 13. Recommended Next Slice

- `Slice 6K - DNS/TLS/nginx read-only preflight verification`

Important:

- Slice 6K may use SSH only after explicit approval
- Slice 6K should not deploy
- Slice 6K should not create real env files
- Slice 6K should not reload nginx unless explicitly approved in a later slice

## 14. Explicit Non-Goals

- no deploy
- no docker compose up
- no real `.env` creation
- no server changes
- no SSH
- no nginx reload
- no GitHub Secrets changes
- no deploy workflow added
- no runtime changes
- no script changes
- no compose changes
- no Dockerfile changes
- no source changes
