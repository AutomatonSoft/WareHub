# Slice 3A - Local Dev Path Discovery

## 1. Summary

- После Slice 2 monorepo содержит рабочие компоненты в новых путях:
  - `apps/backend`
  - `apps/frontend`
  - `apps/mobile`
  - `services/database-service`
  - `services/orchestrator`
  - `infra`
- Local dev пока не восстановлен end-to-end.
- Главные причины:
  - backend и frontend читают старый путь `../sofortbot-infra/.env`
  - Django service и `orders_pars` читают старый путь `sofortbot-infra/.env` через вычисление от polyrepo layout
  - `infra/local/docker-compose.dev.yml` собирает сервисы из старых `../../sofortbot-services/...`
  - local compose по-прежнему завязан на legacy shared DB tunnel mode вместо monorepo-first local Postgres
  - документация local dev упоминает `start-dev.ps1`, но такого файла в monorepo сейчас нет
- Отдельный security risk:
  - `services/database-service/.env.example` содержит значения, похожие на реальные credentials и должна быть отдельно санирована в следующем safe slice
- Этот slice был только discovery/planning:
  - source code не менялся
  - docker-compose не менялся
  - scripts не менялись
  - build/test/dev servers не запускались
  - deploy/migrations не запускались

## 2. Current Local Dev Entrypoints

### Явные локальные entrypoints

- `infra/local/docker-compose.dev.yml`
  - основной текущий local compose entrypoint
  - поднимает `postgres`, `minio`, `services`, `services-jv-worker`, `orchestrator`
- `apps/backend/README.md`
  - локальный старт: `cargo run`
- `apps/frontend/package.json`
  - локальный старт: `npm run dev`
  - порт: `8931`
- `apps/mobile/README.md`
  - локальный старт: `flutter run --flavor dev --dart-define=APP_ENV=dev`
- `services/database-service/README.md`
  - локальный старт описан только через `docker compose up --build` внутри каталога сервиса
- `services/orchestrator/README.md`
  - локальный старт: `uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8011 --reload`

### Служебные скрипты, влияющие на local/dev понимание

- `infra/scripts/api-contract-preflight.ps1`
- `infra/scripts/ops-preflight.ps1`
- `infra/scripts/quality-gate.ps1`
- `infra/scripts/security-preflight.ps1`
- `infra/scripts/verify-*.ps1`
- `services/database-service/tools/shared-db-migration-precheck.ps1`
- `services/database-service/tools/shared-db-migration-apply-jv-0009-0010.ps1`

### Что отсутствует

- `start-dev.ps1` в monorepo не найден
- единый root-level local dev entrypoint не найден
- root `docs/runbooks/local-dev.md` не найден

### Наблюдение

- В docs встречаются ссылки на `start-dev.ps1`, но фактического файла нет.
- Значит документация и реальный local entrypoint уже расходятся.

## 3. Hardcoded Old Path References

### Критичные runtime/path references

- `apps/backend/src/main.rs`
  - `dotenvy::from_filename("../sofortbot-infra/.env")`
- `apps/backend/src/bin/reset_users.rs`
  - `dotenvy::from_filename("../sofortbot-infra/.env")`
- `apps/frontend/next.config.mjs`
  - `path.resolve(dirname, "../sofortbot-infra/.env")`
- `services/database-service/database_service/settings.py`
  - `WORKSPACE_ROOT / "sofortbot-infra" / ".env"`
- `services/database-service/orders_pars/service.py`
  - `BASE_DIR.parent.parent.parent.parent / "sofortbot-infra" / ".env"`
- `infra/local/docker-compose.dev.yml`
  - build context `../../sofortbot-services`
  - dockerfile `services/database_service/Dockerfile`
  - orchestrator context `../../sofortbot-services/services/sb-sofort-orchestrator-service`

### Legacy repository name references in docs/configs

- `services/README.md`
- `infra/README.md`
- `infra/OPS_HEALTH_VERIFICATION.md`
- `infra/deploy/systemd/INSTALL.md`
- `infra/scripts/api-contract-preflight.ps1`
- `services/database-service/docs/*`
- `docs/architecture/repository-structure.md`
- `docs/runbooks/slice-2-copy-report.md`
- `AGENTS.md`

### Old image/repo naming still present

