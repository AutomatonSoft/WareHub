# Slice 5B — Database Service Docker Build Validation Report

## 1. Summary

`services/database-service` Docker image successfully built from repo root using the clarified monorepo contract:

- Dockerfile: `services/database-service/Dockerfile`
- Build context: `services`
- Temporary tag: `warehub-database-service:slice-5b-validation`

The build completed successfully, `docker image inspect` confirmed the expected runtime command and exposed port, and the temporary image was removed successfully after validation.

This slice built only the `services/database-service` image. No containers were started. No `docker compose up/down` was run. No Dockerfiles, compose files, dependency files, or runtime code were changed.

## 2. Git State

- Working directory: `I:\WareHub`
- Branch: `feature/slice-5b-database-service-docker-build-validation`
- Preflight `git status --short`: clean
- `HEAD` included `f6c16ea Merge pull request #35 from RavilkaDev0/feature/slice-5a-docker-build-validation-discovery`

## 3. Docker Tooling Versions

- `docker --version` -> `Docker version 29.4.3, build 055a478`
- `docker compose version` -> `Docker Compose version v5.1.3`

## 4. Docker Build Contract

Validated contract:

- Dockerfile path: `services/database-service/Dockerfile`
- Compose build context: `services/database-service/docker-compose.yml` resolves `context: ..` to `I:\WareHub\services`
- Compose Dockerfile path resolves to `database-service/Dockerfile`
- Dockerfile copies:
  - `COPY database-service/requirements.txt /app/requirements.txt`
  - `COPY database-service /app`
- Install command:
  - `RUN pip install --no-cache-dir -r /app/requirements.txt`
- Runtime command:
  - `CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]`
- `ENTRYPOINT`: `Not found`
- Auto-migration in Dockerfile/CMD: `Not found`

`.dockerignore` findings:

- `services/database-service/.dockerignore` exists and is secret/noise oriented
- `services/.dockerignore` -> `Not found`
- Because the build context is `services`, the service-local `.dockerignore` is not the active context ignore file for this build

## 5. Compose Config Result

`docker compose -f services/database-service/docker-compose.yml config` passed successfully.

Confirmed:

- build context -> `I:\WareHub\services`
- Dockerfile -> `database-service/Dockerfile`
- app command -> `python manage.py runserver 0.0.0.0:8000`
- no auto-migrate command in compose

## 6. Docker Build Command

Executed from repo root:

```powershell
docker build -f services/database-service/Dockerfile -t warehub-database-service:slice-5b-validation services
```

## 7. Docker Build Result

`docker build` passed successfully.

Observed from build output:

- base image: `python:3.14-slim`
- requirements installed successfully from `database-service/requirements.txt`
- application source copied successfully from `database-service`
- image exported and tagged successfully as `warehub-database-service:slice-5b-validation`

Notable signal:

- build context transfer was approximately `130MB`, which is larger than expected for a tightly-scoped service-only context

## 8. Image Inspect Result

`docker image inspect warehub-database-service:slice-5b-validation` passed successfully.

Confirmed:

- image id: `sha256:ff80262d86c8f9d7d3bc8e9ea255db04d6b51bef4de514350706af0d39454122`
- working directory: `/app`
- command:
  - `python`
  - `manage.py`
  - `runserver`
  - `0.0.0.0:8000`
- exposed port: `8000/tcp`
- OS/arch: `linux/amd64`
- image size: `132968991` bytes content size shown by inspect

`docker image ls warehub-database-service` showed the temporary tagged image before cleanup.

## 9. Temporary Image Cleanup Result

Cleanup command:

```powershell
docker image rm warehub-database-service:slice-5b-validation
```

Result:

- untag succeeded
- image delete succeeded

Post-cleanup check:

- `docker image ls warehub-database-service` returned no remaining tagged image rows

## 10. Dockerfile Risk Notes

Non-blocking but important risks:

1. `services/database-service/.dockerignore` is currently not active for the validated build contract.
2. The active build context is the parent `services` directory, and `services/.dockerignore` was `Not found`.
3. Build output showed a large transferred context, which is consistent with broad parent-context inclusion.
4. This means local artifacts or unrelated service content under `services` can still enter Docker context upload unless a parent-context `.dockerignore` is added in a later slice.
5. The Dockerfile itself is monorepo-safe for current copy paths, but context hygiene is not yet fully tightened.

## 11. CI Readiness Recommendation

Current state:

- `services/database-service` Docker build is technically ready for CI consideration because the build itself passed cleanly and cleanup succeeded.

Conservative recommendation:

- do **not** add broad Docker build checks to CI yet
- first validate `services/orchestrator` Docker build in a separate narrow slice
- then decide whether Docker build checks should enter CI one service at a time

## 12. Blockers

Blockers for this validation slice:

- none

Blockers before stronger CI adoption:

- parent-context `.dockerignore` coverage for `services` is missing

## 13. Warnings

- `services/database-service/.dockerignore` does not protect the actual validated build context because the context root is `services`
- build context upload was large, which increases CI cost and risk of accidental context drift
- forbidden-dir scan was not empty, but findings were pre-existing local ignored/generated noise:
  - `apps/backend/target`
  - `apps/frontend/.next`
  - `apps/frontend/node_modules`
  - `apps/mobile/.dart_tool`
  - `apps/mobile/build`
  - `services/database-service/.venv`
  - `services/database-service/database_service/__pycache__`
  - `services/database-service/orders_pars/__pycache__`
  - `services/orchestrator/.pytest_cache`
  - `services/orchestrator/.venv`
  - `services/orchestrator/src/.../__pycache__`
  - `services/orchestrator/tests/__pycache__`

## 14. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -7`
- `docker --version`
- `docker compose version`
- `Get-Content services/database-service/Dockerfile`
- `Get-Content services/database-service/docker-compose.yml`
- `Get-Content services/database-service/.dockerignore`
- `Get-Content services/database-service/requirements.txt`
- `docker compose -f services/database-service/docker-compose.yml config`
- `docker build -f services/database-service/Dockerfile -t warehub-database-service:slice-5b-validation services`
- `docker image inspect warehub-database-service:slice-5b-validation`
- `docker image ls warehub-database-service`
- `docker image rm warehub-database-service:slice-5b-validation`
- `docker image ls warehub-database-service`
- `git diff --stat`
- `Get-ChildItem services -Force | Where-Object { $_.Name -eq '.dockerignore' } | Select-Object FullName,Length`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
- final `git status --short`

## 15. Proposed Next Slices

- `Slice 5C`: narrow discovery/fix slice for parent-context Docker hygiene for `services`, focused on `.dockerignore` effectiveness and context size reduction
- `Slice 5D`: validate `services/orchestrator` Docker build separately before any Docker-build CI expansion
- only after one more service build validation: consider a CI-only slice to add a single Docker build check
