# Slice 3M — Database-Service Requirements Cleanup Report

## 1. Summary

Slice 3M performed an evidence-based cleanup of `services/database-service/requirements.txt`.

Removed from the manifest:

- `PyYAML`
- `inflection`
- `openpyxl`

Kept:

- `uritemplate`
- all previously confirmed keep / likely keep dependencies

Important outcome:

- the manifest was reduced based on static evidence
- compile/import checks still passed
- compose config still passed
- the cleanup is now fresh-validated through the explicit `services/database-service/.venv` interpreter

## 2. Git State

- `Get-Location`
  - `I:\WareHub`
- `git branch --show-current`
  - `feature/slice-3m-database-service-requirements-cleanup`
- `git status --short` before changes
  - clean
- `git log --oneline -5`
  - `cb5c57d Merge pull request #13 from RavilkaDev0/feature/slice-3l-database-service-uv-bootstrap-validation`
  - `4f41845 docs: validate database service uv bootstrap`
  - `a224fe3 Merge pull request #12 from RavilkaDev0/feature/slice-3k-database-service-requirements-audit`
  - `2f3a6c8 docs: audit database service requirements and uv policy`
  - `2f97401 Merge pull request #11 from RavilkaDev0/feature/slice-3j-database-service-dependency-ownership`

## 3. Starting Requirements

Starting manifest:

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

## 4. Evidence Review

Repo-wide candidate search:

- `rg -n "yaml|PyYAML|inflection|uritemplate|openpyxl|load_workbook|Workbook|schema|OpenAPI" services/database-service`

Targeted direct-import searches:

- no direct Python import/use matches found for:
  - `yaml`
  - `inflection`
  - `openpyxl`
  - `uritemplate`

Additional interpretation:

- `uritemplate` was kept because the service exposes DRF/OpenAPI schema endpoints:
  - `rest_framework.schemas`
  - `JSONOpenAPIRenderer`
  - `AutoSchema`
- this leaves a plausible DRF transitive dependency path for `uritemplate`

Evidence level for removed dependencies:

- `PyYAML`
  - no direct import/use matches
  - no strong transitive requirement identified in the inspected slice
- `inflection`
  - no direct import/use matches
  - no strong transitive requirement identified in the inspected slice
- `openpyxl`
  - no direct import/use matches such as `openpyxl`, `load_workbook`, `Workbook`
  - no strong transitive requirement identified in the inspected slice

## 5. Dependencies Removed

Removed from `services/database-service/requirements.txt`:

- `PyYAML`
- `inflection`
- `openpyxl`

## 6. Dependencies Kept

Kept by policy:

- `Django`
- `djangorestframework`
- `psycopg[binary]`
- `django-cors-headers`
- `requests`
- `python-dotenv`
- `mysql-connector-python`
- `Pillow`
- `pytest`
- `pytest-django`

Kept due to insufficient removal evidence:

- `uritemplate`

Reason for keeping `uritemplate`:

- OpenAPI/schema endpoints are present
- DRF schema generation may rely on it transitively

## 7. uv Install Validation

Commands run:

- `uv --version`
- `uv venv`
- `uv pip install -r requirements.txt`
- `uv pip list`

Results:

- `uv` available: `0.11.19`
- `uv venv` failed to recreate the environment because `.venv` already existed
- exact error:
  - `A virtual environment already exists at: .venv`
  - hint from tool:
    - `Use the --clear flag or set UV_VENV_CLEAR=1 to replace the existing virtual environment`
- `uv pip install -r requirements.txt` succeeded against the existing environment
- `uv pip list` still showed removed packages:
  - `inflection`
  - `openpyxl`
  - `pyyaml`

Interpretation:

- install command did not prove that the removed packages are unnecessary at runtime
- the environment was not fresh enough to validate package removal conclusively

## 8. Compile / Import Checks

Commands:

- `uv run python -m py_compile database_service/settings.py`
- `uv run python -m py_compile orders_pars/service.py`
- `uv run python -c "import django; import rest_framework; import requests; import dotenv; import corsheaders; import PIL"`
- `uv run python -c "import mysql.connector"`

Results:

- all commands succeeded
- this confirms the kept dependency set still supports the minimal checked import scope
- this does **not** prove that removed packages are unnecessary in untested runtime paths, because the old `.venv` still contained them

## 9. Compose Config Validation

Command:

- `docker compose -f services/database-service/docker-compose.yml config`

Result:

- succeeded
- no Dockerfile or compose changes were required in this slice

## 10. Generated Files / Git Ignore Check

Observed local generated directory:

- `services/database-service/.venv`

Git ignore check:

- `git status --ignored --short services/database-service/.venv`
  - `!! services/database-service/.venv/`

Interpretation:

- `.venv` remains correctly ignored by git

Additional cleanup:

- temporary `__pycache__` directories generated by validation were removed

## 11. Remaining Risks

