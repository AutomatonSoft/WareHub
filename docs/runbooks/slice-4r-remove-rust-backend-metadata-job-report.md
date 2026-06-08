# Slice 4R - Remove Rust Backend Metadata Job Report

## 1. Summary

The redundant `rust-backend-metadata` CI job was removed from `.github/workflows/ci.yml`.
The full `rust-backend` job remains unchanged and continues to be the primary Rust quality gate.

Required conclusion:

- `rust-backend-metadata` was removed from the CI workflow
- full `rust-backend` remains the Rust required gate
- branch protection should not require `CI / rust-backend-metadata`
- required checks should now be the seven primary CI jobs

## 2. Files Changed

- `.github/workflows/ci.yml`
- `docs/runbooks/slice-4r-remove-rust-backend-metadata-job-report.md`

## 3. Job Removed

Removed job:

- `rust-backend-metadata`

Removed behavior:

- `cargo metadata --no-deps` was removed from the workflow file

This removal was limited strictly to that one job.

## 4. Jobs Remaining

Workflow jobs remaining after cleanup:

- `repo-safety`
- `compose-config`
- `database-service`
- `frontend`
- `mobile`
- `orchestrator`
- `rust-backend`

## 5. Rust Backend Coverage

Rust coverage remains provided by `rust-backend`.

Confirmed retained checks:

- `cargo fmt --all -- --check`
- `cargo check`
- `cargo clippy -- -D warnings`
- `cargo test`

This keeps the stronger Rust quality gate while removing the weaker redundant metadata-only signal.

## 6. Branch Protection Note

If `CI / rust-backend-metadata` was manually added to branch protection required checks, it should now be removed there.

Recommended required checks after Slice 4R:

- `CI / repo-safety`
- `CI / compose-config`
- `CI / database-service`
- `CI / frontend`
- `CI / mobile`
- `CI / orchestrator`
- `CI / rust-backend`

`CI / rust-backend-metadata` should no longer be required because the workflow job no longer exists.

## 7. Local Static Validation

Static validation confirmed:

- `rust-backend-metadata` is absent from `.github/workflows/ci.yml`
- `cargo metadata --no-deps` is absent from `.github/workflows/ci.yml`
- `rust-backend` still exists
- `rust-backend` still contains:
  - `cargo fmt --all -- --check`
  - `cargo check`
  - `cargo clippy -- -D warnings`
  - `cargo test`

Safe local checks also confirmed:

- `docker compose -f infra/local/docker-compose.dev.yml config` still passes
- `docker compose -f services/database-service/docker-compose.yml config` still passes
- local `cargo metadata --no-deps` still works as a safe manual validation signal outside CI

## 8. Checks Deferred

The following were intentionally not run locally in this slice:

- `cargo fmt`
- `cargo check`
- `cargo clippy`
- `cargo test`
- any `npm`, `uv`, or `flutter` install/test/build commands
- any deploy, migration, server, or worker commands

Reason:

- the slice explicitly allowed only static/safe validation

## 9. Risks

- if branch protection still references `CI / rust-backend-metadata`, it will need manual cleanup outside this repo change
- removing a job reduces CI noise, but also removes the separate lightweight metadata-only signal
- however, the stronger `rust-backend` gate already covers actual Rust readiness better

## 10. Blockers

No blockers for this cleanup slice.

## 11. Warnings

- branch protection settings were not changed automatically in this slice
- forbidden-dir scan is not empty, but findings are local ignored/generated noise and non-blocking:
  - `apps/backend/target`
  - `apps/frontend/node_modules`
  - `apps/frontend/.next`
  - `apps/mobile/.dart_tool`
  - `apps/mobile/build`
  - `services/database-service/.venv`
  - `services/orchestrator/.venv`
  - `.pytest_cache`
  - `__pycache__`

## 12. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -7`
- `Get-Content .github/workflows/ci.yml`
- `rg -n "rust-backend-metadata|cargo metadata --no-deps|rust-backend|cargo fmt --all -- --check|cargo check|cargo clippy -- -D warnings|cargo test" .github/workflows/ci.yml`
- `git status --short`
- `git diff --stat`
- `Get-Content .github/workflows/ci.yml`
- `rg -n "rust-backend-metadata|cargo metadata --no-deps" .github/workflows/ci.yml`
- `rg -n "rust-backend|cargo fmt --all -- --check|cargo check|cargo clippy -- -D warnings|cargo test" .github/workflows/ci.yml`
- `docker compose -f infra/local/docker-compose.dev.yml config`
- `docker compose -f services/database-service/docker-compose.yml config`
- `cargo metadata --no-deps`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
- `git status --ignored --short apps/backend/target`
- `git status --ignored --short apps/frontend/node_modules`
- `git status --ignored --short apps/mobile/.dart_tool`
- `git status --ignored --short apps/mobile/build`
- `git status --ignored --short services/database-service/.venv`
- `git status --ignored --short services/orchestrator/.venv`

## 13. Next Step

Recommended next step:

- `Slice 5A`: Docker build validation discovery

Optional policy follow-up:

- manually remove `CI / rust-backend-metadata` from branch protection required checks if it was ever added there
