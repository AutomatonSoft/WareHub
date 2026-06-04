# Slice 3K — Database-Service Requirements Audit + uv Policy Report

## 1. Summary

Slice 3K performed a static audit of `services/database-service/requirements.txt` and documented a target `uv` bootstrap policy for future host-local setup.

This slice did not change:

- `services/database-service/requirements.txt`
- `services/requirements.txt`
- `services/database-service/Dockerfile`
- `services/database-service/docker-compose.yml`
- runtime Python code

Key result:

- the current service-local manifest is still a baseline copy
- several dependencies are clearly required from static imports
- several entries remain plausible but need runtime verification before removal
- `uv` is not currently available on this host
- documentation now treats `uv` as the preferred future local bootstrap tool, without claiming that `uv` install was validated

## 2. Git State

- `Get-Location`
  - `I:\WareHub`
- `git branch --show-current`
  - `feature/slice-3k-database-service-requirements-audit`
- `git status --short` before changes
  - clean
- `git log --oneline -5`
  - `2f97401 Merge pull request #11 from RavilkaDev0/feature/slice-3j-database-service-dependency-ownership`
  - `25f24f6 chore: split database service dependency ownership`
  - `406678e Merge pull request #10 from RavilkaDev0/feature/slice-3i-database-service-bootstrap-contract`
  - `9070190 chore: normalize database service bootstrap contract`
  - `24b7961 Merge pull request #9 from RavilkaDev0/feature/slice-3h-database-service-bootstrap`

## 3. uv Availability

Command:

- `uv --version`

Result:

- `uv` is not installed on this host
- no installation was attempted

Policy impact:

- `uv` remains the target bootstrap tool
- actual `uv` bootstrap validation is deferred to Slice 3L

## 4. Files Inspected

- `services/database-service/requirements.txt`
- `services/requirements.txt`
- `services/database-service/README.md`
- `docs/runbooks/local-dev.md`
- `services/database-service/**/*.py`
- `services/database-service/docker-compose.yml`

Static audit scope:

- scanned `129` Python files
- excluded generated migration internals and `__pycache__`

## 5. Current Dependency Manifest

Current `services/database-service/requirements.txt` entries:

- `Django`
- `djangorestframework`
- `psycopg[binary]`
- `django-cors-headers`
- `PyYAML`
- `inflection`
- `uritemplate`
- `requests`
- `python-dotenv`
- `openpyxl`
- `mysql-connector-python`
- `Pillow`
- `pytest`
- `pytest-django`

Current state:

- manifest matches `services/requirements.txt`
- it is still a baseline split, not a minimized service-only manifest

## 6. Static Import Audit

Clear direct external imports found:

- `django`
- `rest_framework`
- `requests`
- `dotenv`
- `corsheaders`
- `mysql.connector`
- `PIL`

Observed usage patterns:

- `django` is used across app configs, models, URLs, views, tests and management commands
- `rest_framework` is used in serializers, API views, schema docs and tests
- `requests` is used in `catalog_core`, `kaufland`, `hood_service` and `orders_pars`
- `dotenv` is used in `database_service/settings.py` and `orders_pars/service.py`
- `corsheaders` is configured in `database_service/settings.py`
- `mysql.connector` is used in JV/XL source connectors and read/write helpers
- `PIL` is used in `database/ftp_upload.py`

No clear direct imports were found for:

- `yaml`
- `inflection`
- `uritemplate`
- `openpyxl`

Testing-related observations:

- many test modules exist
- `unittest` and `rest_framework.test` are used directly
- `pytest` and `pytest-django` were not directly imported in the scanned source files, which is normal for test runners and plugins

## 7. Keep Candidates

Keep candidates from static evidence:

- `Django`
  - required
- `djangorestframework`
  - required
- `django-cors-headers`
  - required
- `requests`
  - required
- `python-dotenv`
  - required
- `mysql-connector-python`
  - required
- `Pillow`
  - required
- `pytest`
  - likely required
- `pytest-django`
  - likely required

Conditional keep candidates:

- `psycopg[binary]`
  - likely required for PostgreSQL runtime, but needs runtime verification because static import evidence is indirect through Django DB backend configuration

## 8. Possible Unused Dependencies

Candidates with no direct static import evidence in this slice:

- `PyYAML`
- `inflection`
- `uritemplate`
- `openpyxl`

Interpretation:

- these are not safe removal candidates yet
- they may still be used indirectly by runtime code paths, optional features, tests, serializers, DRF schema tooling or data import/export flows

## 9. Needs Runtime Verification

Dependencies that should not be removed without a follow-up validation slice:

- `psycopg[binary]`
  - DB backend/runtime verification needed
- `PyYAML`
  - verify optional config/report flows
- `inflection`
  - verify serializer/schema/admin or helper usage
- `uritemplate`
  - verify DRF/OpenAPI/schema generation path
- `openpyxl`
  - verify spreadsheet import/export flows
- `pytest`
  - verify actual test runner policy
- `pytest-django`
  - verify actual Django test runner policy

## 10. uv Bootstrap Policy

Target policy:

- future host-local bootstrap for `services/database-service` should prefer `uv`
- target documentation-only bootstrap sequence:

```powershell
Set-Location I:\WareHub\services\database-service
uv venv
uv pip install -r requirements.txt
```

Constraints:

- this slice did not run `uv venv`
- this slice did not run `uv pip install`
- this slice did not validate runtime startup after `uv` install

Dockerfile note for future slices:

- in this slice the Dockerfile was intentionally not changed
- future decision remains open:
  - keep `pip install` inside Docker build
  - or move Docker build to `uv` in a later dedicated slice

## 11. Documentation Changes

Updated:

- `services/database-service/README.md`
- `docs/runbooks/local-dev.md`

What changed:

- documented `uv` as the preferred future local installer
- documented a future bootstrap command sequence as documentation only
- explicitly stated that `uv` validation was not executed in Slice 3K
- kept manual migration policy unchanged
- kept `.env` policy unchanged

## 12. Validation Results

Commands run:

- `git status --short`
- `git log --oneline -5`
- `uv --version`
- `python --version`
- `py --version`
- `Get-Content` for requirements/docs files
- static AST import scan for `services/database-service/**/*.py`
- `rg` import checks for disputed packages
- `docker compose -f services/database-service/docker-compose.yml config`

Results:

- preflight passed
- `uv` unavailable on host
- compose config succeeded
- static import scan covered `129` Python files
- env and artifact policy remained intact

## 13. Blockers

- `uv` is not installed on this host, so the target bootstrap policy could not be executed or validated

## 14. Warnings

- static import absence is not proof that a dependency is unused
- several packages may be required only in optional runtime paths, schema generation, tests or import/export tooling
- `services/database-service/requirements.txt` should not be minimized without a dedicated runtime validation slice

## 15. Proposed Slice 3L

Recommended next slice:

- install or otherwise provide `uv` in the developer environment if approved
- validate `uv venv` and `uv pip install -r requirements.txt`
- run narrow non-deploy, non-migration validation for database-service bootstrap only
- only after that, consider evidence-based dependency cleanup