- `infra/.env.example`
  - `BACKEND_IMAGE=ghcr.io/ravilkadev0/sofortbot-backend`
  - `FRONTEND_IMAGE=ghcr.io/ravilkadev0/sofortbot-frontend`
  - `MOBILE_IMAGE=ghcr.io/ravilkadev0/sofortbot-mobile`
  - `SERVICES_IMAGE=ghcr.io/ravilkadev0/sofortbot-services`
- `apps/backend/Cargo.toml`
  - package name `sofortbot-backend`
- `apps/frontend/package.json`
  - package name `sofortbot-frontend`
- `apps/mobile/pubspec.yaml`
  - package name `sofortbot_mobile`

### Classification

- Runtime blockers for local dev:
  - backend dotenv path
  - frontend dotenv path
  - Django dotenv path
  - `orders_pars` dotenv path
  - compose build contexts
- Non-blocking for local dev but should be cleaned later:
  - historical repo names in docs
  - legacy container names and service names
  - package/app names where rename is not strictly required for Slice 3B

## 4. Docker Compose Local Impact

### File studied

- `infra/local/docker-compose.dev.yml`

### Current services

- `postgres`
- `minio`
- `services`
- `services-jv-worker`
- `orchestrator`

### Current build contexts

- `services`
  - `context: ../../sofortbot-services`
  - `dockerfile: services/database_service/Dockerfile`
- `services-jv-worker`
  - `context: ../../sofortbot-services`
  - `dockerfile: services/database_service/Dockerfile`
- `orchestrator`
  - `context: ../../sofortbot-services/services/sb-sofort-orchestrator-service`
  - `dockerfile: Dockerfile`

### Current Dockerfile path assumptions

- database service Dockerfile expected relative to old repo root
- orchestrator expected inside old nested services path

### Current env_file paths

- `services`: `../.env`
- `services-jv-worker`: `../.env`
- `orchestrator`: `../.env`

Interpretation:
- from `infra/local`, `../.env` means `infra/.env`
- in current monorepo only `infra/.env.example` exists
- local compose therefore still assumes a real runtime `infra/.env` file

### Current bind volumes

- `postgres`: named volume `pg_data`
- `minio`: named volume `minio_data`
- `orchestrator`: named volume `orchestrator_data`
- no source bind-mounts for backend/frontend/services source trees

### Current ports

- Postgres: `${DEV_POSTGRES_PORT:-8933}:5432`
- MinIO API: `9000:9000`
- MinIO console: `9001:9001`
- Django services: `${DEV_SERVICES_PORT:-8934}:8000`
- Orchestrator: `${DEV_ORCHESTRATOR_PORT:-8935}:8011`

### Current local DB model

- compose starts local `postgres`
- but `services` and `services-jv-worker` set:
  - `POSTGRES_HOST=${DEV_POSTGRES_HOST:-postgres}`
  - `POSTGRES_PORT=${DEV_POSTGRES_HOST_PORT:-5432}`
- `infra/.env.example` currently defaults:
  - `DEV_POSTGRES_HOST=host.docker.internal`
  - `DEV_POSTGRES_HOST_PORT=15434`
  - `DEV_DB_TUNNEL_ENABLED=true`

Impact:
- local compose is biased toward tunnel/shared external DB mode, not developer-local Postgres-by-default
- this conflicts with the desired future local strategy

### Current local migration behavior

- `services` command runs:
  - `python manage.py migrate`
  - then `python manage.py runserver`
- this is a direct conflict with the target safe policy if used blindly in future slices
- for Slice 3B this must be handled intentionally and documented

### Old paths that break after monorepo move

- `../../sofortbot-services`
- `../../sofortbot-services/services/sb-sofort-orchestrator-service`

### New target paths that will be needed in Slice 3B

- database service build context should resolve to monorepo path around:
  - `../../services/database-service` or equivalent from compose file location
- orchestrator build context should resolve to monorepo path around:
  - `../../services/orchestrator`
- env source should become monorepo-local and documented explicitly

## 5. Backend Local Impact

### Files studied

- `apps/backend/Cargo.toml`
- `apps/backend/README.md`
- `apps/backend/Dockerfile`
- `apps/backend/migrations/*`
- `apps/backend/.env.example`
- `apps/backend/src/main.rs`
- `apps/backend/src/bin/reset_users.rs`

### Current startup model

- documented local start: `cargo run`
- Docker dev image command: `cargo run`

