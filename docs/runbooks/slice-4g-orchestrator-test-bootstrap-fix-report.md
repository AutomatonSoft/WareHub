# Slice 4G - Orchestrator Test Bootstrap Fix Report

## 1. Summary

Slice 4G fixed the orchestrator test bootstrap blocker by making `src/sofort_orchestrator/main.py` import-safe.

Before the fix, importing `src.sofort_orchestrator.main` during pytest collection eagerly created SQLite-backed runtime stores. That caused collection-time failure when the default runtime SQLite path could not be opened.

After the fix:
- runtime SQLite-backed dependencies are configured lazily;
- normal import of `main.py` no longer opens runtime SQLite files;
- selected `py_compile` checks pass;
- `uv run pytest -q` passes: `63 passed, 1 warning`.

## 2. Git State

- CWD: `I:\WareHub`
- Branch: `feature/slice-4g-orchestrator-test-bootstrap-fix`
- Preflight state before edits:
  - path matched expected repo root
  - branch matched expected slice branch
  - working tree was clean
  - `HEAD` contained Slice 4F merge `57b2b76` or newer
- Final `git status --short`:
  - `M services/orchestrator/src/sofort_orchestrator/main.py`
  - `?? docs/runbooks/slice-4g-orchestrator-test-bootstrap-fix-report.md`

## 3. Root Cause

The blocker was caused by eager module-level initialization in `services/orchestrator/src/sofort_orchestrator/main.py`.

At import time, the module created:
- `SqliteIdempotencyStore`
- `SqliteJobStore`
- `SqliteProductEditorStore`
- `OrchestratorService`
- `ProductEditorService`

`SqliteIdempotencyStore` was instantiated with the default runtime path from orchestrator settings:
- `./data/orchestrator_idempotency.sqlite3`

During pytest collection, tests imported `src.sofort_orchestrator.main` only to access the FastAPI app object. That import immediately tried to open the runtime SQLite database before tests could inject their own temporary stores, producing:
- `sqlite3.OperationalError: unable to open database file`

## 4. Files Changed

- `services/orchestrator/src/sofort_orchestrator/main.py`
- `docs/runbooks/slice-4g-orchestrator-test-bootstrap-fix-report.md`

No other files were changed.

## 5. Implementation

`main.py` was changed in a narrow way:

1. Removed eager module-level runtime dependency creation.
2. Added lazy factory helpers for:
   - HTTP client
   - orchestrator service
   - idempotency store
   - job store
   - metrics
   - product editor service
3. Added `configure_runtime_dependencies()` that only fills `Deps.*` and `ProductEditorDeps.service` when they are still `None`.
4. Called `configure_runtime_dependencies()` from:
   - FastAPI lifespan startup
   - request logging middleware
5. Added `_ensure_sqlite_parent_dir()` so default runtime SQLite parent directories are created only at runtime dependency construction time, not on module import.
6. Replaced direct `_metrics` module-global usage in middleware with `Deps.metrics`.

This preserved the existing dependency override pattern used by tests:
- tests can still assign `Deps.service`
- tests can still assign `Deps.idempotency_store`
- tests can still assign `Deps.job_store`
- tests can still assign `ProductEditorDeps.service`

## 6. Runtime Behavior Preservation

Runtime behavior was preserved intentionally:

- the FastAPI app object is still created at module import;
- routes are still registered at module import;
- runtime dependencies are still available before real request handling and startup worker scheduling;
- lifespan startup now ensures dependencies exist before worker/scheduler use;
- test overrides are preserved because lazy configuration does not overwrite already-injected dependencies.

The fix changed bootstrap timing, not the public API contract.

## 7. py_compile Result

Executed from `services/orchestrator`:

- `uv run python -m py_compile src/sofort_orchestrator/main.py` -> passed
- `uv run python -m py_compile src/sofort_orchestrator/application/orchestrator_service.py` -> passed
- `uv run python -m py_compile src/sofort_orchestrator/infra/job_store.py` -> passed
- `uv run python -m py_compile src/sofort_orchestrator/infra/http_client.py` -> passed

## 8. pytest Result

Executed from `services/orchestrator`:

- `uv run pytest -q` -> passed

Result:
- `63 passed, 1 warning in 7.83s`

Observed warning:
- `StarletteDeprecationWarning` from `fastapi.testclient` / `starlette.testclient` `httpx` usage

The original SQLite collection blocker is resolved.

## 9. Generated Files / Git Ignore Check

- `git status --ignored --short services/orchestrator/.venv`:
  - `!! services/orchestrator/.venv/`

This confirms the local orchestrator virtual environment is ignored correctly.

Additional local generated noise exists outside the changed scope, including:
- `services/orchestrator/.pytest_cache`
- `services/orchestrator/src/.../__pycache__`
- `services/orchestrator/tests/__pycache__`

These are local generated artifacts, not tracked code changes from this slice.

## 10. Env / Artifact Scan Results

Env scan result:
- only `.env.example` / `.env.*.example` files were found

Forbidden dirs scan result:
- scan was not empty
- findings are consistent with pre-existing local ignored/generated noise, including:
  - `apps/frontend/node_modules`
  - `apps/frontend/.next`
  - `apps/mobile/.dart_tool`
  - `services/database-service/.venv`
  - `services/orchestrator/.venv`
  - `services/orchestrator/.pytest_cache`
  - multiple `__pycache__` directories

Nested workflow scan result:
- root `.github` exists as expected
- additional nested `.github` matches were found only under `apps/frontend/node_modules`
- these are dependency-noise paths, not repo metadata drift

## 11. CI Readiness Recommendation

The orchestrator is now ready for a CI onboarding slice.

Recommended Slice 4H:
- add an `orchestrator` CI job with:
  - `uv venv`
  - `uv pip install -r requirements.txt`
  - selected `py_compile` checks
  - `uv run pytest -q`

This should be added as a narrow CI-only expansion slice, without mixing deploy or migration changes.

## 12. Blockers

- No blockers remain for the Slice 4G goal.

The original import-time SQLite collection blocker is closed.

## 13. Warnings

- `git diff --stat` showed a line-ending warning for `main.py` (`LF -> CRLF` on future Git touch); this is not a runtime issue.
- `uv run pytest -q` emitted one dependency-level deprecation warning from Starlette/FastAPI test client usage; it did not block tests.
- env/artifact/nested workflow scans include local dependency/cache noise outside this slice's scope.

## 14. Commands Run

Preflight:

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`

Discovery:

- `Get-Content services/orchestrator/src/sofort_orchestrator/main.py`
- `Get-Content services/orchestrator/src/sofort_orchestrator/api/routes.py`
- `Get-Content services/orchestrator/src/sofort_orchestrator/api/product_editor_routes.py`

Validation:

- `uv run python -m py_compile src/sofort_orchestrator/main.py`
- `uv run python -m py_compile src/sofort_orchestrator/application/orchestrator_service.py`
- `uv run python -m py_compile src/sofort_orchestrator/infra/job_store.py`
- `uv run python -m py_compile src/sofort_orchestrator/infra/http_client.py`
- `uv run pytest -q`

Repo checks:

- `git status --short`
- `git diff --stat`
- `git status --ignored --short services/orchestrator/.venv`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.FullName -match '\\\.gitea$|\\\.github$' } | Select-Object FullName`

## 15. Proposed Slice 4H

Proposed next slice:
- `Slice 4H - add orchestrator CI job`

Target scope:
- CI workflow only
- no runtime code changes
- no deploy/stage/prod changes
- no migrations

Planned checks:
- `uv venv`
- `uv pip install -r requirements.txt`
- selected `py_compile`
- `uv run pytest -q`
