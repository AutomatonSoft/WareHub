# WareHub / SofortBOT — Current State and Next Safe Steps

## Executive status
- Stage slices for services health and migration safety are complete and verified with command evidence.
- Stage currently runs explicit image tag `v0.5.3-stage.2` and returns HTTP 200 on both health paths.
- Production runtime was not deployed or restarted.
- Automatic startup migrations are gated by `RUN_MIGRATIONS_ON_STARTUP` with stage/prod defaults set to `false`.

## Closed slices
- Remove local secrets from services repository.
- Add missing JV batch job status migration.
- Stage-only services image update and migration verification.
- Disable automatic migrations on services startup.
- Add/verify services health endpoint contract.

## Current deployed stage state
- Services image in stage compose is pinned to `git.automatonsoft.de/raviladmin/sofortbot-services:v0.5.3-stage.2`.
- Stage services container was recreated and health checks succeeded:
  - `curl http://127.0.0.1:8944/api/v1/healthz` -> HTTP 200
  - `curl http://127.0.0.1:8944/healthz` -> HTTP 200
  - response body: `{"status":"ok","service":"database_service"}`
- Stage logs confirm startup migration gate behavior:
  - `RUN_MIGRATIONS_ON_STARTUP=false; skipping migrate on startup`
- Stage migration plan status:
  - `No planned migration operations.`

## Current production state
- Production runtime was not deployed.
- Production services container was not restarted.
- Production compose configuration was validated only.
- Production compose includes `RUN_MIGRATIONS_ON_STARTUP` gate.
- No production migrations were applied.

## Migration policy
- Root cause of prior auto-migrate behavior was infra compose command wiring.
- Fix committed in infra: `3b49d06 Disable automatic migrations on services startup`.
- Startup migrations in stage/prod are now explicitly gated.
- Defaults:
  - `STAGE_RUN_MIGRATIONS_ON_STARTUP=false`
  - `PROD_RUN_MIGRATIONS_ON_STARTUP=false`
- Explicit migration path (stage):
  - `docker compose --env-file .env -f deploy/stage/docker-compose.yml run --rm services python manage.py migrate`
- Production equivalent is allowed only with explicit manual approval.

## Health endpoint contract
- Implemented paths (no auth, no DB-heavy logic):
  - `/healthz`
  - `/healthz/`
  - `/api/v1/healthz`
  - `/api/v1/healthz/`
- Expected behavior:
  - HTTP 200 when service is healthy.
  - JSON response format currently observed: `{"status":"ok","service":"database_service"}`.

## Repository state
- Services latest important commits:
  - `bcef570` Remove local secrets from services repository
  - `bb4e4d9` Add missing JV batch job status migration
  - `d3750d8` Add database service health endpoint
- Infra local repository is dirty with unrelated docs/scripts and README changes.
- Safe-slice rule remains: do not commit unrelated infra changes together with operational updates.

## Remote server state
- Remote infra path: `/home/server/sofotbot/infra` (typo is intentional on server path).
- Remote infra git checkout is old/dirty.
- No `git pull` was performed on server due to local modifications.
- Only required compose files were copied manually to server.
- Backups confirmed:
  - `.env.bak.healthz.20260520-140212`
  - `.env.bak.20260520-124739`
  - `deploy/stage/docker-compose.yml.bak.20260520-131121`
  - `deploy/prod/docker-compose.yml.bak.20260520-131121`

## Known risks / blockers
- `git push gitea main` for services failed with authentication error; tag push succeeded.
- Operational source of truth for CI/CD and registry is Gitea; GitHub acts as mirror/storage.
- `stage-latest` tag was stale; exact tag pinning is required for verification.
- Remote infra repo on server requires dedicated reconciliation slice.
- Secret rotation is still required because secrets were previously tracked and one FTP password was exposed.
- Compose config warnings still exist and need cleanup:
  - `ORCHESTRATOR_IMAGE not set`
  - `ORCHESTRATOR_STAGE_TAG not set`
  - `STAGE_PUBLIC_SERVICES_API_BASE_URL not set`
  - `PROD_PUBLIC_SERVICES_API_BASE_URL not set`

## Next safe slices

### A. Services/Gitea auth cleanup
Goal:
- Make `git push gitea main` work reliably for services.

Rules:
- Do not rotate tags blindly.
- Do not force-push.

Acceptance:
- `git push gitea main` succeeds.
- `gitea/main` equals `origin/main` for services.
- Stage tags still work.

### B. Remote infra repo reconciliation
Goal:
- Understand why `/home/server/sofotbot/infra` is old/dirty.

Rules:
- Read-only first.
- No `git pull` until modified files are classified.

Acceptance:
- List dirty files.
- Classify local server changes.
- Backup important local changes.
- Decide whether to reset, merge, or preserve.
- No production impact.

### C. Secret rotation
Goal:
- Rotate leaked FTP password.
- Rotate credentials from previously tracked services `.env` files.
- Update runtime envs safely.

Acceptance:
- New secrets installed.
- Old credentials revoked.
- Redaction patterns cover `PASS`, `PASSWORD`, `TOKEN`, `SECRET`, `KEY`, `DSN`, `DATABASE_URL`, `API_HASH`, `API_ID`.
- No raw secrets in logs.

### D. Env warnings cleanup
Goal:
- Define or intentionally remove missing `ORCHESTRATOR_IMAGE`, `ORCHESTRATOR_STAGE_TAG`, `STAGE_PUBLIC_SERVICES_API_BASE_URL`, `PROD_PUBLIC_SERVICES_API_BASE_URL`.

Acceptance:
- `docker compose config` has no unexpected warnings.
- No dummy production values.

### E. Stage full smoke
Goal:
- Verify services health.
- Verify key endpoints.
- Verify frontend points to correct API.
- Verify no auto-migrate.
- Verify `migrate --plan` is clean.

Acceptance:
- HTTP 200 health.
- No migration side effects.
- Smoke report stored.

### F. Prod readiness gate
Goal:
- Prepare production deploy only after stage completion.

Acceptance:
- Explicit GO/NO-GO checklist.
- Rollback plan.
- DB backup verified.
- Migration plan reviewed.
- Manual approval before prod.

## Do-not-do rules
- Do not run `start-prod.ps1`.
- Do not run `start-stage.ps1` while infra repo is dirty.
- Do not apply migrations automatically.
- Do not run `git add -A` in dirty infra.
- Do not print raw `.env`.
- Do not use mutable `stage-latest` for verification when exact tag exists.
- Do not claim DONE without command evidence.

## Rollback notes
- Compose file backups exist for both stage and prod and can be restored if needed.
- `.env` backups exist and must be used carefully with secret redaction discipline.
- Rollback must preserve migration gate defaults (`*_RUN_MIGRATIONS_ON_STARTUP=false`) unless explicitly approved change is documented.
- Any rollback affecting runtime must be recorded with command evidence and timestamp.

## Evidence commands

Services health:
```bash
curl -i http://127.0.0.1:8944/api/v1/healthz
curl -i http://127.0.0.1:8944/healthz
```

Stage logs:
```bash
cd /home/server/sofotbot/infra
docker compose --env-file .env -f deploy/stage/docker-compose.yml logs --tail=120 services
```

Migration plan:
```bash
docker compose --env-file .env -f deploy/stage/docker-compose.yml exec -T services python manage.py migrate --plan
```

Stage compose image:
```bash
docker compose --env-file .env -f deploy/stage/docker-compose.yml config | grep -A18 -B5 'sofortbot-services'
```
