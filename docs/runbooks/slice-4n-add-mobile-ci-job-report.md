# Slice 4N - Add Mobile CI Job Report

## 1. Summary

A new `mobile` CI job was added to `.github/workflows/ci.yml`.
The job uses only the validated mobile checks from Slice 4L and Slice 4M.
The formatting gate is intentionally scoped to owned mobile code under `lib` and `test`.
No full-project `dart format --output=none --set-exit-if-changed .` check was added because vendored formatting drift is still known under `apps/mobile/vendor/niimbot_label_printer`.

## 2. Files Changed

- `.github/workflows/ci.yml`
- `docs/runbooks/slice-4n-add-mobile-ci-job-report.md`

## 3. Mobile Job Added

Added workflow job:

- `mobile`

Job shape:

- `runs-on: ubuntu-latest`
- `timeout-minutes: 15`
- working directory: `apps/mobile`

Tooling setup:

- `actions/checkout@v4`
- `subosito/flutter-action@v2`
- `flutter-version: "3.41.4"`
- `channel: stable`

## 4. Checks Included

The `mobile` job includes only these checks:

- `flutter --version`
- `dart --version`
- `flutter pub get`
- `dart format --output=none --set-exit-if-changed lib test`
- `flutter analyze`
- `flutter test`

## 5. Formatting Scope Policy

The workflow intentionally checks formatting only for owned mobile code:

- `apps/mobile/lib`
- `apps/mobile/test`

It intentionally does not run:

- `dart format --output=none --set-exit-if-changed .`

Reason:

- full-project formatting still fails because of known vendor formatting drift under `apps/mobile/vendor/niimbot_label_printer`
- Slice 4M already confirmed that owned code formatting is green while full-project formatting remains vendor-blocked

## 6. Checks Deferred

The `mobile` job intentionally does not include:

- `dart format --output=none --set-exit-if-changed .`
- `flutter build`
- `flutter run`
- emulator commands
- simulator commands
- signing commands
- store/deploy commands
- Docker build
- `docker compose up/down`

## 7. Workflow Safety

Preserved unchanged:

- `pull_request` trigger to `stage` and `main`
- `workflow_dispatch`
- `permissions: contents: read`
- existing workflow `concurrency`
- all pre-existing jobs remained intact

The new job does not introduce:

- secrets
- deploy logic
- migration logic
- service containers
- stage/prod environment coupling

## 8. Local Static Validation

Static validation confirmed:

- workflow now contains jobs:
  - `repo-safety`
  - `compose-config`
  - `database-service`
  - `rust-backend-metadata`
  - `frontend`
  - `mobile`
  - `orchestrator`
  - `rust-backend`
- `mobile` job contains:
  - `flutter pub get`
  - `dart format --output=none --set-exit-if-changed lib test`
  - `flutter analyze`
  - `flutter test`
- `mobile` job does not contain:
  - `dart format --output=none --set-exit-if-changed .`
  - `flutter build`
  - `flutter run`
  - `emulator`
  - `simulator`
  - `signing`
  - `deploy`
  - `docker build`
  - `docker compose up/down`

Safe config commands remained valid:

- `docker compose -f infra/local/docker-compose.dev.yml config`
- `docker compose -f services/database-service/docker-compose.yml config`
- `cargo metadata --no-deps`

## 9. Branch Protection Recommendation

After the first real green GitHub Actions PR run, the repository can consider adding:

- `CI / mobile`

as a required check.

Conservative recommendation:

- wait for one confirmed green GitHub Actions run first

## 10. Risks

- GitHub runner behavior for Flutter can still differ from the local Windows host even with pinned Flutter `3.41.4`
- if vendored formatting policy changes later, the mobile job may need a separate policy update
- mobile CI still does not validate build/signing/runtime flows, by design

## 11. Blockers

No blockers for adding the `mobile` CI job in this scoped form.

Known non-blocker:

- full-project mobile formatting remains vendor-blocked, which is why the workflow uses owned-scope formatting only

## 12. Warnings

- local validation in this slice was static only; mobile commands were not executed locally because the slice explicitly forbids them
- local ignored/generated directories may appear in scans, but they are known local noise and not tracked workflow artifacts

## 13. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -7`
- `Get-Content .github/workflows/ci.yml`
- `git status --short`
- `git diff --stat`
- `Get-Content .github/workflows/ci.yml`
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

## 14. Next Step

Next recommended step:

- open a PR and wait for the first real GitHub Actions run with the new `mobile` job
- if green, consider making `CI / mobile` a required check
