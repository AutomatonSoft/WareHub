# Slice 4F - Orchestrator CI Bootstrap Validation Report

## 1. Summary

Slice 4F validated CI bootstrap readiness for `services/orchestrator`.

Result:

- `uv` bootstrap works;
- dependency install works;
- selected `py_compile` checks pass;
- `pytest` is safe to run from a dependency/external-service perspective, but currently fails during test collection;
- orchestrator is not ready for CI inclusion with `pytest` yet;
- a narrower fix slice is needed before adding an orchestrator CI job.

## 2. Git State

- Working directory: `I:\WareHub`
- Branch: `feature/slice-4f-orchestrator-ci-bootstrap-validation`
- Preflight working tree: clean
- Recent `HEAD` includes Slice 4E merge:
  - `849b808 Merge pull request #21 from RavilkaDev0/feature/slice-4e-add-frontend-ci-job`

## 3. Tooling Versions

- `python --version` -> `Python 3.14.3`
- `py --version` -> `Python 3.14.3`
- `uv --version` -> `uv 0.11.19 (7b2cff1c3 2026-06-03 x86_64-pc-windows-msvc)`

## 4. Orchestrator Structure

Inspected:

- `services/orchestrator/requirements.txt`
- `services/orchestrator/README.md`
- `services/orchestrator/Dockerfile`
- `services/orchestrator/.env.example`
- `services/orchestrator/src`
- `services/orchestrator/tests`

Findings:

- dependency bootstrap target is compatible with `uv`
- requirements manifest contains:
  - `fastapi`
  - `uvicorn[standard]`
  - `httpx`
  - `pydantic`
  - `pytest`
- test framework present:
  - `pytest`
  - `fastapi.testclient.TestClient`
- tests use:
  - fake adapters
  - temporary SQLite paths via `tmp_path`
  - local in-process `TestClient`
- tests do not appear to require:
  - running backend
  - RabbitMQ
  - MinIO
  - real external HTTP
  - deploy secrets

Important nuance:

- importing `src.sofort_orchestrator.main` initializes SQLite-backed stores eagerly
- that startup path is what currently breaks test collection

Safe CI command candidate list after this slice:

- `uv venv`
- `uv pip install -r requirements.txt`
- `uv run python -m py_compile ...`
- `uv run pytest` only after the collection-time SQLite path issue is fixed

## 5. Requirements Bootstrap Result

Commands executed:

- `uv venv`
- `uv pip install -r requirements.txt`
- `uv pip list`
- `uv run python --version`

Results:

- `uv venv` succeeded
- initial parallel `uv pip install` attempt raced before the venv was visible and failed with:
  - `error: No virtual environment found`
- re-run sequential `uv pip install -r requirements.txt` succeeded
- installed packages confirmed by `uv pip list`
- `uv run python --version` -> `Python 3.14.3`

Installed package summary included:

- `fastapi`
- `uvicorn`
- `httpx`
- `pydantic`
- `pytest`
- related transitive packages

Bootstrap conclusion:

- orchestrator dependency bootstrap is CI-feasible

## 6. py_compile Result

Commands executed:

- `uv run python -m py_compile src/sofort_orchestrator/main.py`
- `uv run python -m py_compile src/sofort_orchestrator/application/orchestrator_service.py`
- `uv run python -m py_compile src/sofort_orchestrator/infra/job_store.py`
- `uv run python -m py_compile src/sofort_orchestrator/infra/http_client.py`

Result:

- all selected `py_compile` checks passed

Conclusion:

- the inspected orchestrator modules are syntactically valid under the validated local environment

## 7. pytest Safety Decision

Decision:

- `pytest` was safe enough to execute

Reason:

- tests looked unit/local
- they primarily use fakes, temporary SQLite files, and `TestClient`
- no clear requirement for real running services or secrets was found before execution

## 8. pytest Result

Command executed:

- `uv run pytest`

Result:

- failed during collection

Observed failure:

- `2 errors during collection`
- failing test files:
  - `tests/test_orchestrator_api.py`
  - `tests/test_product_editor_api.py`
- root exception:
  - `sqlite3.OperationalError: unable to open database file`

Failure path:

- importing `src.sofort_orchestrator.main`
- eager initialization of:
  - `SqliteIdempotencyStore`
