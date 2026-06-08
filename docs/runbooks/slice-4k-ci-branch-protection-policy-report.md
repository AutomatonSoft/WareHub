# Slice 4K - CI Branch Protection Policy Report

## 1. Summary

Slice 4K documents the current CI branch-protection policy after the successful staged rollout of the main CI jobs.

Current validated CI jobs in `.github/workflows/ci.yml`:

- `repo-safety`
- `compose-config`
- `database-service`
- `frontend`
- `orchestrator`
- `rust-backend`
- `rust-backend-metadata`

Recommended policy for `stage`:

- make the main functional jobs required
- keep `rust-backend-metadata` non-required
- do not auto-change branch protection in this slice

Recommended required checks for stage:

- `CI / repo-safety`
- `CI / compose-config`
- `CI / database-service`
- `CI / frontend`
- `CI / orchestrator`
- `CI / rust-backend`

Not recommended as required:

- `CI / rust-backend-metadata`

## 2. Git State

- CWD: `I:\WareHub`
- Branch: `feature/slice-4k-ci-branch-protection-policy`
- Preflight matched expected constraints:
  - path matched repo root
  - branch matched slice branch
  - working tree was clean
  - `HEAD` contained Slice 4J merge `f75ebc0` or newer
- Final `git status --short`:
  - `?? docs/runbooks/slice-4k-ci-branch-protection-policy-report.md`

## 3. Current CI Workflow State

Current workflow file:

- `.github/workflows/ci.yml`

Confirmed workflow safety:

- trigger: `pull_request` to:
  - `stage`
  - `main`
- trigger: `workflow_dispatch`
- no `push` trigger
- `permissions: contents: read`
- workflow `concurrency` enabled
- no secrets usage
- no deploy logic
- no migrations
- no Docker build
- no service containers
- no stage/prod GitHub environments

Confirmed jobs:

- `repo-safety`
- `compose-config`
- `database-service`
- `rust-backend-metadata`
- `frontend`
- `orchestrator`
- `rust-backend`

## 4. Recent CI Evidence

Read-only GitHub Actions evidence from `gh run list --limit 10` showed recent successful CI runs:

- `Slice 4B: add first conservative CI safe checks`
  - run id `26950037649`
  - status `completed`
  - conclusion `success`
  - timestamp `2026-06-04T11:53:09Z`
- `Slice 4E: add frontend CI job`
  - run id `26994920800`
  - status `completed`
  - conclusion `success`
  - timestamp `2026-06-05T04:13:05Z`
- `Slice 4H: add orchestrator CI job`
  - run id `26996222042`
  - status `completed`
  - conclusion `success`
  - timestamp `2026-06-05T04:55:01Z`
- `Slice 4J: add full Rust backend CI job`
  - run id `26997208246`
  - status `completed`
  - conclusion `success`
  - timestamp `2026-06-05T05:25:57Z`

Additional contextual green evidence:

- `Slice 4G: fix orchestrator test bootstrap`
  - run id `26995899267`
  - success
- `Slice 4I: add Rust backend CI bootstrap validation report`
  - run id `26996813643`
  - success

`gh pr status` showed no open PR for the current branch at the time of this report.

## 5. Recommended Required Checks for stage

Recommended required checks for `stage`:

- `CI / repo-safety`
- `CI / compose-config`
- `CI / database-service`
- `CI / frontend`
- `CI / orchestrator`
- `CI / rust-backend`

Rationale:

- these checks now cover the proven base repo safety surface plus the currently validated backend/frontend/python-service/orchestrator quality gates
- each of these jobs has already been introduced through separate validation slices and then observed in successful PR CI runs

## 6. Optional / Non-required Checks

Recommended non-required / optional checks for now:

- `CI / rust-backend-metadata`

Rationale:

- it was valuable as an early lightweight signal before full Rust validation existed
- the full `rust-backend` job now implicitly covers the meaningful Rust validation chain
- keeping `rust-backend-metadata` non-required avoids redundant required status noise

