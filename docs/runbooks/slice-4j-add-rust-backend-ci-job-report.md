# Slice 4J - Add Rust Backend CI Job Report

## 1. Summary

Slice 4J adds a new full Rust backend CI job to the existing GitHub Actions workflow.

The new job is named:

- `rust-backend`

It uses only the checks already validated in Slice 4I:

- `cargo fmt --all -- --check`
- `cargo check`
- `cargo clippy -- -D warnings`
- `cargo test`

This is a CI-only slice:

- no runtime code changes
- no Cargo manifest changes
- no deploy logic
- no migrations
- no Docker build or compose up/down behavior

## 2. Files Changed

- `.github/workflows/ci.yml`
- `docs/runbooks/slice-4j-add-rust-backend-ci-job-report.md`

## 3. Rust Backend Job Added

New job added to `.github/workflows/ci.yml`:

- `rust-backend`

Job shape:

- `name: rust-backend`
- `runs-on: ubuntu-latest`
- `timeout-minutes: 15`
- `defaults.run.working-directory: apps/backend`

Tooling setup:

- `actions/checkout@v4`
- `dtolnay/rust-toolchain@stable`

Important compatibility note:

- existing `rust-backend-metadata` job was left unchanged
- new full job is separate so that branch protection can later target `CI / rust-backend`

## 4. Checks Included

The `rust-backend` job includes exactly these commands:

- `cargo fmt --all -- --check`
- `cargo check`
- `cargo clippy -- -D warnings`
- `cargo test`

These checks were previously validated in Slice 4I without requiring:

- local `.env` creation
- database startup
- migration execution

## 5. Checks Deferred

Still deferred from this slice:

- `cargo run`
- app server startup
- database provisioning
- `DATABASE_URL` setup
- migration execution
- `docker build`
- `docker compose up`
- `docker compose down`
- deploy scripts
- external services
- secrets

Also unchanged from prior CI policy:

- no mobile CI expansion in this slice
- no additional Python/frontend job changes in this slice

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
- `orchestrator`

Only one new job was appended:

- `rust-backend`

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
- `git status --ignored --short apps/backend/target`
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
- `rust-backend`

Static review also confirmed that the new `rust-backend` job contains:

- `cargo fmt --all -- --check`
- `cargo check`
- `cargo clippy -- -D warnings`
- `cargo test`

Static review confirmed that the new `rust-backend` job does not contain:

- `cargo run`
- `DATABASE_URL`
- `sqlx migrate`
- `docker build`
- `docker compose up/down`
- deploy
- migrations
- secrets
- external services

## 8. Branch Protection Recommendation

After the first green GitHub Actions PR run, there are two safe options:

- make `rust-backend` a required check
- or keep it non-required for one more observation cycle

Conservative recommendation:

- wait for the first green PR run, then decide whether to make `rust-backend` required immediately
- `rust-backend-metadata` can stay required for now, or later be replaced by `rust-backend` after an observation cycle

## 9. Risks

- the new job introduces a full Rust validation chain, so future backend drift will surface directly in PRs
- CI runtime for `cargo test` may be longer than the lightweight metadata job; this is expected
- although Slice 4I validated the command set successfully, GitHub runner timing can still differ from local Windows execution

## 10. Blockers

- no hard blockers for Slice 4J

## 11. Warnings

- local artifact scans may still show ignored/generated noise such as:
  - `apps/backend/target`
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

- open PR / observe the first real GitHub Actions run with the new `rust-backend` job
- if green, decide whether to make `rust-backend` required
- after that, continue CI expansion only with the next narrow validated area
