# Slice 4P - Stage to Main Promotion Policy Report

## 1. Summary

This slice defines the safe promotion policy from `stage` to `main`.

Required conclusion:

- `main` should be protected before the first `stage -> main` promotion
- promotion should happen only through a PR from `stage` to `main`
- required checks for `main` should match stage required checks
- no deploy/prod automation should be attached yet
- this policy does not promote anything by itself

This is a documentation/report-only slice.
No workflow, branch protection, deploy, or runtime changes were made.

## 2. Git State

- repository path: `I:\WareHub`
- branch: `feature/slice-4p-stage-main-promotion-policy`
- preflight working tree: clean
- `HEAD` contains stage merge Slice 4O:
  - `c2c231d Merge pull request #31 from RavilkaDev0/feature/slice-4o-ci-cleanup-rust-metadata-policy`

Branch availability confirmed locally/remotely:

- local:
  - `stage`
  - `main`
- remote:
  - `origin/stage`
  - `origin/main`

Current branch has no open PR according to `gh pr status`.

## 3. Current CI Workflow State

Current workflow file:

- `.github/workflows/ci.yml`

Confirmed workflow state:

- triggers:
  - `pull_request` to `stage`
  - `pull_request` to `main`
  - `workflow_dispatch`
- `permissions: contents: read`
- `concurrency` enabled
- no push deploy trigger
- no deploy logic
- no migrations
- no Docker build
- no environments
- no secrets handling steps

Current CI jobs:

- `repo-safety`
- `compose-config`
- `database-service`
- `frontend`
- `mobile`
- `orchestrator`
- `rust-backend`
- `rust-backend-metadata`

## 4. Recent CI Evidence

Recent successful runs from `gh run list --limit 10`:

- Slice 4O: add rust backend metadata CI policy report
  - run id: `27001004502`
  - status: `completed success`
  - date: `2026-06-05T07:11:23Z`
- Slice 4N: add mobile CI job
  - run id: `27000532566`
  - status: `completed success`
  - date: `2026-06-05T06:59:41Z`
- Slice 4M: format mobile owned code
  - run id: `26999091971`
  - status: `completed success`
  - date: `2026-06-05T06:21:27Z`
- Slice 4L: add mobile CI bootstrap validation report
  - run id: `26998599316`
  - status: `completed success`
  - date: `2026-06-05T06:07:10Z`
- Slice 4K: add CI branch protection policy report
  - run id: `26997778298`
  - status: `completed success`
  - date: `2026-06-05T05:43:07Z`
- Slice 4J: add full Rust backend CI job
  - run id: `26997208246`
  - status: `completed success`
  - date: `2026-06-05T05:25:57Z`

This is enough evidence to state:

- `stage` now has a working CI baseline
- `mobile` already has a first green CI run
- `rust-backend` already has a first green full Rust CI run

## 5. Stage Branch Policy

Recommended `stage` protection policy:

- require pull request before merging
- require resolved conversations before merging
- require status checks before merging
- require branches to be up to date before merging

Recommended required checks for `stage`:

- `CI / repo-safety`
- `CI / compose-config`
- `CI / database-service`
- `CI / frontend`
- `CI / mobile`
- `CI / orchestrator`
- `CI / rust-backend`

Optional on `stage`:

- `CI / rust-backend-metadata`

Rationale:

- `rust-backend` is the real Rust quality gate
- `rust-backend-metadata` remains a lightweight optional signal only

## 6. Main Branch Policy

Recommended `main` protection policy before first promotion:

- protect `main` before allowing the first `stage -> main` PR merge
- require PR-based merges only
- no direct pushes
- no direct feature branches into `main` for now
- required checks should match `stage` required checks
- no deploy automation attached yet
- no automatic tag/release creation attached yet

Required checks for `main` should match `stage`:

- `CI / repo-safety`
- `CI / compose-config`
- `CI / database-service`
- `CI / frontend`
- `CI / mobile`
- `CI / orchestrator`
- `CI / rust-backend`

Not required on `main`:

- `CI / rust-backend-metadata`

`main` should act as a promotion target, not as an active feature-development branch.

## 7. Stage to Main Promotion Flow

Recommended promotion model:

- `feature/* -> PR -> stage -> validation -> PR stage -> main`

Promotion flow:

1. Merge validated work into `stage`
2. Confirm latest `stage` history is green on required checks
3. Open a PR with:
   - base: `main`
   - head: `stage`
4. Let the same CI baseline run for the `main`-target PR
5. Merge only if all required checks are green

For now:

- do not promote direct feature branches into `main`
- do not mix promotion with deploy or migration slices

## 8. Required Checks for Promotion PR

Before opening the `stage -> main` PR:

- `stage` is clean and up to date with `origin/stage`
- latest `stage` PR history shows all required checks green
- no open critical PRs targeting `stage`
- no local uncommitted changes
- no active deploy/migration work mixed in

Required checks on the promotion PR:

- `CI / repo-safety`
- `CI / compose-config`
- `CI / database-service`
- `CI / frontend`
- `CI / mobile`
- `CI / orchestrator`
- `CI / rust-backend`

Optional:

- `CI / rust-backend-metadata`

## 9. Promotion PR Template

Recommended promotion PR title:

- `Promote stage to main: CI baseline`

Recommended PR body should include:

- short summary of the CI baseline
- explicit list of required checks
- explicit statement that no deploy is included
- rollback plan

Minimum body content:

- what baseline is being promoted
- what checks are required
- that no deploy/migration/release tagging is part of this PR
- that rollback is git-level revert only

## 10. Rollback Policy

Because this is a no-deploy promotion policy:

- rollback is git-level only
- revert the merge commit on `main` if needed
- do not run migrations
- do not alter prod/stage infra
- no database rollback is involved yet

## 11. Deferred Deploy / Production Surface

Not part of Slice 4P:

- Docker image builds
- deploy dry-run
- stage deploy
- production deploy
- release tags
- DB migrations
- migration rollback
- secrets
- environment protection
- artifact publishing

## 12. Risks

- if `main` is not protected before first promotion, the promotion model becomes inconsistent
- if direct feature PRs are allowed into `main`, `main` stops being a true promotion target
- if required checks diverge between `stage` and `main`, promotion behavior becomes harder to reason about
- if deploy automation is attached too early, release risk is mixed into a branch-policy slice

## 13. Blockers

No blockers for this documentation-only policy slice.

## 14. Warnings

- current branch has no associated open PR
- branch protection settings were not inspected or changed through write operations in this slice
- forbidden-dir scan is not empty, but the findings are local ignored/generated noise and non-blocking:
  - `apps/backend/target`
  - `apps/frontend/node_modules`
  - `apps/frontend/.next`
  - `apps/mobile/.dart_tool`
  - `apps/mobile/build`
  - `services/database-service/.venv`
  - `services/orchestrator/.venv`
  - `.pytest_cache`
  - `__pycache__`

## 15. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -7`
- `Get-Content .github/workflows/ci.yml`
- `git branch -a`
- `gh pr status`
- `gh run list --limit 10`
- `git diff --stat`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`

## 16. Proposed Next Slices

- `Slice 4Q`: create stage -> main promotion PR checklist / optional root docs note
- `Slice 4R`: remove `rust-backend-metadata` job after observation cycle
- `Slice 5A`: Docker build validation discovery