### Required env vars

- mandatory:
  - `DATABASE_URL`
- used by runtime/config:
  - `APP_ENV`
  - `APP_PORT`
  - `DB_CONNECT_RETRIES`
  - `DB_CONNECT_RETRY_DELAY_MS`
  - `SKIP_DB_MIGRATIONS`
  - `AUTO_ORPHAN_PHOTO_CLEANUP_*`
  - auth/admin/upload/smtp/afterbuy/mobile metadata variables from `.env.example`

### Current DATABASE_URL assumption

- `apps/backend/.env.example`
  - `DATABASE_URL=postgres://sofortbot:sofortbot@localhost:8933/sofortbot`
- runtime code expects `DATABASE_URL` to exist and exits otherwise

### Path assumptions

- hardcoded old dotenv load path:
  - `../sofortbot-infra/.env`
- fallback to local `.env` via `dotenvy::dotenv()`

### Migration behavior

- runtime currently executes:
  - `sqlx::migrate!("./migrations").run(&db)`
- unless `SKIP_DB_MIGRATIONS=true`

Impact:
- local backend start currently performs implicit migrations by default
- this is an important local-dev and policy risk

### Migrations state

- `apps/backend/migrations` exists and contains SQLx migration files
- unlike Slice 2 planning concern, the current repo does have backend SQL migration files present

### Slice 3B candidate validation commands

- `cd apps/backend && cargo check`
- `cd apps/backend && cargo test`
- optionally after env wiring:
  - `cd apps/backend && cargo run`

### Backend-specific issues for Slice 3B

- replace old shared env path lookup
- decide whether local dev should default `SKIP_DB_MIGRATIONS=true`
- document explicit migration behavior for dev mode
- verify upload/local media assumptions for `UPLOAD_STORAGE_BACKEND=local`

## 6. Frontend Local Impact

### Files studied

- `apps/frontend/package.json`
- `apps/frontend/README.md`
- `apps/frontend/next.config.mjs`
- `apps/frontend/.env.example`
- `apps/frontend/openapi/*`
- `apps/frontend/tools/*`

### Current scripts

- `dev`: `next dev -p 8931`
- `build`: `next build`
- `start`: `next start -p 8931`
- `lint`
- `typecheck`
- `test`
- many Playwright E2E scripts
- OpenAPI scripts:
  - `openapi:pull`
  - `openapi:types`
  - `openapi:orchestrator:types`
  - `openapi:generate`
  - `openapi:check`
  - `openapi:orchestrator:check`

### Env assumptions

- `.env.example` says source of truth is `../sofortbot-infra/.env`
- `next.config.mjs` loads `../sofortbot-infra/.env`
- rewrites use:
  - `BACKEND_ORIGIN` default `http://localhost:8932`
  - `SERVICES_ORIGIN` default `http://localhost:8934`
- UI code uses:
  - `NEXT_PUBLIC_API_BASE_URL`
  - `NEXT_PUBLIC_SERVICES_API_BASE_URL`

### API URL assumptions

- backend local default: `http://localhost:8932/api/v1`
- services local default: `http://localhost:8934`
- docs/openapi route also inspects:
  - `SERVICES_API_BASE_URL`
  - `BACKEND_API_BASE_URL`
  - `ORCHESTRATOR_API_BASE_URL`
  - `NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL`

### OpenAPI generation paths

- `tools/pull-openapi-schema.mjs`
  - default schema URL: `http://localhost:8931/api/docs/openapi`
  - output: `openapi/unified-openapi.json`
- `tools/generate-openapi-types.mjs`
  - input: `openapi/unified-openapi.json`
  - output: `lib/api/generated/openapi-types.ts`
- `tools/generate-orchestrator-openapi-types.mjs`
  - input: `openapi/orchestrator-openapi.json`
  - output: `lib/api/generated/orchestrator-openapi-types.ts`

### Old path references

- critical:
  - `next.config.mjs` -> `../sofortbot-infra/.env`
- docs-only:
  - `docs/FRONTEND_E2E_DEBUGGING.md` mentions `start-dev.ps1`
  - README and docs still mention `sofortbot-infra`

### Later changes needed

- replace env source loading path
- align `SERVICES_ORIGIN` / `BACKEND_ORIGIN` with monorepo-root local strategy
- document how OpenAPI pull works when frontend and backend are both local monorepo processes
- decide whether E2E preflight should be preserved as-is or switched to explicit optional mode

