# Slice 3F - Local Dev Runtime Validation Report

## 1. Summary

Slice 3F executed runtime-first validation for the WareHub local developer setup.

Result:

- Docker is available
- compose config is valid
- `start-dev.ps1` did not complete successfully
- the blocker is an existing legacy local environment already occupying the same ports and sharing the same compose project name
- no application runtime commands were started
- no code changes were made

## 2. Git State

- `Get-Location`
  - `I:\WareHub`
- `git branch --show-current`
  - `feature/slice-3f-local-dev-runtime-validation`
- `git status --short` before validation
  - clean
- `git log --oneline -5`
  - `5463e3b Merge pull request #6 from RavilkaDev0/feature/slice-3e-runtime-container-aliases`
  - `b33f518 chore: fix frontend backend runtime alias`
  - `de38a44 Merge pull request #5 from RavilkaDev0/feature/slice-3d-local-dev-validation`
  - `60f0351 docs: add local dev validation report`
  - `fc3cf52 Merge pull request #4 from RavilkaDev0/feature/slice-3c-runtime-env-paths`

## 3. Docker Availability

- `docker --version`
  - `Docker version 29.4.3, build 055a478`
- `docker compose version`
  - `Docker Compose version v5.1.3`

Status:

- Docker available: yes
- Compose available: yes

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
- no backend/frontend/database-service/orchestrator app services in this compose file
- no stage/prod services
- no old path references in resolved config
- no `F:\SofortBOT` references in resolved config

## 5. start-dev.ps1 Result

Command:

- `powershell -ExecutionPolicy Bypass -File .\start-dev.ps1`

Observed result:

- script started correctly
- compose pull/create/start sequence began
- local dependency startup failed on MinIO port bind

Primary error:

- `Bind for 0.0.0.0:9000 failed: port is already allocated`

Important context from startup:

- compose warned about orphan containers:
  - `sofortbot-orchestrator-dev`
  - `sofortbot-services-jv-worker-dev`
  - `sofortbot-minio-dev`
  - `sofortbot-services-dev`
  - `sofortbot-postgres-dev`

Interpretation:

- WareHub local dependency startup is blocked by a pre-existing legacy local stack
- the failure is environmental, not yet evidence of a WareHub compose syntax issue

## 6. Local Dependency Container Status

Immediately after failed startup, `docker compose -f infra/local/docker-compose.dev.yml ps -a` and `docker ps -a` showed:

WareHub containers:

- `warehub-rabbitmq` - briefly `Up`
- `warehub-redis` - briefly `Up`
- `warehub-postgres` - `Created`
- `warehub-minio` - `Created`

Legacy containers already present before validation:

- `sofortbot-minio-dev` - `Up`
- `sofortbot-postgres-dev` - `Up`
- `sofortbot-services-dev` - `Up`
- `sofortbot-services-jv-worker-dev` - `Up`
- `sofortbot-orchestrator-dev` - `Up (healthy)`

Final status after cleanup:

- WareHub containers removed
- legacy `sofortbot-*` containers still running

## 7. Dependency Smoke Checks

Not executed.

Reason:

- per slice rules, health/smoke checks were not continued after dependency startup failure
- because local dependency set did not start cleanly, running `docker exec` smoke checks would not have been trustworthy

## 8. stop-dev.ps1 Result

Command:

- `powershell -ExecutionPolicy Bypass -File .\stop-dev.ps1`

Observed result:

- script ran successfully
- `warehub-redis`, `warehub-rabbitmq`, `warehub-postgres`, `warehub-minio` were stopped/removed
- volumes were not removed

Extra note:

- compose printed:
  - `Network local_default Resource is still in use`

Likely reason:

- the legacy `sofortbot-*` containers are still attached to the same compose project/network namespace

Post-stop `docker compose -f infra/local/docker-compose.dev.yml ps -a` showed only the legacy `sofortbot-*` stack remaining.

## 9. Env File Scan

Command:

- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`

Result:

- `I:\WareHub\.env.example`
- `I:\WareHub\apps\backend\.env.example`
- `I:\WareHub\apps\frontend\.env.example`
- `I:\WareHub\apps\mobile\.env.example`
- `I:\WareHub\infra\.env.example`
- `I:\WareHub\infra\deploy\runners\.env.example`
- `I:\WareHub\services\database-service\.env.example`
- `I:\WareHub\services\orchestrator\.env.example`

Assessment:

- only `.env.example` files found
- no real `.env` files created by this validation

## 10. Artifact / Security Scan

Forbidden build/cache dirs scan:

- result: none

Nested workflow dirs scan:

- result: only root `I:\WareHub\.github`

Suspicious file name scan:

- `I:\WareHub\apps\backend\migrations\20260302081300_create_password_reset_codes.sql`
- `I:\WareHub\apps\backend\src\auth\handlers_password_reset.rs`
- `I:\WareHub\apps\backend\src\auth\password.rs`
- `I:\WareHub\apps\frontend\app\login\reset-password-modal.tsx`
- `I:\WareHub\apps\frontend\components\profile\account-panel\profile-password-card.tsx`
- `I:\WareHub\docs\ci-cd\secret-policy.md`
- `I:\WareHub\infra\SECRET_ROTATION_PLAN.md`
- `I:\WareHub\infra\scripts\scan-secrets.ps1`

Classification:

- safe code/docs/script names
- no real secret file indicated by the scan

## 11. Blockers

- existing legacy local stack still running:
  - `sofortbot-minio-dev`
  - `sofortbot-postgres-dev`
  - `sofortbot-services-dev`
  - `sofortbot-services-jv-worker-dev`
  - `sofortbot-orchestrator-dev`
- `sofortbot-minio-dev` already occupies ports `9000/9001`
- legacy and WareHub local stacks appear to share compose project/network identity `local`
- because of this, a clean WareHub local dependency bootstrap could not be validated end-to-end

## 12. Warnings

- current validation outcome is environment-blocked, not product-blocked
- until the legacy local stack is stopped or isolated, WareHub local runtime validation can produce false negatives
- `stop-dev.ps1` correctly avoided volume removal, but shared project/network naming with an older stack makes cleanup messages noisier

## 13. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- file presence checks for:
  - `start-dev.ps1`
  - `stop-dev.ps1`
  - `infra/local/docker-compose.dev.yml`
  - `docs/runbooks/local-dev.md`
  - `docs/runbooks/slice-3e-runtime-container-aliases-report.md`
- `docker --version`
- `docker compose version`
- `docker compose -f infra/local/docker-compose.dev.yml config`
- `powershell -ExecutionPolicy Bypass -File .\start-dev.ps1`
- `docker compose -f infra/local/docker-compose.dev.yml ps`
- `docker compose -f infra/local/docker-compose.dev.yml ps -a`
- `docker ps -a --format ...`
- `powershell -ExecutionPolicy Bypass -File .\stop-dev.ps1`
- `Get-ChildItem ...` env scan
- `Get-ChildItem ...` forbidden dirs scan
- `Get-ChildItem ...` nested workflows scan
- `Get-ChildItem ...` suspicious files scan
- final `git status --short`

## 14. Next Step

Recommended next step:

- stop or isolate the old `sofortbot-*` local stack first
- then rerun the same Slice 3F runtime validation on a clean Docker environment

If isolation is preferred over stopping old containers, do it in a separate slice with explicit confirmation, because that changes the local runtime environment outside the repo.

## 15. Retry After Stopping Legacy Local Stack

Legacy containers that previously blocked startup:

- `sofortbot-minio-dev`
- `sofortbot-postgres-dev`
- `sofortbot-services-dev`
- `sofortbot-services-jv-worker-dev`
- `sofortbot-orchestrator-dev`

Context for retry:

- they were stopped manually via `docker stop`
- volumes were not removed

Retry result:

- `git status --short` before retry:
  - `?? docs/runbooks/slice-3f-local-dev-runtime-validation-report.md`
- `docker compose -f infra/local/docker-compose.dev.yml config`
  - still valid
- `powershell -ExecutionPolicy Bypass -File .\start-dev.ps1`
  - passed on retry
  - all four `warehub-*` local dependency containers were created and started

Status of `warehub-*` containers during retry:

- `warehub-postgres`
  - `Up` and `healthy`
- `warehub-redis`
  - `Up`
- `warehub-minio`
  - `Up`
- `warehub-rabbitmq`
  - `Up`

Observed status of old legacy containers after retry:

- `sofortbot-minio-dev` - `Exited (0)`
- `sofortbot-postgres-dev` - `Exited (0)`
- `sofortbot-services-dev` - `Exited (137)`
- `sofortbot-services-jv-worker-dev` - `Exited (137)`
- `sofortbot-orchestrator-dev` - `Exited (0)`

Dependency smoke checks on retry:

- Postgres:
  - command: `docker exec warehub-postgres pg_isready -U warehub -d warehub_dev`
  - result: `/var/run/postgresql:5432 - accepting connections`
  - note: compose config sets `POSTGRES_DB=warehub`, but `pg_isready` still returned healthy acceptance for the requested DB name
- Redis:
  - command: `docker exec warehub-redis redis-cli ping`
  - result: `PONG`
- MinIO:
  - status: `Up`
  - log tail result: normal startup banner, API and WebUI listeners advertised, no fatal error observed
- RabbitMQ:
  - status: `Up`
  - log tail result: server startup completed, management and Prometheus listeners started
  - note: one deprecation warning about `management_metrics_collection`, not a startup blocker

Retry stop result:

- `powershell -ExecutionPolicy Bypass -File .\stop-dev.ps1`
  - passed
  - `warehub-postgres`, `warehub-redis`, `warehub-minio`, `warehub-rabbitmq` stopped and removed
  - network `local_default` removed cleanly
- final `docker compose -f infra/local/docker-compose.dev.yml ps`
  - empty result, no running `warehub-*` containers remain

Final git status after retry:

- `?? docs/runbooks/slice-3f-local-dev-runtime-validation-report.md`
