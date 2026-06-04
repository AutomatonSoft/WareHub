# Slice 3H — Database-Service Host-Local Bootstrap Report

## 1. Summary

Slice 3H clarified the current host-local bootstrap contract for `services/database-service` after the monorepo migration.

Confirmed state:

- `services/database-service/requirements.txt` is `Not found`
- `services/requirements.txt` exists and contains Django-oriented dependencies that match `database-service`
- `services/orchestrator/requirements.txt` exists separately and contains only orchestrator-specific FastAPI dependencies
- the imported `services/database-service/Dockerfile` still expects legacy paths that do not match the current monorepo layout
- the imported `services/database-service/docker-compose.yml` still references legacy snake_case paths and auto-runs migrations
- a code fix was not applied in this slice
- only documentation was updated to reflect the confirmed current state

Conclusion:

- the actual confirmed dependency source for `database-service` is currently `services/requirements.txt`
- local install/bootstrap commands for `database-service` should remain `Needs follow-up` until a dedicated fix slice makes the service-local Docker/bootstrap contract monorepo-safe

## 2. Git State

- `Get-Location`
  - `I:\WareHub`
- `git branch --show-current`
  - `feature/slice-3h-database-service-bootstrap`
- `git status --short` before changes
  - clean
- `git log --oneline -5`
  - `d1c82f8 Merge pull request #8 from RavilkaDev0/feature/slice-3g-host-local-startup-validation`
  - `0b45485 docs: add host local startup validation report`
  - `8b2ad33 Merge pull request #7 from RavilkaDev0/feature/slice-3f-local-dev-runtime-validation`
  - `fefde8c docs: add local dev runtime validation report`
  - `5463e3b Merge pull request #6 from RavilkaDev0/feature/slice-3e-runtime-container-aliases`

## 3. Files Inspected

- `services/`
- `services/README.md`
- `services/requirements.txt`
- `services/orchestrator/requirements.txt`
- `services/database-service/`
- `services/database-service/README.md`
- `services/database-service/Dockerfile`
- `services/database-service/docker-compose.yml`
- `services/database-service/manage.py`
- `services/database-service/.env.example`
- `services/database-service/database_service/settings.py`
- `docs/runbooks/local-dev.md`
- repo-wide Python dependency file search output

## 4. Dependency Files Found

Repo-wide Python dependency file search found:

- `I:\WareHub\services\requirements.txt`
- `I:\WareHub\services\orchestrator\requirements.txt`

Classification:

- `services/requirements.txt`
  - shared `services` area dependency source
  - content is Django/DRF/Postgres/MySQL/openpyxl/Pillow/pytest oriented
  - this matches `database-service`, not `orchestrator`
- `services/orchestrator/requirements.txt`
  - orchestrator-specific dependency source
  - content is FastAPI/uvicorn/httpx/pydantic/pytest
- `services/database-service/requirements.txt`
  - `Not found`
- `pyproject.toml`, `poetry.lock`, `Pipfile`, `uv.lock`, `setup.py`, `setup.cfg`
  - `Not found` in the repo-wide search result

## 5. Database-Service Dockerfile Findings

Observed file:

- `services/database-service/Dockerfile`

Confirmed contents:

- `COPY requirements.txt /app/requirements.txt`
- `RUN pip install --no-cache-dir -r /app/requirements.txt`
- `COPY services/database_service /app`

Findings:

- the Dockerfile expects a dependency file named `requirements.txt` at the Docker build context root
- the imported Dockerfile also expects the application source to exist at `services/database_service`
- neither expectation matches the current monorepo path layout:
  - dependency file is currently `services/requirements.txt`
  - application path is currently `services/database-service`
- because of that mismatch, the imported Dockerfile is not monorepo-safe in its current form
- this creates a real future risk that Docker build for `database-service` is broken until a dedicated fix slice updates the paths

## 6. Database-Service Local Bootstrap Contract

Confirmed contract today:

- env template path:
  - `services/database-service/.env.example`
- local untracked env path:
  - `services/database-service/.env`
- Django entrypoint file:
  - `services/database-service/manage.py`
- confirmed dependency manifest for the service area:
  - `services/requirements.txt`

Important limitation:

- there is no confirmed service-local dependency manifest at `services/database-service/requirements.txt`
- there is no safe evidence in this slice to declare a final install command for `database-service`
- the imported Docker Compose file cannot be treated as the current host-local source of truth because it still uses legacy path assumptions and auto-runs migrations

Practical interpretation:

- dependency ownership for `database-service` is currently documented as rooted in `services/requirements.txt`
- host-local install/start commands for `database-service` remain `Needs follow-up`
- a future fix slice is required before documenting a fully confirmed host-local bootstrap command sequence

## 7. Documentation Changes

Updated:

- `docs/runbooks/local-dev.md`

What changed:

- clarified that `services/database-service/requirements.txt` is missing
- clarified that `services/requirements.txt` is the only confirmed Django dependency manifest in the `services` area
- removed the implication that a ready-to-use existing local startup workflow is already confirmed
- documented that `database-service` host-local startup commands remain intentionally undocumented until a follow-up slice confirms the bootstrap path

Created:

- `docs/runbooks/slice-3h-database-service-bootstrap-report.md`

## 8. Blockers

- `services/database-service/requirements.txt` is missing
- `services/database-service/Dockerfile` expects legacy paths
- `services/database-service/docker-compose.yml` uses legacy snake_case path references
- `services/database-service/docker-compose.yml` auto-runs migrations in container startup, which is outside the allowed local-safe contract

## 9. Warnings

- `services/README.md` is imported legacy documentation and still references old repository/workflow assumptions
- `services/database-service/README.md` still says `cd database_service` and `docker compose up --build`, which does not match the current monorepo-safe local workflow
- `services/database-service/docker-compose.yml` contains placeholder-looking values mixed with non-local host defaults and should not be treated as safe local truth
- no service-local Python packaging manifest other than `services/requirements.txt` was found, so dependency ownership should be treated as confirmed but still awkwardly placed

## 10. Proposed Next Fix Slice

Recommended next slice:

- a narrow fix slice for `database-service` bootstrap normalization

Suggested scope:

- decide whether `database-service` should own its own `requirements.txt` or continue using `services/requirements.txt`
- align `services/database-service/Dockerfile` with actual monorepo paths
- align `services/database-service/docker-compose.yml` only if that compose file is still intended to be used
- remove implicit migration execution from any documented startup path
- update legacy READMEs after the contract is explicitly confirmed

## 11. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- `Get-ChildItem services -Force`
- `Get-Content services/README.md`
- `Get-Content services/requirements.txt`
- `Get-ChildItem services/database-service -Force`
- `Get-Content services/database-service/Dockerfile`
- `Get-Content services/database-service/docker-compose.yml`
- `Get-Content services/database-service/manage.py`
- `Get-Content services/database-service/README.md`
- existence check for `services/database-service/pyproject.toml`
- existence check for `services/database-service/requirements.txt`
- recursive search for `*requirements*` under `services/database-service`
- `Get-Content docs/runbooks/local-dev.md`
- repo-wide dependency file search
- `rg` search for dependency/bootstrap path references
- `python --version`
- `py --version`