## 7. Services Local Impact

### Files studied

- `services/README.md`
- `services/requirements.txt`
- `services/database-service/Dockerfile`
- `services/database-service/manage.py`
- `services/database-service/.env.example`
- `services/database-service/database_service/settings.py`
- `services/database-service/orders_pars/service.py`
- `services/orchestrator/Dockerfile`
- `services/orchestrator/requirements.txt`
- `services/orchestrator/.env.example`
- `services/orchestrator/src/*`

### Django service startup model

- README suggests local start through service-local compose
- Dockerfile:
  - installs `requirements.txt`
  - copies `services/database_service` to `/app`
  - runs `python manage.py runserver 0.0.0.0:8000`
- `manage.py` itself is standard

### Django env assumptions

- `.env.example` says source of truth:
  - `../../../sofortbot-infra/.env`
- `database_service/settings.py` loads:
  - `WORKSPACE_ROOT / "sofortbot-infra" / ".env"`
  - then `BASE_DIR / ".env"`
- DB priority:
  1. `DATABASE_URL`
  2. `POSTGRES_*`
  3. local sqlite fallback at `BASE_DIR / 'db.sqlite3'`

### Django old-path blockers

- old shared env path in `settings.py`
- old shared env path in `orders_pars/service.py`

### Runtime/local files to ignore

- `db.sqlite3` should remain ignored as runtime artifact
- local `.env` inside service should not be committed
- Django media/runtime local outputs should stay untracked if introduced later

### Orchestrator startup model

- README suggests:
  - `pip install -r requirements.txt`
  - `uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8011 --reload`
- Dockerfile starts the same service on port `8011`

### Orchestrator env assumptions

- `.env.example` expects:
  - `DATABASE_SERVICE_BASE_URL=http://localhost:8000`
  - sqlite paths under `./data`
- settings use:
  - `ORCHESTRATOR_IDEMPOTENCY_SQLITE_PATH`
  - `ORCHESTRATOR_JOBS_SQLITE_PATH`
  - `DATABASE_SERVICE_BASE_URL`
  - worker/scheduler/circuit breaker env vars

### Root-level shared service files needed

- `services/requirements.txt`
  - Python dependency baseline relevant for service-local environments
- `services/README.md`
  - high-level service conventions

### Critical risk found

- `services/database-service/.env.example` currently contains values that look like real infrastructure credentials:
  - DB host and user/password
  - HOOD FTP credentials
  - HOOD login/password
- This file should not be used as trusted placeholder-only local template until it is sanitized.

## 8. Mobile Local Impact

### Files studied

- `apps/mobile/pubspec.yaml`
- `apps/mobile/README.md`
- `apps/mobile/.env.example`
- `apps/mobile/Dockerfile`

### Current startup model

- README:
  - `flutter pub get`
  - `flutter run --flavor dev --dart-define=APP_ENV=dev`
- optional stage-like run with explicit `--dart-define=API_BASE_URL=...`

### API URL assumptions

- `.env.example`
  - `API_BASE_URL=http://localhost:8932/api/v1`
- `infra/.env.example`
  - `MOBILE_DEV_API_BASE_URL=http://192.168.0.103:8932`

Impact:
- mobile local mode may depend on LAN-reachable backend rather than plain localhost when running on device

### Signing/env assumptions

- README lists stage/prod secrets for CI/CD
- local discovery did not find mandatory local signing secret files in repo
- mobile local dev on emulator/device should remain possible with Flutter tooling, but exact device workflow still needs confirmation

### Build artifacts to ignore

- Flutter/Gradle artifacts should remain ignored:
  - `.dart_tool`
  - `build`
  - Android local Gradle state
  - IDE state
- vendor example projects also need the same ignore discipline

### Old path references

- `.env.example` still points to `../sofortbot-infra/.env`
- no stronger monorepo path coupling found in core mobile config files studied

## 9. Recommended Local Dev Strategy

### Variant A. Compose-first local dev

- `infra/local/docker-compose.dev.yml` starts:
  - Postgres
  - MinIO
  - database-service
  - orchestrator
- backend runs either in compose or separately later
- frontend runs either in compose or separately later

Pros:
- repeatable team setup
- easiest onboarding
- closest to service-to-service topology
- fewer host dependency issues

