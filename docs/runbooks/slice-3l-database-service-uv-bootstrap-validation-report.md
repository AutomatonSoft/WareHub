# Slice 3L — Database-Service uv Bootstrap Validation Report

## 1. Summary

Slice 3L validated the `uv` bootstrap path for `services/database-service` without changing runtime code, dependency manifests, Dockerfiles or compose files.

Result:

- `uv` is available on this host
- an isolated local virtual environment was created at `services/database-service/.venv`
- dependencies from `services/database-service/requirements.txt` were installed successfully with `uv`
- minimal compile/import checks passed
- compose config remained valid
- generated `.venv` is correctly ignored by git

## 2. Git State

- `Get-Location`
  - `I:\WareHub`
- `git branch --show-current`
  - `feature/slice-3l-database-service-uv-bootstrap-validation`
- `git status --short` before validation
  - clean
- `git log --oneline -5`
  - `a224fe3 Merge pull request #12 from RavilkaDev0/feature/slice-3k-database-service-requirements-audit`
  - `2f3a6c8 docs: audit database service requirements and uv policy`
  - `2f97401 Merge pull request #11 from RavilkaDev0/feature/slice-3j-database-service-dependency-ownership`
  - `13b3fa3 chore: add database service dependency ownership`
  - `406678e Merge pull request #10 from RavilkaDev0/feature/slice-3i-database-service-bootstrap-contract`

## 3. uv Availability

Commands:

- `uv --version`
- `python --version`
- `py --version`

Results:

- `uv 0.11.19 (7b2cff1c3 2026-06-03 x86_64-pc-windows-msvc)`
- `Python 3.14.3`
- `Python 3.14.3`

## 4. Requirements File

Checks:

- `Test-Path services/database-service/requirements.txt`
- `Get-Content services/database-service/requirements.txt`

Result:

- file exists
- file was read only
- no changes were made to the manifest

## 5. uv venv Result

Command:

- `uv venv`

Working directory:

- `I:\WareHub\services\database-service`

Result:

- succeeded
- local environment created at `services/database-service/.venv`
- `uv run python --version` returned `Python 3.14.3`

## 6. uv pip install Result

Command:

- `uv pip install -r requirements.txt`

Result:

- succeeded
- resolved `28` packages
- installed `28` packages

Notable warnings from installer:

- repeated warning about fixing an invalid version specifier `>=3.6,` in a transitive dependency metadata chain
- hardlink fallback warning:
  - `Failed to hardlink files; falling back to full copy`
  - operational only, not a blocker

Installed package list confirmed by:

- `uv pip list`

## 7. Compile / Import Checks

Commands:

- `uv run python -m py_compile database_service/settings.py`
- `uv run python -m py_compile orders_pars/service.py`
- `uv run python -c "import django; import rest_framework; import requests; import dotenv; import corsheaders; import PIL"`
- `uv run python -c "import mysql.connector"`

Results:

- all commands succeeded
- no server startup was performed
- no migrations were run

## 8. Compose Config Validation

Command:

- `docker compose -f services/database-service/docker-compose.yml config`

Result:

- succeeded
- build context resolves to `I:\WareHub\services`
- Dockerfile resolves to `database-service/Dockerfile`
- no compose changes were required for this validation slice

## 9. Generated Files / Git Ignore Check

Observed generated local artifacts:

- `services/database-service/.venv`
- temporary `__pycache__` directories created by compile/import checks

Cleanup:

- generated `__pycache__` directories were removed after validation

Git ignore verification:

- `git status --ignored --short services/database-service/.venv`
  - `!! services/database-service/.venv/`

Interpretation:

- `.venv` is ignored by git as required
- `.venv` did not appear as tracked or untracked in normal `git status --short`

## 10. Blockers

- none for this validation slice

## 11. Warnings

- `uv pip install` emitted warnings about invalid transitive version specifiers and hardlink fallback
- these warnings did not block environment creation or imports
- `.venv` remains as a local generated directory by design; it is ignored, not committed

## 12. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- `uv --version`
- `python --version`
- `py --version`
- `Test-Path services/database-service/requirements.txt`
- `Get-Content services/database-service/requirements.txt`
- `uv venv`
- `uv run python --version`
- `uv pip install -r requirements.txt`
- `uv pip list`
- `uv run python -m py_compile database_service/settings.py`
- `uv run python -m py_compile orders_pars/service.py`
- `uv run python -c "import django; import rest_framework; import requests; import dotenv; import corsheaders; import PIL"`
- `uv run python -c "import mysql.connector"`
- `docker compose -f services/database-service/docker-compose.yml config`
- env scan
- forbidden dirs scan
- `git status --ignored --short services/database-service/.venv`

## 13. Next Step

Recommended next slice:

- a narrow follow-up slice for evidence-based dependency cleanup in `services/database-service/requirements.txt`, using this working `uv` bootstrap as the validation baseline
