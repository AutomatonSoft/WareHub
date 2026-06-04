# Slice 4B - First Conservative CI Safe Checks Report

## 1. Summary

Slice 4B adds the first real GitHub Actions workflow for WareHub:

- `.github/workflows/ci.yml`

The workflow is intentionally conservative:

- non-deploy only;
- no migrations;
- no Docker builds;
- no frontend checks;
- no mobile checks;
- no orchestrator install/tests;
- no full Rust validation beyond `cargo metadata --no-deps`.

It implements only already-confirmed safe checks from Slice 4A discovery.

## 2. Files Changed

- `.github/workflows/ci.yml`
- `docs/runbooks/slice-4b-first-ci-safe-checks-report.md`

## 3. Workflow Triggers

Workflow trigger policy:

- `pull_request` on:
  - `stage`
  - `main`
- `workflow_dispatch`

Not included on purpose:

- no `push` trigger yet;
- no scheduled runs;
- no deployment triggers.

## 4. Jobs Added

Jobs added:

1. `repo-safety`
2. `compose-config`
3. `database-service`
4. `rust-backend-metadata`

Shared workflow settings:

- `permissions: contents: read`
- `concurrency` enabled with cancel-in-progress
- per-job `timeout-minutes`

## 5. repo-safety Checks

`repo-safety` runs on `ubuntu-latest` and performs only repository hygiene checks:

- fail on real `.env` files
  - allow only `.env.example`
  - allow only `.env.*.example`
- fail on forbidden artifact directories:
  - `node_modules`
  - `target`
  - `.next`
  - `build`
  - `dist`
  - `venv`
  - `env`
  - `__pycache__`
  - `.pytest_cache`
  - `.ruff_cache`
  - `.mypy_cache`
  - `.dart_tool`
  - `coverage`
- fail on nested `.github` / `.gitea` directories except root `.github`
- fail on risky filename extensions and key files:
  - `*.pem`
  - `*.key`
  - `*.p12`
  - `*.jks`
  - `*.keystore`
  - `id_rsa`
  - `id_ed25519`

The job intentionally does not run an aggressive content-based secret scanner to avoid noisy false positives from docs and policy files.

## 6. compose-config Checks

`compose-config` runs on `ubuntu-latest` and validates only static Docker Compose rendering:

- `docker compose version`
- `docker compose -f infra/local/docker-compose.dev.yml config`
- `docker compose -f services/database-service/docker-compose.yml config`

Not included:

- no `docker compose up`
- no `docker compose down`
- no `docker build`

## 7. database-service Checks

`database-service` runs on `ubuntu-latest` with:

- `actions/setup-python@v5`
- `astral-sh/setup-uv@v5`

Python choice:

- workflow uses Python `3.13`
- local host during previous slices used Python `3.14.3`
- Python `3.13` was chosen for GitHub Actions conservatism because `3.14` availability may be less stable across runners

Checks added:

- `uv --version`
- `uv venv --python 3.13`
- `uv pip install -r requirements.txt`
- `uv pip list`
- `uv run python -m py_compile database_service/settings.py`
- `uv run python -m py_compile orders_pars/service.py`
- `uv run python -c "import django; import rest_framework; import requests; import dotenv; import corsheaders; import PIL; import mysql.connector"`

Note:

- `uv venv` is explicitly pinned to Python `3.13`
- this was done for deterministic GitHub Actions behavior because the workflow already pins `actions/setup-python@v5` to `python-version: "3.13"`

Explicitly excluded:

- `manage.py`
- `migrate`
- `runserver`
- `pytest`

## 8. rust-backend-metadata Checks

`rust-backend-metadata` runs on `ubuntu-latest` with:

- `dtolnay/rust-toolchain@stable`

Only one Rust command is executed:

- `cargo metadata --no-deps`

Explicitly excluded:

- `cargo check`
- `cargo build`
- `cargo test`
- `cargo clippy`
- `cargo fmt`

## 9. Explicitly Deferred Checks

Deferred from this first CI workflow:

- `cargo check`
- `cargo fmt --all -- --check`
- `cargo clippy -- -D warnings`
- `cargo test`
- frontend `npm ci`
- frontend `npm run lint`
- frontend `npm run typecheck`
- frontend `npm test`
- frontend `npm run build`
- mobile `flutter analyze`
- mobile `flutter test`
- mobile build/signing flows
- orchestrator dependency install
- orchestrator `pytest`
- Docker builds
- deploy workflows
- migrations

## 10. Secrets / Deploy Safety

The workflow does not use:

- GitHub environments
- deployment permissions
- stage secrets
- production secrets
- `DATABASE_URL` secrets
- SSH credentials
- registry credentials

The workflow does not perform:

- deploy
- stage actions
- prod actions
- migrations
- writes to external systems

## 11. Local Validation Results

Local post-edit validation executed:

- `git status --short`
- `git diff --stat`
- `Get-Content .github/workflows/ci.yml`
- `docker compose -f infra/local/docker-compose.dev.yml config`
- `docker compose -f services/database-service/docker-compose.yml config`
- `cargo metadata --no-deps`
- env file scan
- forbidden dirs local scan
- `git status --ignored --short services/database-service/.venv`

Results:

- workflow file present and reviewable as text;
- both compose config commands succeed locally;
- `cargo metadata --no-deps` succeeds locally;
- env scan shows only `.env.example` / `.env.*.example`;
- local forbidden-dir scan may show ignored local `.venv`/`__pycache__` noise under `services/database-service`, but CI fresh checkout will not contain that local generated state;
- `.venv` remains ignored.

## 12. Risks

- the workflow is intentionally minimal and does not yet validate frontend, mobile, orchestrator, or full Rust quality gates;
- GitHub runner behavior for Python/uv can still differ slightly from local Windows validation;
- `repo-safety` scans filenames and directories only, not secret contents, by design.

## 13. Blockers

Hard blockers for Slice 4B: none.

Known future expansion blockers:

- frontend install/lint/typecheck/build path still needs explicit CI-safe validation;
- orchestrator install/test path still needs explicit CI-safe validation;
- mobile bootstrap path still needs explicit CI-safe validation;
- full Rust checks still need confirmation before becoming required.

## 14. Warnings

- local forbidden-dir scan can report generated `.venv` and `__pycache__` noise under `services/database-service`; this is expected local state, not a CI blocker;
- the workflow does not use caching yet, intentionally, to keep Slice 4B simple and low-risk;
- Python `3.13` in GitHub Actions may differ slightly from local `3.14.3`, but this is a conscious compatibility tradeoff for the first CI slice.

## 15. Branch Protection Recommendation

After the first successful GitHub Actions PR run, the following checks can become required for PRs:

- `repo-safety`
- `compose-config`
- `database-service`
- `rust-backend-metadata`

Recommendation constraint:

- make them required only after confirming at least one green run in GitHub Actions.

## 16. Next Step

Recommended next slice:

- expand CI conservatively with one additional validated area only;
- strongest candidate is frontend CI bootstrap validation before adding `npm ci`, `lint`, and `typecheck` into branch protection.
