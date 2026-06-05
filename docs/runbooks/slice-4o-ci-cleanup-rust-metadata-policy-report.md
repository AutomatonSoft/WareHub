# Slice 4O - CI Cleanup Rust Metadata Policy Report

## 1. Summary

This slice documents the retirement policy for `CI / rust-backend-metadata`.
The current conclusion is:

- do not make `CI / rust-backend-metadata` required
- keep it optional for now
- remove it only in a later cleanup slice after at least `1-2` additional green PR cycles with `CI / rust-backend`
- stage required checks should include `CI / rust-backend`, not `CI / rust-backend-metadata`

This is a documentation/report-only decision slice.
No workflow changes were made.

## 2. Git State

- repository path: `I:\WareHub`
- branch: `feature/slice-4o-ci-cleanup-rust-metadata-policy`
- working tree at preflight: clean
- `HEAD` contains stage merge Slice 4N:
  - `336ce84 Merge pull request #30 from RavilkaDev0/feature/slice-4n-add-mobile-ci-job`

Final working tree after this slice:

- one new untracked report file only

## 3. Current CI Workflow State

Current workflow file:

- `.github/workflows/ci.yml`

Confirmed current jobs:

- `repo-safety`
- `compose-config`
- `database-service`
- `rust-backend-metadata`
- `frontend`
- `mobile`
- `orchestrator`
- `rust-backend`

Confirmed workflow safety state:

- trigger: `pull_request` to `stage` and `main`
- `workflow_dispatch` enabled
- `permissions: contents: read`
- `concurrency` enabled
- no deploy logic
- no migrations
- no stage/prod environment coupling

## 4. Recent CI Evidence

Recent successful GitHub Actions runs from `gh run list --limit 10`:

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
- Slice 4I: add Rust backend CI bootstrap validation report
  - run id: `26996813643`
  - status: `completed success`
  - date: `2026-06-05T05:13:33Z`
- Slice 4H: add orchestrator CI job
  - run id: `26996222042`
  - status: `completed success`
  - date: `2026-06-05T04:55:01Z`

Evidence available from current list is sufficient to confirm:

- `CI / rust-backend` already has a green run after Slice 4J
- `CI / mobile` already has a first green run after Slice 4N

## 5. rust-backend-metadata Current Role

Current role of `rust-backend-metadata`:

- lightweight Rust signal
- runs only:
  - `cargo metadata --no-deps`

Current value:

- fast feedback
- cheap sanity signal that Rust project metadata still resolves

Current limitation:

- it does not prove formatting, compilation quality, lint cleanliness, or test success
- it is weaker than the full `rust-backend` gate

## 6. Full rust-backend Current Role

Current role of `rust-backend`:

- primary Rust readiness gate

Confirmed current checks:

- `cargo fmt --all -- --check`
- `cargo check`
- `cargo clippy -- -D warnings`
- `cargo test`

This job is the stronger and more meaningful Rust gate for branch protection.

## 7. Decision Options

### Variant A - keep rust-backend-metadata optional

Pros:

- keeps a fast lightweight Rust signal
- avoids changing workflow immediately after recent CI expansion
- low-risk while the team watches more green cycles

Cons:

- redundant with the stronger `rust-backend` job
- adds CI noise

### Variant B - remove rust-backend-metadata later

Pros:

- less CI noise
- simpler required-check surface
- removes a weaker overlapping Rust signal

Cons:

- loses an early lightweight metadata-only signal

Best timing for Variant B:

- only after at least `1-2` additional green PR cycles with `CI / rust-backend`

### Variant C - make rust-backend-metadata required

This is not recommended.

Reason:

- `rust-backend` already covers Rust readiness better
- making metadata required would add weaker redundant noise to branch protection

## 8. Recommended Policy

Recommended policy:

- do not make `CI / rust-backend-metadata` required
- keep it optional for now
- use `CI / rust-backend` as the Rust required check for `stage`
- retire `rust-backend-metadata` only in a later cleanup slice after at least `1-2` additional green PR cycles

This keeps policy conservative and avoids mixing:

- branch protection changes
- workflow cleanup
- observation-cycle decisions

## 9. Branch Protection Recommendation

Current recommended required checks for `stage`:

- `CI / repo-safety`
- `CI / compose-config`
- `CI / database-service`
- `CI / frontend`
- `CI / mobile`
- `CI / orchestrator`
- `CI / rust-backend`

Not required:

- `CI / rust-backend-metadata`

Additional note:

- current branch has no open PR according to `gh pr status`
- branch protection settings were not changed automatically in this slice

## 10. Deferred Cleanup

Deferred cleanup recommendation:

- leave `rust-backend-metadata` in the workflow for now
- do not change `.github/workflows/ci.yml` in this slice
- revisit removal in a later cleanup slice once the stronger `rust-backend` gate has survived more green PR cycles

## 11. Risks

- if `rust-backend-metadata` stays too long, CI surface remains noisier than necessary
- if it is removed too early, the team loses a lightweight signal before enough observation history accumulates
- policy drift can happen if branch protection is edited manually without matching documentation updates

## 12. Blockers

No blockers for this documentation-only policy decision slice.

## 13. Warnings

- current branch has no associated open PR
- forbidden-dir scan is not empty, but findings are local ignored/generated noise, including:
  - `apps/backend/target`
  - `apps/frontend/node_modules`
  - `apps/frontend/.next`
  - `apps/mobile/.dart_tool`
  - `apps/mobile/build`
  - `services/database-service/.venv`
  - `services/orchestrator/.venv`
  - `.pytest_cache`
  - `__pycache__`
- this local noise is non-blocking and does not indicate tracked repository drift

## 14. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -7`
- `Get-Content .github/workflows/ci.yml`
- `gh pr status`
- `gh run list --limit 10`
- `git diff --stat`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`

## 15. Proposed Next Slices

- `Slice 4P`: stage -> main promotion policy
- `Slice 4Q`: remove `rust-backend-metadata` job after observation cycle
- `Slice 5A`: Docker build validation discovery
