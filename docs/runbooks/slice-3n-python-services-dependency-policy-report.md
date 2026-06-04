# Slice 3N — Python Services Dependency Policy Report

## 1. Summary

Slice 3N reviewed the remaining role of `services/requirements.txt` after the split of `services/database-service/requirements.txt`.

Current conclusion:

- `services/database-service` no longer uses `services/requirements.txt` as its source of truth
- `services/orchestrator` uses its own local `requirements.txt`
- no current active Dockerfile or local-dev contract in the monorepo points `database-service` back to `services/requirements.txt`
- the remaining shared manifest appears to be a legacy carryover, not a current bootstrap source of truth

Safer recommendation:

- keep `services/requirements.txt` temporarily as a legacy/shared manifest
- document that it is not the source of truth for `database-service`
- remove or rename it only in a dedicated migration slice after all remaining references and historical assumptions are cleaned up

## 2. Git State

- `Get-Location`
  - `I:\WareHub`
- `git branch --show-current`
  - `feature/slice-3n-python-services-dependency-policy`
- `git status --short` before changes
  - clean
- `git log --oneline -5`
  - `d379ab6 Merge pull request #14 from RavilkaDev0/feature/slice-3m-database-service-requirements-cleanup`
  - `f3950a3 chore: clean up database service requirements`
  - `cb5c57d Merge pull request #13 from RavilkaDev0/feature/slice-3l-database-service-uv-bootstrap-validation`
  - `4f41845 docs: validate database service uv bootstrap`
  - `a224fe3 Merge pull request #12 from RavilkaDev0/feature/slice-3k-database-service-requirements-audit`

## 3. Files Inspected

- `services/requirements.txt`
- `services/database-service/requirements.txt`
- `services/orchestrator/requirements.txt`
- `services/database-service/Dockerfile`
- `services/database-service/docker-compose.yml`
- `services/orchestrator/Dockerfile`
- `services/README.md`
- `docs/runbooks/local-dev.md`
- `infra/local/docker-compose.dev.yml`
- `infra/deploy/stage/docker-compose.yml`
- `infra/deploy/prod/docker-compose.yml`
- reference search results under `services`, `infra`, `docs`, `README.md`, `.github`

## 4. Dependency Manifests Compared

`services/requirements.txt` currently contains:

- Django-oriented service dependencies
- `PyYAML`
- `inflection`
- `openpyxl`
- all `database-service` keep dependencies
- test dependencies

`services/database-service/requirements.txt` currently contains:

- all current `database-service` keep dependencies
- no `PyYAML`
- no `inflection`
- no `openpyxl`

`services/orchestrator/requirements.txt` currently contains:

- `fastapi`
- `uvicorn[standard]`
- `httpx`
- `pydantic`
- `pytest`

Static comparison:

- shared-only entries in `services/requirements.txt`:
  - `PyYAML>=6.0,<7.0`
  - `inflection>=0.5,<1.0`
  - `openpyxl>=3.1,<4.0`
- intersection between shared and `database-service`:
  - Django
  - djangorestframework
  - psycopg[binary]
  - django-cors-headers
  - uritemplate
  - requests
  - python-dotenv
  - mysql-connector-python
  - Pillow
  - pytest
  - pytest-django
- intersection between shared and orchestrator:
  - `pytest>=8.0,<9.0`
- orchestrator-only entries:
  - `fastapi`
  - `uvicorn[standard]`
  - `httpx`
  - `pydantic`

## 5. services/requirements.txt References

Reference classes found:

Database-service references:

- historical docs only:
  - older slice reports document the previous state where `services/requirements.txt` was the source of truth

Orchestrator references:

- `services/orchestrator/Dockerfile`
  - `COPY requirements.txt ./`
  - `RUN pip install --no-cache-dir -r requirements.txt`
- `services/orchestrator/README.md`
  - `pip install -r requirements.txt`

Legacy/shared references:

- `services/database-service/requirements.txt`
  - ownership comment says it was initially split from `services/requirements.txt`
