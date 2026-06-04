# Slice 3B - Local Dev Recovery Report

## 1. Summary

Slice 3B restored a monorepo-safe local development contract without touching stage/prod deploy files, CI/CD workflows, business logic source code or migrations.

The chosen mode is hybrid local development:

- Docker Compose starts only local dependencies
- backend, frontend, database-service and orchestrator are documented for manual local startup

## 2. Files Changed

- `infra/local/docker-compose.dev.yml`
- `infra/.env.example`
- `.env.example`
- `README.md`
- `apps/backend/.env.example`
- `apps/frontend/.env.example`
- `apps/mobile/.env.example`
- `services/database-service/.env.example`
- `services/orchestrator/.env.example`
- `start-dev.ps1`
- `stop-dev.ps1`
- `docs/runbooks/local-dev.md`
- `docs/runbooks/slice-3-local-dev-recovery-report.md`

## 3. Local Compose Changes

- replaced legacy service names with WareHub local names
- removed old polyrepo build contexts
- removed `env_file` dependency on `infra/.env`
- removed automatic Django migration command from compose
- switched to dependencies-only compose:
  - `warehub-postgres`
  - `warehub-redis`
  - `warehub-minio`
  - `warehub-rabbitmq`

## 4. Env Example Changes

- rewrote local comments to monorepo usage
- removed legacy shared-env comments from local templates
- sanitized `services/database-service/.env.example`
- changed local defaults to `localhost` / `127.0.0.1`
- marked legacy shared DB tunnel mode as optional, not default

## 5. Root Script Changes

- added `start-dev.ps1`
- added `stop-dev.ps1`
- both scripts:
  - require repo root execution
  - require Docker to be available
  - validate `docker compose ... config` before action
  - do not call stage/prod scripts

## 6. Documentation Changes

- added `docs/runbooks/local-dev.md`
- updated root `README.md` with a local-dev runbook pointer

## 7. Validation Results

- `git status --short`
  - modified:
    - `.env.example`
    - `README.md`
    - `apps/backend/.env.example`
    - `apps/frontend/.env.example`
    - `apps/mobile/.env.example`
    - `infra/.env.example`
    - `infra/local/docker-compose.dev.yml`
    - `services/database-service/.env.example`
    - `services/orchestrator/.env.example`
  - untracked:
    - `docs/runbooks/local-dev.md`
    - `docs/runbooks/slice-3-local-dev-recovery-report.md`
    - `start-dev.ps1`
    - `stop-dev.ps1`
- `docker compose -f infra/local/docker-compose.dev.yml config`
  - result: success
  - compose resolves to local dependency services only:
    - `warehub-postgres`
    - `warehub-redis`
    - `warehub-minio`
    - `warehub-rabbitmq`
- env scan
  - result: only `.env.example` files found:
    - `I:\WareHub\.env.example`
    - `I:\WareHub\apps\backend\.env.example`
    - `I:\WareHub\apps\frontend\.env.example`
    - `I:\WareHub\apps\mobile\.env.example`
    - `I:\WareHub\infra\.env.example`
    - `I:\WareHub\infra\deploy\runners\.env.example`
    - `I:\WareHub\services\database-service\.env.example`
    - `I:\WareHub\services\orchestrator\.env.example`
- forbidden dirs scan
  - result: none
- nested workflows scan
  - result: only root `I:\WareHub\.github`
- suspicious files scan
  - result: matches only safe code/docs/script names such as:
    - password reset source files
    - `docs/ci-cd/secret-policy.md`
    - `infra/SECRET_ROTATION_PLAN.md`
    - `infra/scripts/scan-secrets.ps1`

## 8. Known Limitations

- backend source still contains legacy dotenv path lookup
- frontend `next.config.mjs` still contains legacy dotenv path lookup
- Django settings still contain legacy shared-env path lookup
- `orders_pars/service.py` still contains legacy shared-env path lookup
- `services/database-service` Dockerfile is not yet monorepo-safe for compose-first recovery without extra path work

Remaining old-path references intentionally left in place:

- local runtime blockers in forbidden source files:
  - `apps/backend/src/main.rs`
  - `apps/backend/src/bin/reset_users.rs`
  - `apps/frontend/next.config.mjs`
  - `services/database-service/database_service/settings.py`
  - `services/database-service/orders_pars/service.py`
- historical/import/runbook references intentionally preserved:
  - `docs/architecture/repository-structure.md`
  - `docs/runbooks/slice-2-copy-report.md`
  - `docs/runbooks/slice-2b-sync-latest-source-report.md`
  - `docs/runbooks/slice-3-local-dev-paths-discovery.md`
- non-local deploy/ops references intentionally preserved:
  - `infra/README.md`
  - `infra/OPS_HEALTH_VERIFICATION.md`
  - `infra/deploy/systemd/INSTALL.md`
  - `infra/scripts/release-stage.sh`
  - `infra/scripts/release-prod.sh`
  - `infra/scripts/deploy-watcher.sh`
  - `infra/scripts/enqueue-deploy.sh`

Needs confirmation for a later slice:

- source-level local env path cleanup in the five runtime blocker files above
- compose-first service containers for `database-service` and `orchestrator`
- monorepo-safe service Dockerfile adjustments if containerized local services are required

## 9. Risks

- local manual startup still depends on untracked per-app `.env` files
- source-level old path lookups remain until a later approved slice
- optional service containerization is intentionally deferred to avoid forbidden source/runtime changes

## 10. Next Step

Next recommended step: approve a narrow follow-up slice for source-level local env path cleanup in the explicitly identified files, or validate the hybrid manual startup flow with environment-specific developer testing outside this change set.