## 7. rust-backend-metadata Policy

Policy recommendation:

- do **not** make `CI / rust-backend-metadata` required
- keep it temporarily as a lightweight extra signal for `1-2` PR observation cycles
- after `rust-backend` remains stable across that observation window, decide in a later cleanup slice whether to remove `rust-backend-metadata`

Reasoning:

- `cargo metadata --no-deps` was useful during CI bootstrap rollout
- now that `rust-backend` runs:
  - `cargo fmt --all -- --check`
  - `cargo check`
  - `cargo clippy -- -D warnings`
  - `cargo test`
- the metadata-only signal is no longer essential as a required gate

## 8. Recommended Branch Protection Settings

Recommended conservative branch protection settings for `stage`:

- Require a pull request before merging: `ON`
- Require status checks to pass before merging: `ON`
- Require branches to be up to date before merging: `ON`
- Required checks:
  - `CI / repo-safety`
  - `CI / compose-config`
  - `CI / database-service`
  - `CI / frontend`
  - `CI / orchestrator`
  - `CI / rust-backend`

Conservative decisions that should remain manual/policy-driven outside this slice:

- Include administrators: optional, depends on repo governance preference
- Restrict who can push: optional, depends on maintainer model

## 9. main Branch Policy

Recommendation for `main`:

- do not aggressively reconfigure `main` protection automatically in this slice
- keep `main` as promotion-only target from `stage`
- changes should reach `main` only through PR from `stage`
- production/deploy policy must remain decoupled until a later deploy strategy slice

Safe promotion model:

- `feature/*` -> PR -> `stage`
- `stage` accumulates validated CI coverage
- `stage` -> PR -> `main`
- later slices define release/deploy coupling explicitly

## 10. Deferred CI Surface

Still outside current CI coverage:

- mobile Flutter checks
- Docker image build checks
- e2e / Playwright
- Storybook build
- Next production build
- deploy dry-run
- secret content scanning
- SQLx / database integration tests
- migration validation
- Docker compose up health checks
- stage/prod release workflow

## 11. Risks

- required stage checks will increase merge friction if any currently green job becomes flaky
- keeping both `rust-backend` and `rust-backend-metadata` in the workflow creates some redundant Rust signal until cleanup
- current CI still does not prove deployment readiness, migration safety, or container build correctness
- current CI is code-quality oriented, not release-readiness oriented

## 12. Blockers

- no blocker for documenting the policy
- no blocker for recommending required checks on `stage`

Separate future decisions still needed:

- whether to keep `rust-backend-metadata` beyond the observation period
- when to start enforcing stronger `main` protection tied to stage promotion flow

## 13. Warnings

- `gh pr status` showed no open PR for the current branch, so current-slice PR evidence is not yet available
- forbidden-dir scan is not empty because of local ignored/generated noise such as:
  - `apps/backend/target`
  - `apps/frontend/node_modules`
  - `apps/frontend/.next`
  - `apps/mobile/.dart_tool`
  - `services/database-service/.venv`
  - `services/orchestrator/.venv`
  - `.pytest_cache`
  - `__pycache__`
- this noise is local state, not tracked repo drift

## 14. Commands Run

Preflight:

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`

Discovery / evidence:

- `Get-Content .github/workflows/ci.yml`
- `gh pr status`
- `gh run list --limit 10`
- `git diff --stat`

Scans:

- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
- `git status --ignored --short apps/backend/target`
- `git status --ignored --short apps/frontend/node_modules`
- `git status --ignored --short services/database-service/.venv`
- `git status --ignored --short services/orchestrator/.venv`

## 15. Proposed Next Slices

Recommended next slices:

- `Slice 4L`: mobile CI bootstrap validation
- `Slice 4M`: add mobile CI job if validation is green
- `Slice 4N`: CI cleanup / `rust-backend-metadata` retirement decision
- `Slice 4O`: `stage -> main` promotion policy
- `Slice 5A`: Docker build validation discovery