Cons:
- slower edit loop for backend/frontend unless bind mounts and dedicated dev commands are added
- compose file becomes responsible for more path and env complexity
- Django service currently auto-runs migrations in command, which is risky

### Variant B. Hybrid local dev

- Docker only for infra dependencies:
  - Postgres
  - MinIO
  - optionally database-service and orchestrator
- backend runs locally from `apps/backend`
- frontend runs locally from `apps/frontend`
- database-service and orchestrator can run either locally or in compose depending on task

Pros:
- faster inner loop for backend/frontend
- simpler source debugging
- best fit for monorepo developer workflow
- easier incremental recovery in Slice 3B

Cons:
- mixed process model requires clearer documentation
- env alignment across host and containers must be explicit
- some developers may still need service containers for consistency

### Recommendation for Slice 3B

- Choose Variant B: hybrid local dev

Reason:
- it is the smallest safe recovery step after monorepo migration
- backend and frontend already have direct local start commands
- compose can be reduced to infra dependencies plus optional services
- this avoids overloading Slice 3B with a full containerized dev-platform redesign

### Target local strategy after Slice 3B

- `infra/local/docker-compose.dev.yml` should default to local Postgres and MinIO
- backend runs from `apps/backend`
- frontend runs from `apps/frontend`
- database-service and orchestrator can run:
  - in compose by default for convenience
  - or locally for debugging
- shared remote/tunnel DB mode should remain only as legacy optional mode, not default

## 10. Proposed Slice 3B File Changes

### `infra/local/docker-compose.dev.yml`

- current issue:
  - old build contexts to `../../sofortbot-services/...`
  - local DB defaults biased to shared tunnel mode
  - env source assumes `infra/.env`
  - command auto-runs Django migrations
- proposed change:
  - repoint build contexts to `services/database-service` and `services/orchestrator`
  - make developer-local Postgres the default path
  - explicitly document/parameterize optional tunnel mode
  - reconsider service command strategy for safer dev startup
- risk:
  - can break current service boot order or health checks
- validation command:
  - `docker compose -f infra/local/docker-compose.dev.yml config`

### `infra/.env.example`

- current issue:
  - defaults assume shared/tunneled DB
  - contains legacy image names
  - mixes local/stage/prod and operational settings in one file
- proposed change:
  - redefine local defaults for monorepo-first dev
  - document local host/container origins clearly
  - keep stage/prod placeholders but separate local guidance
- risk:
  - frontend/backend/services may diverge if env names are changed carelessly
- validation command:
  - manual env review plus `docker compose ... config`

### `apps/backend/src/main.rs`

- current issue:
  - hardcoded `../sofortbot-infra/.env`
  - auto-runs SQLx migrations on startup unless disabled
- proposed change:
  - load env from monorepo-appropriate location
  - make startup migration behavior explicit for local dev policy
- risk:
  - runtime startup regression if env precedence changes
- validation command:
  - `cd apps/backend && cargo check`

### `apps/backend/src/bin/reset_users.rs`

- current issue:
  - hardcoded `../sofortbot-infra/.env`
- proposed change:
  - align env discovery with monorepo path layout
- risk:
  - admin reset helper may stop locating DB config
- validation command:
  - `cd apps/backend && cargo check`

### `apps/backend/.env.example`

- current issue:
  - still references old shared env source
- proposed change:
  - rewrite comments and local defaults for monorepo usage
- risk:
  - low
- validation command:
  - manual review

### `apps/frontend/next.config.mjs`

- current issue:
  - hardcoded `../sofortbot-infra/.env`
- proposed change:
  - switch to monorepo path or explicit env-only mode
- risk:
  - rewrites may fail and frontend local proxy can break
- validation command:
  - `cd apps/frontend && npm run typecheck`
  - `cd apps/frontend && npm run build`

### `apps/frontend/.env.example`

- current issue:
  - old source-of-truth comment
- proposed change:
  - rewrite to monorepo local-dev expectations
- risk:
  - low
- validation command:
  - manual review

### `apps/frontend/README.md`

- current issue:
  - local dev instructions ignore monorepo env recovery work
- proposed change:
  - document actual Slice 3B local run sequence
- risk:
  - low
- validation command:
  - manual review

### `services/database-service/database_service/settings.py`

- current issue:
  - old shared env path `sofortbot-infra/.env`
