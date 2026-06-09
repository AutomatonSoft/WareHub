# Slice 6U - First Stage Deploy Plan, Smoke Test Checklist, And Rollback

## 1. Scope

- Goal: define the exact first stage deploy plan, smoke tests, rollback procedure, and go/no-go checklist.
- Repository root: `I:\WareHub`
- This is a documentation-only planning slice.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- Stage compose preflight succeeded.
- `docker compose config --quiet` passed.
- `/opt/warehub/stage/.env` and `/opt/warehub/stage/docker-compose.yml` are expected to exist on the host.
- GHCR images are available with immutable tag `stage-a1c2946`.
- Stage domain `stagewarehub.automatonsoft.de` is currently expected to return `502` until containers run.
- The server hosts other projects.

## 3. First Deploy Objective

- start WareHub stage containers using the existing remote `/opt/warehub/stage/.env` and `docker-compose.yml`
- verify stage frontend, backend, services, and orchestrator are reachable
- keep blast radius limited to compose project `warehub-stage`

## 4. Exact Deploy Command Plan

Future operator command plan only. NOT EXECUTED in this slice.

```bash
ssh warehub-stage
cd /opt/warehub/stage
test -f .env
test -f docker-compose.yml
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml config --quiet
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml pull
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml up -d
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml ps
docker ps --filter label=com.docker.compose.project=warehub-stage
```

Notes:

- use SSH alias `warehub-stage` if available
- do not print `.env`
- do not use `docker system prune`
- do not include unscoped Docker commands

## 5. Migration Policy

- the first deploy should not run migrations automatically unless explicitly approved
- if migrations are required, define a separate migration slice before deploy
- `STAGE_RUN_MIGRATIONS_ON_STARTUP=false` was intended for first stage safety

## 6. Smoke Test Checklist

Command shapes only. NOT EXECUTED in this slice. Run Docker Compose log commands from `/opt/warehub/stage`.

```bash
curl -I https://stagewarehub.automatonsoft.de/
curl -I https://stagewarehub.automatonsoft.de/api
curl -I https://stagewarehub.automatonsoft.de/services
curl -I https://stagewarehub.automatonsoft.de/orchestrator

docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml logs --tail=100 frontend
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml logs --tail=100 backend
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml logs --tail=100 services
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml logs --tail=100 orchestrator
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml logs --tail=100 postgres
```

## 7. Expected Acceptable Results

- frontend should stop returning nginx `502`
- API and service endpoints may return `200`, `3xx`, `401`, or `404` depending on route behavior, but not connection refused or nginx `502`
- containers should be running or healthy if healthchecks exist
- no repeated crash loop
- no secret values in logs

## 8. Rollback Plan

Future rollback commands only. NOT EXECUTED in this slice.

```bash
ssh warehub-stage
cd /opt/warehub/stage
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml down
docker ps --filter label=com.docker.compose.project=warehub-stage
```

Notes:

- volumes are not removed
- images are not removed
- other projects are untouched

## 9. Log Inspection Plan

- `docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml ps`
- `docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml logs --tail=200 <service>`
- `docker inspect <container_id>` for restart count if needed
- do not print `.env`

## 10. Forbidden Actions

- no `docker system prune`
- no `docker volume rm`
- no unscoped `docker stop` or `docker rm`
- no nginx reload unless explicitly approved
- no certbot changes
- no editing `.env` directly during deploy
- no changing stage or prod secrets during deploy
- no deploying prod
- no running migrations without approval

## 11. Go/No-Go Checklist

Go only if:

- PR containing this runbook is merged
- stage env secret remains present
- GHCR token is valid
- operator accepts that `/opt/warehub/stage/.env` exists
- deploy window is clear
- rollback commands are ready
- no unrelated server maintenance is running

## 12. Post-Deploy Documentation Requirement

After the first deploy, create a new report slice documenting:

- exact commands run
- run result
- smoke test output
- container status
- logs summary
- rollback not needed or performed
- issues found

## 13. Recommended Next Slice

- `Slice 6V - first stage deploy execution report`

Important:

- only proceed after explicit approval to perform the first deploy

## 14. Explicit Non-Goals

- no deploy
- no `docker compose pull`
- no `docker compose up`
- no `docker compose run`
- no migrations
- no nginx reload
- no certbot changes
- no GitHub Secrets changes
- no GitHub Variables changes
- no workflow changes
- no compose changes
- no Dockerfile changes
- no source changes

