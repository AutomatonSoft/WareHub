# Slice 3G - Host-Local Startup Validation Report

## 1. Summary

Slice 3G выполнен как validation-only slice в `I:\WareHub` без изменений runtime code, без запуска app runtimes, без migrations, без deploy и без workflow changes.

Итог:

- preflight прошел
- local dependency compose config валиден
- `start-dev.ps1` успешно поднял local dependency stack
- smoke checks для Postgres и Redis прошли
- MinIO и RabbitMQ стартовали штатно по status/log checks
- backend, frontend, database-service, orchestrator и mobile прошли разрешенную host-local readiness validation
- `services/database-service/requirements.txt` не найден по ожидаемому пути
- frontend lint не запускался, потому что `node_modules` отсутствует
- после `stop-dev.ps1` local dependency stack cleanly остановлен и удален

## 2. Git State

- `Get-Location`
  - `I:\WareHub`
- `git branch --show-current`
  - `feature/slice-3g-host-local-startup-validation`
- `git status --short` before validation
  - clean
- `git log --oneline -5`
  - `8b2ad33 Merge pull request #7 from RavilkaDev0/feature/slice-3f-local-dev-runtime-validation`
  - `fefde8c docs: add local dev runtime validation report`
  - `5463e3b Merge pull request #6 from RavilkaDev0/feature/slice-3e-runtime-container-aliases`
  - `b33f518 chore: fix frontend backend runtime alias`
  - `de38a44 Merge pull request #5 from RavilkaDev0/feature/slice-3d-local-dev-validation`

## 3. Tooling Availability

- `docker --version`
  - `Docker version 29.4.3, build 055a478`
- `docker compose version`
  - `Docker Compose version v5.1.3`
- `node --version`
  - `v24.14.0`
- `npm --version`
  - `11.9.0`
- `rustc --version`
  - `rustc 1.93.1 (01f6ddf75 2026-02-11)`
- `cargo --version`
  - `cargo 1.93.1 (083ac5135 2025-12-15)`
- `python --version`
  - `Python 3.14.3`
- `py --version`
  - `Python 3.14.3`
- `flutter --version`
  - `Flutter 3.41.4 stable`
  - `Dart 3.11.1`
  - `DevTools 2.54.1`

## 4. Compose Config Validation

Command:

- `docker compose -f infra/local/docker-compose.dev.yml config`

Result:

- valid
- resolved services:
  - `warehub-postgres`
  - `warehub-redis`
  - `warehub-minio`
  - `warehub-rabbitmq`
- no app runtime services in this compose file
- no stage/prod services in this compose file

## 5. Local Dependency Startup

Command:

- `powershell -ExecutionPolicy Bypass -File .\start-dev.ps1`

Result:

- script completed successfully
- local dependencies were created and started
- legacy `sofortbot-*` containers were present only as `Exited`, not `Up`

Important note:

- an early parallel `docker compose ps` call returned before startup fully settled
- confirmed state was taken from the later sequential checks only

## 6. Container State After Startup

Confirmed by:

- `docker compose -f infra/local/docker-compose.dev.yml ps -a`
- `docker ps -a`

Confirmed `warehub-*` state:

- `warehub-minio` -> `Up`
- `warehub-postgres` -> `Up (healthy)`
- `warehub-rabbitmq` -> `Up`
- `warehub-redis` -> `Up`

Legacy local containers:

- `sofortbot-minio-dev` -> `Exited`
- `sofortbot-postgres-dev` -> `Exited`
- `sofortbot-services-dev` -> `Exited`
- `sofortbot-services-jv-worker-dev` -> `Exited`
- `sofortbot-orchestrator-dev` -> `Exited`

## 7. Dependency Smoke Checks

### Postgres

Command:

- `docker exec warehub-postgres pg_isready -U warehub -d warehub`

Result:

- `/var/run/postgresql:5432 - accepting connections`

### Redis

Command:

- `docker exec warehub-redis redis-cli ping`

Result:

- `PONG`

### MinIO

Validation method:

- container status
- `docker logs --tail=40 warehub-minio`

Result:

- container `Up`
- normal startup banner present
- API listener present
- WebUI listener present
- no fatal startup error observed

### RabbitMQ

Validation method:

- container status
- `docker logs --tail=40 warehub-rabbitmq`

Result:

- container `Up`
- startup completed
- management listener started
- Prometheus listener started
- deprecation warning for `management_metrics_collection` present, but not blocking startup

## 8. Backend Host-Local Readiness

Files inspected:

- `apps/backend/Cargo.toml`
- `apps/backend/.env.example`
- `apps/backend/src/main.rs`
- `apps/backend/migrations/*`

Static findings:

- `Cargo.toml` exists
- package name remains `sofortbot-backend`; this is naming only
- `.env.example` is placeholder-only and local-safe
- `DATABASE_URL=postgres://warehub:warehub@localhost:8933/warehub`
- `SKIP_DB_MIGRATIONS=true`
- `main.rs` uses monorepo-aware env lookup:
  - `apps/backend/.env`
  - repo root `.env`
  - `infra/.env`
- local/dev startup path defaults away from automatic runtime migrations when `SKIP_DB_MIGRATIONS` is absent
- SQLx source migrations present: `24`

Command:

- `cargo metadata --no-deps`

Result:

- succeeded
- workspace metadata resolved
- warning present:
  - `please specify --format-version flag explicitly to avoid compatibility problems`

## 9. Frontend Host-Local Readiness

Files inspected:

- `apps/frontend/package.json`
- `apps/frontend/.env.example`
- `apps/frontend/next.config.mjs`
- `apps/frontend/app/api/backend/[...path]/route.ts`

Static findings:

