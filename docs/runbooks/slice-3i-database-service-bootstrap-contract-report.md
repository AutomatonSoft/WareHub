# Slice 3I — Database-Service Bootstrap Contract Fix Report

## 1. Summary

Slice 3I normalized the `database-service` local Docker/bootstrap contract for the WareHub monorepo without changing runtime Python code, migrations, dependency manifests or env examples.

Result:

- `services/requirements.txt` remains the confirmed dependency manifest source of truth
- `services/database-service/Dockerfile` now matches the monorepo layout when built with context `services`
- `services/database-service/docker-compose.yml` now uses a monorepo-safe local/dev contract
- service-local compose no longer auto-runs migrations
- `services/database-service/README.md` and `docs/runbooks/local-dev.md` now describe the normalized contract

## 2. Files Changed

- `services/database-service/Dockerfile`
- `services/database-service/docker-compose.yml`
- `services/database-service/README.md`
- `docs/runbooks/local-dev.md`
- `docs/runbooks/slice-3i-database-service-bootstrap-contract-report.md`

## 3. Dependency Manifest Contract

Confirmed contract:

- do not create `services/database-service/requirements.txt` in this slice
- do not duplicate dependencies into a service-local manifest
- current dependency source of truth for `database-service` remains:
  - `services/requirements.txt`

Related file classification:

- `services/requirements.txt`
  - Django-oriented shared services dependency manifest
- `services/orchestrator/requirements.txt`
  - orchestrator-only dependency manifest

## 4. Dockerfile Changes

Updated file:

- `services/database-service/Dockerfile`

Normalized contract:

- expected Docker build context:
  - `services`
- dependency file copied from build context root:
  - `requirements.txt`
- application code copied from:
  - `database-service`
- working directory:
  - `/app`
- runtime command:
  - `python manage.py runserver 0.0.0.0:8000`

Important behavior:

- the Dockerfile does not run migrations
- the Dockerfile no longer references legacy `services/database_service`

## 5. Service-Local Compose Changes

Updated file:

- `services/database-service/docker-compose.yml`

Normalized contract:

- compose file is local/dev only
- build context:
  - `..`
  - resolved by Docker Compose to `I:\WareHub\services`
- Dockerfile path:
  - `database-service/Dockerfile`
- service names:
  - `database-service`
  - `database-service-db`
- container names:
  - `warehub-database-service-local`
  - `warehub-database-service-db-local`
- local ports:
  - Django API `8934:8000`
  - Postgres `8543:5432`
- no stage/prod hosts
- no legacy snake_case path references
- no auto-migrate command

Compose runtime behavior:

- app command is only `python manage.py runserver 0.0.0.0:8000`
- database defaults are local-safe and container-local:
  - host `database-service-db`
  - port `5432`
  - db `warehub_database_service`
  - user `warehub`
  - password `warehub`

## 6. Documentation Changes

Updated:

- `services/database-service/README.md`
- `docs/runbooks/local-dev.md`

What changed:

- replaced legacy `cd database_service` guidance with monorepo path `services/database-service`
- documented that dependency source of truth is `services/requirements.txt`
- documented that service-local Docker build uses context `services`
- documented that local compose is local/dev only
- documented that migrations are manual and are not auto-run by local compose
- kept host-local manual install/start commands intentionally conservative and non-invented

## 7. Validation Results

Commands run:

- `git status --short`
- `docker compose -f services/database-service/docker-compose.yml config`
- path existence checks for:
  - `services/requirements.txt`
  - `services/database-service/Dockerfile`
  - `services/database-service/manage.py`
- `rg -n "services/database_service|sofortbot-services|sofortbot-infra|F:\\SofortBOT|python manage.py migrate|migrate &&|&& python manage.py migrate" services/database-service/Dockerfile services/database-service/docker-compose.yml services/database-service/README.md docs/runbooks/local-dev.md`
- env scan
- forbidden dirs scan

Results:

- `git status --short` showed only the expected changed files
- `docker compose ... config` succeeded
- resolved compose confirms:
  - build context `I:\WareHub\services`
  - Dockerfile `database-service/Dockerfile`
  - app port `8934`
  - db port `8543`
- path existence checks all passed
- `rg` returned exit code `1`, which is expected for zero matches
- env scan found only `.env.example` files
- forbidden dirs scan was empty

## 8. Remaining Limitations

- `database-service` still relies on shared `services/requirements.txt`, which is workable but not ideal for long-term service ownership boundaries
- host-local manual install/start commands remain intentionally under-specified to avoid inventing an unverified workflow
- `services/README.md` still contains broader imported legacy repository text outside the scope of this slice

## 9. Risks

- if the team later changes the intended Docker build context away from `services`, this Dockerfile contract will need to be updated consistently
- shared `services/requirements.txt` can create coupling between multiple services until dependency ownership is split or explicitly preserved by policy
- the service-local compose file is local/dev only and must not be reused as deploy guidance

## 10. Next Step

Recommended next slice:

- decide whether `database-service` should keep using shared `services/requirements.txt` or move to an explicitly owned service-local dependency manifest in a future controlled slice
- if ownership is split later, update Dockerfile, docs and validation together in the same slice
