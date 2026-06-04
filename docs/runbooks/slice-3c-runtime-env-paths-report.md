# Slice 3C - Runtime Env Path Resolution Report

## 1. Summary

Slice 3C removed the confirmed runtime blockers caused by legacy polyrepo env path assumptions in the allowed source files only.

The new resolution model is monorepo-aware and local-safe:

- explicit process env stays first
- app/service-local untracked `.env` files are loaded when present
- repo root `.env` is allowed as a fallback
- `infra/.env` is allowed as the last local fallback
- `.env.example` files are never loaded as runtime sources

## 2. Files Changed

- `apps/backend/src/main.rs`
- `apps/backend/src/bin/reset_users.rs`
- `apps/frontend/next.config.mjs`
- `services/database-service/database_service/settings.py`
- `services/database-service/orders_pars/service.py`
- `docs/runbooks/slice-3c-runtime-env-paths-report.md`

## 3. Backend Env Path Resolution

- removed legacy `../sofortbot-infra/.env` lookup
- added monorepo-aware local env discovery using `CARGO_MANIFEST_DIR`
- current backend lookup order:
  1. process env
  2. `apps/backend/.env`
  3. repo root `.env`
  4. `infra/.env`
- local dev safety improvement:
  - if `SKIP_DB_MIGRATIONS` is not set, local/dev mode now defaults to skipping runtime SQLx migrations

## 4. Frontend Path Resolution

- removed legacy `../sofortbot-infra/.env` lookup from `next.config.mjs`
- added monorepo-aware fallback loading for:
  1. `apps/frontend/.env.local`
  2. `apps/frontend/.env`
  3. repo root `.env`
  4. `infra/.env`
- existing process env still wins

## 5. Django Env Path Resolution

- removed legacy `sofortbot-infra/.env` lookup from:
  - `database_service/settings.py`
  - `orders_pars/service.py`
- current Django lookup order:
  1. process env
  2. `services/database-service/.env`
  3. repo root `.env`
  4. `infra/.env`

## 6. Validation Results

- `git status --short`
  - modified:
    - `apps/backend/src/bin/reset_users.rs`
    - `apps/backend/src/main.rs`
    - `apps/frontend/next.config.mjs`
    - `services/database-service/database_service/settings.py`
    - `services/database-service/orders_pars/service.py`
  - untracked:
    - `docs/runbooks/slice-3c-runtime-env-paths-report.md`
- old-ref search in changed files
  - command:
    - `rg -n "sofortbot-backend|sofortbot-frontend|sofortbot-mobile|sofortbot-services|sofortbot-infra|F:\\SofortBOT|services/database_service|services/sb-sofort-orchestrator-service" ...`
  - result:
    - no matches
    - `rg` exited with code `1`, which is expected for zero matches
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

## 7. Remaining Old References

- `apps/backend/src/main.rs`
  - `sofortbot_backend` still appears in tracing filter name and is tied to current crate/module naming
- no old path references to `sofortbot-infra`, `F:\SofortBOT`, `services/database_service`, or `services/sb-sofort-orchestrator-service` remain in the changed runtime-blocker files

## 8. Risks

- backend crate/service naming still reflects imported legacy naming in some non-path strings
- root `.env` and `infra/.env` fallbacks are still available if developers create them locally; this is intentional for compatibility, but they remain local-only and untracked
- no runtime commands were executed in this slice, so behavior was validated structurally, not by starting apps

## 9. Next Step

Next recommended step: run a separate developer validation slice to confirm host-local startup for backend, frontend, and database-service with untracked local `.env` files, without introducing deploy or migration execution.
