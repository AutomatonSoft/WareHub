# Slice 4Q - Stage to Main Promotion Checklist Report

## 1. Summary

This slice created a reusable documentation checklist for safe promotion from `stage` to `main`.
The checklist is based directly on the policy defined in Slice 4P.
It does not create a promotion PR, does not change branch protection, and does not trigger deploy, release, or migration actions.

## 2. Git State

- repository path: `I:\WareHub`
- branch: `feature/slice-4q-stage-main-promotion-checklist`
- preflight working tree: clean
- `HEAD` contains stage merge Slice 4P:
  - `c38266d Merge pull request #32 from RavilkaDev0/feature/slice-4p-stage-main-promotion-policy`

Final git state after this slice:

- two new documentation files only

## 3. Files Created

- `docs/runbooks/stage-main-promotion-checklist.md`
- `docs/runbooks/slice-4q-stage-main-promotion-checklist-report.md`

## 4. Checklist Scope

The checklist covers:

- safe `stage -> main` promotion preconditions
- required checks
- local preflight commands
- promotion PR command template
- promotion PR body template
- merge rules
- post-merge verification
- rollback guidance
- deferred non-goals

The checklist does not:

- create a PR
- merge a PR
- change branch protection
- run deploy
- run migrations
- create release tags

## 5. Required Checks Captured

The checklist captures the required checks from Slice 4P:

- `CI / repo-safety`
- `CI / compose-config`
- `CI / database-service`
- `CI / frontend`
- `CI / mobile`
- `CI / orchestrator`
- `CI / rust-backend`

Optional:

- `CI / rust-backend-metadata`

## 6. Promotion Flow Captured

The checklist captures the intended promotion flow:

- validated work merges into `stage`
- `stage` latest CI history is checked
- PR is opened from `stage` to `main`
- promotion PR waits for required checks
- merge happens only after green CI

The checklist also states:

- `main` is a promotion target, not an active development branch
- this flow is separate from deploy, release, and migration work

## 7. No-Deploy Boundary

The checklist explicitly preserves the no-deploy boundary:

- not a deploy checklist
- no release tags
- no migrations
- no production changes
- no automatic infrastructure or environment actions

## 8. Rollback Guidance

Rollback guidance captured in the checklist:

- use `git revert` on the merge commit on `main`
- do not run DB rollback
- do not touch infrastructure
- do not deploy automatically

## 9. Validation Results

Static validation confirmed:

- current workflow still exists unchanged in `.github/workflows/ci.yml`
- local and remote `stage` / `main` branches exist
- current branch has no open PR
- recent successful CI runs include:
  - Slice 4P
  - Slice 4O
  - Slice 4N
- env scan found only `.env.example` / `.env.*.example`
- forbidden-dir scan was not empty, but findings are local ignored/generated noise and non-blocking

Final `git status --short` should show only the two new documentation files for this slice.

## 10. Blockers

No blockers for this documentation-only slice.

## 11. Warnings

- current branch has no associated open PR
- branch protection settings were not changed or write-validated in this slice
- forbidden-dir scan includes local ignored/generated noise such as:
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
- `Get-Content docs/runbooks/slice-4p-stage-main-promotion-policy-report.md`
- `Get-Content .github/workflows/ci.yml`
- `git branch -a`
- `gh pr status`
- `gh run list --limit 10`
- `git diff --stat`
- `Get-Content docs/runbooks/stage-main-promotion-checklist.md`
- `Get-Content docs/runbooks/slice-4q-stage-main-promotion-checklist-report.md`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`

## 13. Next Step

Recommended next step:

- `Slice 4R`: remove `rust-backend-metadata` after observation cycle
- or `Slice 5A`: Docker build validation discovery
