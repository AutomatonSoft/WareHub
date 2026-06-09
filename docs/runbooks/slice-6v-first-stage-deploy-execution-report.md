# Slice 6V - First Stage Deploy Execution Report

## 1. Scope

- Goal: document the first real stage deploy execution and its result.
- Repository root: `I:\WareHub`
- This is a documentation-only slice.
- This slice does not deploy anything.

## 2. Deploy Summary

- The first stage deploy was executed manually from Windows PowerShell via SSH alias `warehub-stage`.
- Deploy path: `/opt/warehub/stage`
- Compose project: `warehub-stage`
- Deploy result:
  - containers were created and started
  - stage frontend stopped returning nginx `502`
  - orchestrator application responded on `/healthz`
  - services container started without applying migrations

## 3. Commands Executed

```powershell
ssh warehub-stage "cd /opt/warehub/stage && docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml pull && docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml up -d && docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml ps && docker ps --filter label=com.docker.compose.project=warehub-stage"
```

## 4. Images Pulled

- `postgres:16-alpine`
- `ghcr.io/ravilkadev0/warehub/frontend:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/mobile:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/backend:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/services:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/orchestrator:stage-a1c2946`

## 5. Docker Resources Created

- Network created:
  - `warehub-stage_default`
- Volumes created:
  - `warehub-stage_stage_pg_data`
  - `warehub-stage_stage_orchestrator_data`
- Containers created and started:
  - `warehub-stage-frontend-1`
  - `warehub-stage-mobile-1`
  - `warehub-stage-backend-1`
  - `warehub-stage-services-1`
  - `warehub-stage-orchestrator-1`
  - `warehub-stage-postgres-1`

## 6. Container Status

- frontend: `Up`
- mobile: `Up`
- backend: `Up`
- services: `Up`
- postgres: `Up healthy`
- orchestrator: `Up` but Docker healthcheck `unhealthy`

Observed ports:

- frontend: `0.0.0.0:8941->8931/tcp`
- backend: `0.0.0.0:8942->8932/tcp`
- postgres: `127.0.0.1:8943->5432/tcp`
- services: `0.0.0.0:8944->8000/tcp`
- orchestrator: `0.0.0.0:8945->8011/tcp`
- mobile: internal `80/tcp` only

## 7. External Smoke Results

- `curl -I https://stagewarehub.automatonsoft.de/` returned `307 Temporary Redirect`, location `/login`
- `curl -I https://stagewarehub.automatonsoft.de/api` returned `404 Not Found` with `x-request-id`, not nginx `502`
- `curl -I https://stagewarehub.automatonsoft.de/services` returned `307 Temporary Redirect`, location `/login`
- `curl -I https://stagewarehub.automatonsoft.de/orchestrator` returned `307 Temporary Redirect`, location `/login`

## 8. Local Smoke Results

- `http://127.0.0.1:8941/` returned `307 /login`
- `http://127.0.0.1:8942/` returned `404`
- `http://127.0.0.1:8944/` returned Django `404`
- `http://127.0.0.1:8945/` returned FastAPI `404`
- `http://127.0.0.1:8945/healthz` returned `200 OK` with `{"status":"ok"}`
- `http://127.0.0.1:8945/docs` returned `200 OK`
- `http://127.0.0.1:8945/openapi.json` returned `200 OK`

## 9. Logs Summary

- services logs showed:
  - `RUN_MIGRATIONS_ON_STARTUP=false; skipping migrate on startup`
  - `System check identified no issues (0 silenced).`
  - `You have 61 unapplied migration(s).`
- `python manage.py check` returned:
  - `System check identified no issues (0 silenced).`
- `showmigrations --plan` listed `61` unapplied migrations across:
  - `contenttypes`
  - `auth`
  - `admin`
  - `jv_services`
  - `catalog_core`
  - `database`
  - `hood_service`
  - `kaufland`
  - `otto_service`
  - `sessions`
  - `xl_services`

## 10. Known Issues / Blockers

- `BLOCKER`: `61` unapplied Django migrations
- `ISSUE`: orchestrator Docker healthcheck is broken because the image does not contain `wget`
- `NOTE`: services currently uses Django development server warning
- `NOTE`: one transient SSH timeout was observed

Additional orchestrator healthcheck detail:

- `docker inspect .State.Health` showed repeated failures
- failure reason:
  - `OCI runtime exec failed: exec failed: unable to start container process: exec: "wget": executable file not found in $PATH`
- Docker healthcheck config:
  - `["CMD","wget","-qO-","http://127.0.0.1:8011/healthz"]`
- conclusion:
  - the orchestrator application is alive
  - the Docker healthcheck is broken because `wget` is unavailable or the healthcheck should use a different implementation

## 11. Decision: Rollback Not Performed

- rollback was not performed
- containers were left running
- volumes were not removed
- images were not removed

## 12. Follow-Up Slices

- `Slice 6W - stage Django migrations plan / execution decision`
- `Slice 6X - orchestrator healthcheck fix`
- optional future hardening: services production server instead of Django development server
- optional future hardening: cert renewal automation confirmation
- optional future hardening: Node.js 20 GitHub Actions deprecation

## 13. Explicit Non-Goals

- no additional deploy
- no migrations
- no rollback
- no nginx reload
- no certbot changes
- no prod changes
- no GitHub Secrets changes
- no GitHub Variables changes
- no workflow changes
- no compose changes
- no Dockerfile changes
- no source changes
