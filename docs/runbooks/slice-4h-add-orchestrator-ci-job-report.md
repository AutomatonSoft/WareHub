# Slice 4H - Add Orchestrator CI Job Report

## 1. Summary

Slice 4H adds a new `orchestrator` job to the existing GitHub Actions CI workflow.

The job uses only checks already validated in Slice 4F and Slice 4G:

- `uv venv --python 3.13`
- `uv pip install -r requirements.txt`
- selected `py_compile`
- `uv run pytest -q`

This is a CI-only slice:

- no runtime code changes
- no requirements changes
- no deploy logic
- no migrations
- no Docker build or compose up/down behavior

## 2. Files Changed

- `.github/workflows/ci.yml`
- `docs/runbooks/slice-4h-add-orchestrator-ci-job-report.md`

## 3. Orchestrator Job Added

New job added to `.github/workflows/ci.yml`:

- `orchestrator`

Job shape:

- `name: orchestrator`
- `runs-on: ubuntu-latest`
- `timeout-minutes: 10`
- `defaults.run.working-directory: services/orchestrator`

Tooling setup:

- `actions/checkout@v4`
- `actions/setup-python@v5`
  - `python-version: "3.13"`
- `astral-sh/setup-uv@v5`

## 4. Checks Included

The `orchestrator` job includes exactly these commands:

- `uv --version`
- `uv venv --python 3.13`
- `uv pip install -r requirements.txt`
- `uv pip list`
- `uv run python -m py_compile src/sofort_orchestrator/main.py`
- `uv run python -m py_compile src/sofort_orchestrator/application/orchestrator_service.py`
- `uv run python -m py_compile src/sofort_orchestrator/infra/job_store.py`
- `uv run python -m py_compile src/sofort_orchestrator/infra/http_client.py`
- `uv run pytest -q`

These checks are evidence-based and match the validated orchestrator bootstrap/test path from prior slices.

## 5. Checks Deferred

Still deferred from this slice:

- app server startup
- `uvicorn`
- workers / celery-like processes
- `docker build`
- `docker compose up`
- `docker compose down`
- deploy scripts
- migrations
- external DB / RabbitMQ / MinIO usage
- secrets usage
- service containers

Also unchanged from earlier CI policy:

- no mobile job changes
- no new Rust checks
- no new frontend checks beyond the existing validated job

## 6. Workflow Safety

The workflow safety contract remains unchanged:

- `pull_request` on `stage` and `main`
- `workflow_dispatch`
- `permissions: contents: read`
- existing `concurrency` preserved

Existing jobs remain unchanged:

- `repo-safety`
- `compose-config`
- `database-service`
- `rust-backend-metadata`
- `frontend`

Only one new job was appended:

- `orchestrator`

The new job does not use:

- secrets
- GitHub environments
- service containers
- external infrastructure
- deploy or migration commands

## 7. Local Static Validation

Executed after the edit:

- `git status --short`
- `git diff --stat`
- `Get-Content .github/workflows/ci.yml`
- `docker compose -f infra/local/docker-compose.dev.yml config`
- `docker compose -f services/database-service/docker-compose.yml config`
- `cargo metadata --no-deps`
- env scan
- forbidden dirs scan
- `git status --ignored --short apps/frontend/node_modules`
- `git status --ignored --short services/database-service/.venv`
- `git status --ignored --short services/orchestrator/.venv`

Static review confirmed that workflow jobs now include:

- `repo-safety`
- `compose-config`
- `database-service`
- `rust-backend-metadata`
- `frontend`
- `orchestrator`

Static review also confirmed that the new `orchestrator` job does not contain:

- `uvicorn`
- `celery`
- `docker build`
- `docker compose up/down`
- deploy
- migrations
- secrets
- external services

## 8. Branch Protection Recommendation

After the first green GitHub Actions PR run, there are two safe options:

- make `orchestrator` a required check
- or keep it non-required for one more observation cycle

Conservative recommendation:

- wait for the first green PR run, then decide whether to make `orchestrator` required immediately or after one additional observation cycle

## 9. Risks

- the new job depends on GitHub runner behavior for Python `3.13` and `uv`, which can still differ slightly from local Windows validation
- orchestrator CI now includes `pytest`, so future test drift in orchestrator will surface directly in PRs
- the workflow still does not validate orchestrator runtime startup against real external services, by design

## 10. Blockers

- no hard blockers for Slice 4H

## 11. Warnings

- local artifact scans may still show ignored/generated noise such as:
  - `apps/frontend/node_modules`
  - `services/database-service/.venv`
  - `services/orchestrator/.venv`
  - `.next`
  - `.pytest_cache`
  - `__pycache__`
- this is local ignored/generated state, not tracked workflow drift
- `git diff --stat` may show a line-ending warning for `.github/workflows/ci.yml`; that is not a workflow logic issue

## 12. Next Step

Recommended next step:

- open PR / observe first real GitHub Actions run with the new `orchestrator` job
- if green, decide whether to mark `orchestrator` as required
- after that, the next CI expansion should remain narrow and evidence-based
