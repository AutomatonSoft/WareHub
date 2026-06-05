# Slice 5F — Python Services Docker Build CI Report

## 1. Summary

Added one new CI job:

- `python-services-docker-build`

The new job performs Docker build validation only for the two already validated Python service images:

- `services/database-service`
- `services/orchestrator`

This slice changed only:

- `.github/workflows/ci.yml`
- this report file

No local Docker builds were run. No containers were started. No `docker compose up/down` was run. No Dockerfiles, compose files, runtime code, or dependency files were changed.

## 2. Git State

- Working directory: `I:\WareHub`
- Branch: `feature/slice-5f-python-services-docker-build-ci`
- Preflight `git status --short`: clean
- `HEAD` included `ddb4178 Merge pull request #39 from RavilkaDev0/feature/slice-5e-orchestrator-dockerignore-hygiene`

## 3. Files Changed

- `.github/workflows/ci.yml` -> updated
- `docs/runbooks/slice-5f-python-services-docker-build-ci-report.md` -> added

## 4. CI Job Added

Added job:

- `python-services-docker-build`

Parameters:

- `runs-on: ubuntu-latest`
- `timeout-minutes: 15`

The job includes only:

1. checkout
2. `docker --version`
3. `docker compose version`
4. Docker build for `database-service`
5. Docker build for `orchestrator`
6. `docker image ls --filter "reference=warehub-*:*"`

## 5. Docker Build Commands Added

Added exactly these build commands:

```yaml
- name: Build database-service image
  run: docker build -f services/database-service/Dockerfile -t warehub-database-service:ci-validation services

- name: Build orchestrator image
  run: docker build -f services/orchestrator/Dockerfile -t warehub-orchestrator:ci-validation services/orchestrator
```

These match the validated local build contracts from prior slices:

- `database-service` -> parent context `services`
- `orchestrator` -> service-local context `services/orchestrator`

## 6. Safety Boundary

The new job intentionally does **not** do any of the following:

- `docker run`
- `docker compose up`
- `docker compose down`
- `docker push`
- `buildx push`
- deploy
- secrets injection
- migrations
- `docker system prune`

This is build-validation only.

## 7. Existing Jobs Preservation

Confirmed existing jobs remain present and were not modified in scope:

- `repo-safety`
- `compose-config`
- `database-service`
- `frontend`
- `mobile`
- `orchestrator`
- `rust-backend`

The new job was added alongside them rather than replacing or restructuring them.

## 8. Static Validation Results

Static validation passed:

- `git status --short` showed only the expected workflow modification and new report file
- `git diff --stat` showed only `.github/workflows/ci.yml` tracked edits
- `Get-Content .github/workflows/ci.yml` confirmed the new job exists
- text review confirmed the workflow now includes:
  - `repo-safety`
  - `compose-config`
  - `database-service`
  - `frontend`
  - `mobile`
  - `orchestrator`
  - `rust-backend`
  - `python-services-docker-build`
- text review confirmed `python-services-docker-build` contains:
  - `docker build -f services/database-service/Dockerfile -t warehub-database-service:ci-validation services`
  - `docker build -f services/orchestrator/Dockerfile -t warehub-orchestrator:ci-validation services/orchestrator`
- text review confirmed the new job does not contain:
  - `docker run`
  - `docker compose up`
  - `docker compose down`
  - `docker push`
  - `buildx push`
  - deploy
  - migrations
  - `docker system prune`

Safe config validations also passed:

- `docker compose -f infra/local/docker-compose.dev.yml config`
- `docker compose -f services/database-service/docker-compose.yml config`

## 9. CI Readiness Expectation

Expected CI outcome:

- the new job should validate only that both Python service images still build on a GitHub runner
- it should not create runtime side effects beyond image build artifacts inside the ephemeral runner

This is a reasonable first CI Docker-build slice because both services were already validated locally in earlier slices with their real contracts and effective `.dockerignore` coverage.

## 10. Branch Protection Recommendation

Do **not** make `CI / python-services-docker-build` required immediately.

Recommended path:

1. allow the first PR run to complete
2. observe at least one green run
3. then consider making `CI / python-services-docker-build` required after one observation cycle

## 11. Checks Deferred

Still intentionally deferred:

- Docker builds for `apps/backend`
- Docker builds for `apps/frontend`
- Docker builds for `apps/mobile`
- any `docker run`
- any `docker compose up/down`
- any push/publish flow
- any deploy or migration behavior
- any container health/smoke runtime checks

## 12. Blockers

- none for this CI-only slice

## 13. Warnings

- `git diff --stat` showed an LF/CRLF normalization warning for `.github/workflows/ci.yml`; this is not workflow logic drift
- forbidden-dir scan was not empty, but findings were pre-existing local ignored/generated noise:
  - `apps/backend/target`
  - `apps/frontend/.next`
  - `apps/frontend/node_modules`
  - `apps/mobile/.dart_tool`
  - `apps/mobile/build`
  - `services/database-service/.venv`
  - `services/database-service/.../__pycache__`
  - `services/orchestrator/.pytest_cache`
  - `services/orchestrator/.venv`
  - `services/orchestrator/.../__pycache__`
- the new CI job has no cache by design; this keeps the first Docker-build slice simple and easier to reason about

## 14. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -7`
- `Get-Content .github/workflows/ci.yml`
- `docker --version`
- `docker compose version`
- `docker compose -f infra/local/docker-compose.dev.yml config`
- `docker compose -f services/database-service/docker-compose.yml config`
- `rg -n "repo-safety|compose-config|database-service|frontend|mobile|orchestrator|rust-backend|python-services-docker-build|docker build -f services/database-service/Dockerfile -t warehub-database-service:ci-validation services|docker build -f services/orchestrator/Dockerfile -t warehub-orchestrator:ci-validation services/orchestrator|docker run|docker compose up|docker compose down|docker push|buildx push|secret|deploy|migration|docker system prune" .github/workflows/ci.yml`
- `git diff --stat`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
- final `git status --short`

## 15. Proposed Next Slices

- open a PR and observe the first real GitHub Actions run for `python-services-docker-build`
- if green:
  - consider making `CI / python-services-docker-build` required after one observation cycle
- more conservative follow-up alternative:
  - validate `apps/backend` Docker build before expanding Docker-build CI further