- proposed change:
  - monorepo-aware env resolution
- risk:
  - DB fallback precedence can change unexpectedly
- validation command:
  - `cd services/database-service && python manage.py check`

### `services/database-service/orders_pars/service.py`

- current issue:
  - old shared env path `sofortbot-infra/.env`
- proposed change:
  - monorepo-aware env resolution
- risk:
  - Afterbuy/data integration helper may fail to locate env
- validation command:
  - `python -m compileall services`

### `services/database-service/.env.example`

- current issue:
  - contains apparent real credentials and old shared env comment
- proposed change:
  - sanitize to placeholders only
  - rewrite source-of-truth comment
- risk:
  - low technically, high security priority
- validation command:
  - manual secret review

### `services/orchestrator/.env.example`

- current issue:
  - local defaults are usable, but not aligned with monorepo-wide documented strategy
- proposed change:
  - document monorepo local usage and optional compose/local modes
- risk:
  - low
- validation command:
  - manual review

### `services/README.md`

- current issue:
  - still describes old polyrepo identity and old repo naming
- proposed change:
  - rewrite around WareHub monorepo service conventions
- risk:
  - low
- validation command:
  - manual review

### `infra/README.md`

- current issue:
  - still references old repo names, missing current monorepo local run flow, mentions nonexistent `start-dev.ps1`
- proposed change:
  - update local dev section for monorepo
- risk:
  - low
- validation command:
  - manual review

### `docs/runbooks/local-dev.md`

- current issue:
  - not found
- proposed change:
  - create explicit local dev runbook in Slice 3B
- risk:
  - none technically
- validation command:
  - manual review

### Optional: root `start-dev.ps1`

- current issue:
  - docs reference it, but file does not exist
- proposed change:
  - create only if explicitly approved in Slice 3B
- risk:
  - can expand scope beyond path recovery into workflow automation
- validation command:
  - PowerShell dry path review

### Optional: `infra/scripts/*`

- current issue:
  - `api-contract-preflight.ps1` still points to old repo layout
- proposed change:
  - defer unless Slice 3B explicitly includes script recovery
- risk:
  - touching scripts expands scope and can affect non-local workflows
- validation command:
  - script read-only review or dedicated later slice

## 11. Validation Plan for Slice 3B

### Compose / infra

- `docker compose -f infra/local/docker-compose.dev.yml config`
  - requires Docker available

### Python services

- `python -m compileall services`
  - requires Python available
- `cd services/database-service && python manage.py check`
  - requires Python deps installed and env/DB settings sane
- For orchestrator, replace invalid placeholder command `python import check` with:
  - `python -m compileall services/orchestrator/src`
  - optionally `python -c "import sys; sys.path.insert(0, 'src'); import sofort_orchestrator.main"`
  - requires Python available and possibly deps installed

### Backend

- `cd apps/backend && cargo check`
  - requires Rust toolchain
- optionally later:
  - `cd apps/backend && cargo test`

### Frontend

- `cd apps/frontend && npm ci && npm run lint && npm run typecheck && npm run build`
  - requires Node/npm and network access for `npm ci`

### Mobile

- `cd apps/mobile && flutter pub get && flutter analyze`
  - requires Flutter SDK
- optional:
  - `cd apps/mobile && flutter test`

### Notes

- Any command needing env, SDK, package install or DB/container runtime must be treated as environment-dependent in Slice 3B.
- No command above should imply deploy, stage/prod access or migration execution by default.

## 12. Risks

- Current local dev assumptions are split across:
  - `infra/.env.example`
  - component `.env.example`
  - hardcoded code paths
  - compose
  - README files
- Backend startup currently runs SQLx migrations by default.
- Local compose currently runs Django migrations in service startup command.
- Shared/tunneled dev DB mode is still the default assumption in infra env docs.
- `services/database-service/.env.example` contains probable real credentials and is a security concern.
- Some docs still describe old polyrepo workflow and can mislead developers.
- If Slice 3B touches scripts in addition to path rewrites, scope can expand too much.

## 13. Do Not Touch List

- Do not touch stage.
- Do not touch production.
- Do not run deploy.
- Do not run migrations.
- Do not create workflows.
- Do not modify deploy scripts unless a later slice explicitly approves it.
- Do not refactor application business logic during local-dev path recovery.
- Do not rename package/app identities unless strictly required for local runtime recovery.