- multiple historical slice reports mention `services/requirements.txt`

Dockerfile references:

- current `services/database-service/Dockerfile`
  - uses `COPY database-service/requirements.txt /app/requirements.txt`
- current `services/orchestrator/Dockerfile`
  - uses its own local `requirements.txt`

Docs-only references:

- `services/database-service/README.md`
  - states `services/requirements.txt` is no longer the source of truth
- `docs/runbooks/local-dev.md`
  - points `database-service` to `services/database-service/requirements.txt`
- historical slice reports and discovery documents still mention the legacy/shared manifest

Stage/prod/deploy references:

- no direct references to `services/requirements.txt` found in inspected stage/prod compose files
- stage/prod compose files consume prebuilt images, not requirements manifests directly

## 6. Current Consumers

Current likely active consumers of `services/requirements.txt`:

- no confirmed active runtime/bootstrap consumer for `database-service`
- no confirmed active runtime/bootstrap consumer for `orchestrator`
- possible legacy/manual human usage only
- historical reports and old mental model only

Current active manifest owners:

- `services/database-service/requirements.txt`
  - source of truth for `database-service`
- `services/orchestrator/requirements.txt`
  - source of truth for `orchestrator`

Current deploy/runtime image consumers:

- `services/database-service/Dockerfile` consumes `database-service/requirements.txt`
- `services/orchestrator/Dockerfile` consumes `services/orchestrator/requirements.txt`
- stage/prod compose files consume built images and do not reference `services/requirements.txt`

## 7. Risks of Removing Shared Manifest

Risks if `services/requirements.txt` is removed or renamed immediately:

- hidden manual developer workflows may still rely on it
- old docs or copied local habits may still assume it exists
- older slice reports and historical context would become stale immediately
- future repo searches or scripts might still refer to a generic top-level `requirements.txt` inside `services`

Lower-risk observations:

- current active `database-service` bootstrap no longer needs it
- current active `orchestrator` bootstrap does not need it either
- stage/prod compose files do not point to it directly

## 8. Recommended Policy

Recommended option:

- Variant A

Policy:

- keep `services/requirements.txt` temporarily as a legacy/shared manifest
- treat it as `Not source of truth` for both `database-service` and `orchestrator`
- use service-local manifests as the only active bootstrap inputs:
  - `services/database-service/requirements.txt`
  - `services/orchestrator/requirements.txt`
- remove or rename `services/requirements.txt` only in a dedicated migration slice after:
  - all remaining doc references are cleaned
  - any manual/developer dependency on the file is explicitly ruled out
  - validation confirms no scripts or build flows still expect it

Why this is safer:

- current codepaths already work without depending on the shared manifest
- immediate removal would create avoidable documentation and workflow drift risk
- the shared file can be retired later with a clean migration/report slice

## 9. Documentation Changes

- none

Reason:

- current runtime docs already point `database-service` to `services/database-service/requirements.txt`
- this slice is best kept as discovery/policy only

## 10. Validation Results

Commands run:

- `git status --short`
- `git log --oneline -5`
- reference search with `rg`
- `Get-Content` on all inspected manifests and Docker/compose/docs files
- static manifest comparison script
- `docker compose -f services/database-service/docker-compose.yml config`
- `uv --version`

Results:

- preflight passed
- `database-service` Dockerfile uses service-local manifest
- `orchestrator` Dockerfile uses its own local manifest
- no direct stage/prod compose consumer of `services/requirements.txt` found
- shared manifest still contains legacy-only packages not present in `database-service`
- no file changes beyond this report

## 11. Blockers

- no hard blockers for this discovery slice

## 12. Warnings

- absence of a current direct consumer does not guarantee there is no undocumented manual workflow using `services/requirements.txt`
- historical reports and legacy docs still mention the shared manifest and could confuse future cleanup unless migrated intentionally

## 13. Proposed Next Slice

Recommended next slice:

- a narrow migration slice to mark `services/requirements.txt` explicitly deprecated in docs, and then remove or rename it only after validating there are no remaining manual or scripted consumers