- `package.json` exists
- frontend scripts are declared
- `.env.example` is placeholder-only and local-safe
- `BACKEND_ORIGIN=http://localhost:8932`
- `BACKEND_INTERNAL_API_BASE_URL=http://127.0.0.1:8932/api/v1`
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8932/api/v1`
- `next.config.mjs` uses monorepo-aware env lookup:
  - `.env.local`
  - `.env`
  - repo root `.env`
  - `infra/.env`
- `route.ts` no longer depends on `sofortbot-backend`
- backend proxy candidate order is:
  - `BACKEND_INTERNAL_API_BASE_URL`
  - `NEXT_PUBLIC_API_BASE_URL`
  - `http://127.0.0.1:8932/api/v1`
  - `http://localhost:8932/api/v1`

Node dependency check:

- `node_modules` not found

Lint command status:

- `npm run lint --if-present` not run
- reason: `node_modules` missing

## 10. Database-Service Host-Local Readiness

Files inspected:

- `services/database-service/.env.example`
- `services/database-service/manage.py`
- `services/database-service/database_service/settings.py`

File status:

- `services/database-service/requirements.txt` -> `Not found`

Static findings:

- `.env.example` is placeholder-only and local-safe
- `manage.py` exists
- `settings.py` uses monorepo-aware env lookup:
  - `services/database-service/.env`
  - repo root `.env`
  - `infra/.env`
- old `sofortbot-infra` runtime path reference not found in the inspected startup path

Commands:

- `python -m py_compile services/database-service/database_service/settings.py`
- `python -m py_compile services/database-service/orders_pars/service.py`

Results:

- both commands succeeded
- temporary `__pycache__` artifacts created by `py_compile` were removed during this validation slice

## 11. Orchestrator Host-Local Readiness

Files inspected:

- `services/orchestrator/requirements.txt`
- `services/orchestrator/.env.example`
- `services/orchestrator/src/sofort_orchestrator/main.py`

Static findings:

- `requirements.txt` exists
- `.env.example` is placeholder-only and local-safe
- `DATABASE_SERVICE_BASE_URL=http://localhost:8934`
- FastAPI app bootstrap file exists
- no obvious old runtime alias issue found in inspected startup path

Command:

- `python -m py_compile services/orchestrator/src/sofort_orchestrator/main.py`

Result:

- succeeded

## 12. Mobile Host-Local Readiness

Files inspected:

- `apps/mobile/pubspec.yaml`
- `apps/mobile/.env.example`

Static findings:

- `pubspec.yaml` exists
- app name remains `sofortbot_mobile`; this is naming only
- `.env.example` is placeholder-only and local-safe
- `API_BASE_URL=http://127.0.0.1:8932/api/v1`
- Flutter toolchain is available on host

## 13. Security And Artifact Validation

Commands:

- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\\.env(\\..*)?$' } | Select-Object -ExpandProperty FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','.venv','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object -ExpandProperty FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.FullName -match '\\\\.gitea$|\\\\.github$' } | Select-Object -ExpandProperty FullName`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match 'secret|token|password|passwd|credential|private|key' } | Select-Object -ExpandProperty FullName`

Results:

- `.env` scan found only example files:
  - `I:\WareHub\.env.example`
  - `I:\WareHub\apps\backend\.env.example`
  - `I:\WareHub\apps\frontend\.env.example`
  - `I:\WareHub\apps\mobile\.env.example`
  - `I:\WareHub\infra\.env.example`
  - `I:\WareHub\infra\deploy\runners\.env.example`
  - `I:\WareHub\services\database-service\.env.example`
  - `I:\WareHub\services\orchestrator\.env.example`
- forbidden directories scan finished clean after artifact cleanup
- nested workflow/repo metadata scan found only root `.github`
- suspicious filename scan matched only expected safe code/doc/script names:
  - backend password reset files
  - frontend password reset UI
  - `docs/ci-cd/secret-policy.md`
  - `infra/SECRET_ROTATION_PLAN.md`
  - `infra/scripts/scan-secrets.ps1`
  - `*_private.h` vendor header

## 14. Shutdown Validation

Command:

- `powershell -ExecutionPolicy Bypass -File .\stop-dev.ps1`

Result:

- succeeded
- `warehub-postgres`, `warehub-redis`, `warehub-minio` and `warehub-rabbitmq` were stopped and removed
- `local_default` network was removed

Final checks:

- `docker compose -f infra/local/docker-compose.dev.yml ps`
  - no running or remaining WareHub local containers
- `git status --short`
  - `?? docs/runbooks/slice-3g-host-local-startup-validation-report.md`

## 15. Validation Conclusion

Validated successfully:

- local dependency compose contract
- `start-dev.ps1` and `stop-dev.ps1`
- dependency health for Postgres and Redis
- basic startup health for MinIO and RabbitMQ
- host-local static readiness for backend, frontend, database-service, orchestrator and mobile

Checks not run:

- `npm run lint --if-present`
  - not run because `apps/frontend/node_modules` is missing
- any app runtime startup command
  - intentionally forbidden by slice scope
- any build/test/install command
  - intentionally forbidden by slice scope
- any migration command
  - intentionally forbidden by slice scope

Risks and warnings:

- `services/database-service/requirements.txt` is `Not found` at the expected path; host-local bootstrap documentation for this service still needs clarification
- backend package name and mobile app name still use legacy naming, but this did not block the validation scope
- RabbitMQ has a non-blocking deprecation warning in logs

Rollback notes:

- no code or config behavior was changed
- rollback is trivial: remove this report file if the slice is rejected

Production/stage impact:

- none

Next recommended step:

- separate narrow validation or cleanup slice for service-specific host-local bootstrap commands and dependency file ownership, starting with the missing `services/database-service/requirements.txt` path expectation