- the removed dependencies were not validated in a freshly recreated environment
- stale installed packages in `.venv` may mask real removal regressions
- `uritemplate` still requires future confirmation if the OpenAPI path is later tested more deeply

## 12. Blockers

- initial fresh-validation blocker around incomplete import verification is now closed
- explicit validation through `.\.venv\Scripts\python.exe` confirmed the installed environment directly

## 13. Warnings

- `uv pip install -r requirements.txt` on an existing environment does not uninstall packages removed from the manifest
- current success signals are partial and should not be overstated

## 14. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- `Get-Content services/database-service/requirements.txt`
- `rg -n "yaml|PyYAML|inflection|uritemplate|openpyxl|load_workbook|Workbook|schema|OpenAPI" services/database-service`
- targeted `rg` checks for direct imports of `yaml`, `inflection`, `uritemplate`, `openpyxl`
- `uv --version`
- `git status --ignored --short services/database-service/.venv`
- `uv venv`
- `uv pip install -r requirements.txt`
- `uv pip list`
- `uv run python -m py_compile database_service/settings.py`
- `uv run python -m py_compile orders_pars/service.py`
- `uv run python -c "import django; import rest_framework; import requests; import dotenv; import corsheaders; import PIL"`
- `uv run python -c "import mysql.connector"`
- `docker compose -f services/database-service/docker-compose.yml config`
- env scan
- forbidden dirs scan

## 15. Next Step

Recommended next slice:

- a narrow follow-up validation slice that explicitly recreates or clears `services/database-service/.venv` before reinstalling dependencies
- only after a fresh-environment validation should these removals be considered fully confirmed

## 16. Fresh Validation After Removing Stale .venv

Context:

- stale `services/database-service/.venv` was deleted manually before this follow-up
- `.venv` is an ignored generated directory, not a tracked repo file

uv venv result:

- `uv venv` succeeded
- new isolated environment was created again at `services/database-service/.venv`

uv pip install result:

- first parallel attempt raced with environment creation and failed with:
  - `No virtual environment found; run uv venv to create an environment`
- repeated sequential install succeeded
- `uv pip install -r requirements.txt` resolved and installed `24` packages
- hardlink fallback warning appeared again, but install completed

uv pip list result:

- installed package list contained `24` packages
- removed packages were absent from the installed list:
  - `PyYAML` absent
  - `inflection` absent
  - `openpyxl` absent

Compile / import checks:

- `uv run python -m py_compile database_service/settings.py`
  - succeeded
- `uv run python -m py_compile orders_pars/service.py`
  - succeeded
- `uv run python -c "import django; import rest_framework; import requests; import dotenv; import corsheaders; import PIL"`
  - failed with `ModuleNotFoundError: No module named 'django'`
- `uv run python -c "import mysql.connector"`
  - failed with `ModuleNotFoundError: No module named 'mysql'`

Interpretation:

- compile checks passed against the fresh environment workflow
- `uv run` did not reuse the freshly installed `.venv` as expected in this repo layout
- because of that, import validation remains incomplete even though `uv pip list` shows the expected installed packages

docker compose config result:

- `docker compose -f services/database-service/docker-compose.yml config`
  - succeeded

git status result:

- `git status --short`
  - `M services/database-service/requirements.txt`
  - `?? docs/runbooks/slice-3m-database-service-requirements-cleanup-report.md`
- `git status --ignored --short services/database-service/.venv`
  - `!! services/database-service/.venv/`

Blockers:

- `uv run` import validation still does not use the installed `.venv` as expected
- fresh cleanup validation is stronger than before because removed packages are absent from `uv pip list`, but still not fully closed due to the failing `uv run` imports

Warnings:

- the first install attempt failed only because of a command-order race during parallel execution
- the meaningful result is the later sequential `uv pip install -r requirements.txt`

## 17. Explicit .venv Python Validation

Manual validation recorded after fresh `.venv` recreation:

- `.\.venv\Scripts\python.exe --version`
  - `Python 3.14.3`
- `uv pip list --python .\.venv\Scripts\python.exe`
  - confirmed the fresh installed package set

Package presence confirmed:

- absent:
  - `PyYAML`
  - `inflection`
  - `openpyxl`
- present:
  - `django`
  - `django-cors-headers`
  - `djangorestframework`
  - `mysql-connector-python`
  - `pillow`
  - `pytest-django`
  - `requests`

Explicit imports confirmed through `.\.venv\Scripts\python.exe`:

- `django`
- `rest_framework`
- `requests`
- `dotenv`
- `corsheaders`
- `PIL`
- `mysql.connector`

Explicit compile checks confirmed through `.\.venv\Scripts\python.exe`:

- `.\.venv\Scripts\python.exe -m py_compile database_service\settings.py`
  - succeeded
- `.\.venv\Scripts\python.exe -m py_compile orders_pars\service.py`
  - succeeded

Conclusion:

- the previous blocker about incomplete import validation is closed
- cleanup is now fresh-validated through the explicit `.venv` interpreter rather than `uv run`
