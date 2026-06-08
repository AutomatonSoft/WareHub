# Slice 4E - Add Frontend CI Job Report

## 1. Summary

Slice 4E expands the existing conservative CI workflow by adding a dedicated `frontend` job.

The new job uses only checks already validated in Slice 4D:

- `npm ci`
- `npm run lint --if-present`
- `npm run typecheck --if-present`
- `npm test --if-present`

It does not add build, dev server, Storybook build, Playwright/e2e, deploy, migrations, or Docker-related execution.

## 2. Files Changed

- `.github/workflows/ci.yml`
- `docs/runbooks/slice-4e-add-frontend-ci-job-report.md`

## 3. Frontend Job Added

Added job:

- `frontend`

Job configuration:

- `runs-on: ubuntu-latest`
- `timeout-minutes: 15`
- `working-directory: apps/frontend`

Steps:

- `actions/checkout@v4`
- `actions/setup-node@v4`
  - `node-version: "24"`
  - `cache: "npm"`
  - `cache-dependency-path: apps/frontend/package-lock.json`
- `npm ci`
- `npm run lint --if-present`
- `npm run typecheck --if-present`
- `npm test --if-present`

## 4. Checks Included

Included in the new frontend job:

- dependency bootstrap:
  - `npm ci`
- static quality:
  - `npm run lint --if-present`
  - `npm run typecheck --if-present`
- lightweight tests:
  - `npm test --if-present`

These commands were selected because Slice 4D confirmed:

- `npm ci` -> success
- `lint` -> success with warnings only
- `typecheck` -> success
- `test` -> success

## 5. Checks Deferred

Still deferred:

- `npm run build`
- `npm run dev`
- Storybook build
- Playwright/e2e
- visual regression
- OpenAPI drift checks
- any deploy-related action
- any migration-related action
- Docker build or `docker compose up/down`

## 6. Workflow Safety

Workflow safety remains unchanged:

- triggers remain:
  - `pull_request` to `stage`
  - `pull_request` to `main`
  - `workflow_dispatch`
- `permissions: contents: read`
- `concurrency` preserved
- existing jobs preserved:
  - `repo-safety`
  - `compose-config`
  - `database-service`
  - `rust-backend-metadata`

The frontend job does not use:

- secrets
- environments
- deploy steps
- migrations
- Docker builds

## 7. Local Static Validation

Local post-edit validation executed:

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

Validation outcome:

- workflow now contains jobs:
  - `repo-safety`
  - `compose-config`
  - `database-service`
  - `rust-backend-metadata`
  - `frontend`
- frontend job does not contain:
  - `npm run build`
  - `npm run dev`
  - deploy
  - secrets
  - `docker build`
  - `docker compose up/down`
- existing compose config checks remain valid
- backend metadata command remains valid

## 8. Branch Protection Recommendation

Recommended rollout:

- first let the new `frontend` job run in at least one green PR cycle
- after that, optionally add `frontend` as a required check

Conservative option:

- keep `frontend` non-required for one PR cycle before enabling branch protection requirement

## 9. Risks

- Slice 4D validated frontend bootstrap on a local Windows environment; GitHub Actions on Ubuntu should be close, but the first real PR run is still the required proof point
- lint currently passes with warnings only, so any future policy escalation to warning-free lint will require a separate cleanup slice

## 10. Blockers

Hard blockers for adding the frontend CI job: none.

## 11. Warnings

- local artifact scans may show ignored `apps/frontend/node_modules`
- local artifact scans may show ignored `services/database-service/.venv`
- these are local generated directories, not tracked repository artifacts

## 12. Next Step

Recommended next step:

- run the new workflow in GitHub Actions on a PR
- if green, decide whether `frontend` should become required immediately or after one more observation cycle