- schema bootstrap calls `sqlite3.connect(self.db_path)`
- default SQLite path cannot be opened at collection time

Interpretation:

- tests are not fully deterministic in clean CI yet
- current blocker is not dependency bootstrap, but import-time application initialization behavior

## 9. Generated Files / Git Ignore Check

Post-validation checks:

- `git status --ignored --short services/orchestrator/.venv` -> `!! services/orchestrator/.venv/`

Interpretation:

- orchestrator `.venv` is correctly ignored
- no `.gitignore` blocker for orchestrator bootstrap was found

Other local generated noise present:

- `apps/frontend/node_modules`
- `apps/frontend/.next`
- `services/database-service/.venv`
- `services/orchestrator/.pytest_cache`
- orchestrator/package Python `__pycache__`

These are local generated directories, not tracked artifacts.

## 10. Env / Artifact Scan Results

Env scan:

- only `.env.example` / `.env.*.example` files found

Forbidden dirs scan:

- local generated noise found in:
  - `apps/frontend`
  - `services/database-service`
  - `services/orchestrator`
  - `apps/mobile/.dart_tool`
- no tracked artifact issue was introduced by this slice

Nested workflow scan:

- root `.github` exists as expected
- additional nested `.github` directories appeared inside `apps/frontend/node_modules`
- classify them as local dependency-install noise, not repository metadata drift

## 11. CI Readiness Recommendation

Recommendation:

- do not add orchestrator CI job yet

What is ready:

- `uv` bootstrap
- dependency install
- selected `py_compile`

What is not ready:

- `pytest` currently fails during collection because importing `main.py` initializes SQLite storage at startup

Required next action:

- narrow fix slice to make orchestrator tests collection-safe in clean CI

## 12. Blockers

- `pytest` collection failure:
  - `sqlite3.OperationalError: unable to open database file`
- root cause area:
  - eager SQLite store initialization in `src/sofort_orchestrator/main.py`

This is a real blocker for adding orchestrator tests to CI.

## 13. Warnings

- first `uv pip install` attempt failed due a local sequencing race after parallel tool execution; sequential retry succeeded
- forbidden-dir and nested-workflow scans are noisy because prior local generated directories already exist
- pytest also emitted FastAPI deprecation warnings related to `asyncio.iscoroutinefunction`, but those are not the primary blocker

## 14. Commands Run

Preflight:

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`

Tooling and discovery:

- `python --version`
- `py --version`
- `uv --version`
- `Get-Content services/orchestrator/requirements.txt`
- `Get-Content services/orchestrator/README.md`
- `Get-Content services/orchestrator/Dockerfile`
- `Get-Content services/orchestrator/.env.example`
- `Get-ChildItem -Recurse -File services/orchestrator/src`
- `Get-ChildItem -Recurse -File services/orchestrator/tests`
- targeted `rg` over `src` and `tests`
- `Get-Content services/orchestrator/tests/conftest.py`
- `Get-Content services/orchestrator/tests/test_database_service_contracts.py`
- `Get-Content services/orchestrator/tests/test_orchestrator_api.py -TotalCount 260`
- `Get-Content services/orchestrator/tests/test_product_editor_api.py -TotalCount 260`

Bootstrap and validation:

- `uv venv`
- `uv pip install -r requirements.txt`
- `uv pip list`
- `uv run python --version`
- `uv run python -m py_compile src/sofort_orchestrator/main.py`
- `uv run python -m py_compile src/sofort_orchestrator/application/orchestrator_service.py`
- `uv run python -m py_compile src/sofort_orchestrator/infra/job_store.py`
- `uv run python -m py_compile src/sofort_orchestrator/infra/http_client.py`
- `uv run pytest`

Final checks:

- `git status --short`
- `git status --ignored --short services/orchestrator/.venv`
- env scan
- forbidden dirs scan
- nested workflow scan

## 15. Proposed Slice 4G

Recommended next slice:

- narrow orchestrator test-bootstrap fix slice

Target:

- remove or isolate import-time SQLite initialization from `main.py` so tests can collect and run in clean CI without precreated runtime directories

After that:

- rerun orchestrator bootstrap validation
- only then consider adding an orchestrator CI job
