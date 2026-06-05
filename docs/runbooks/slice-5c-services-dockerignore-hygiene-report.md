# Slice 5C — Services Dockerignore Hygiene Report

## 1. Summary

`services/.dockerignore` was added for the effective `services` Docker build context used by `services/database-service`.

After adding it:

- `docker compose -f services/database-service/docker-compose.yml config` still passed
- `database-service` Docker build still passed
- temporary validation image was inspected successfully
- temporary validation image was removed successfully

This slice changed only:

- `services/.dockerignore`
- this report file

No containers were started. No `docker compose up/down` was run. No Dockerfiles, compose files, runtime code, or dependency files were changed.

## 2. Git State

- Working directory: `I:\WareHub`
- Branch: `feature/slice-5c-services-dockerignore-hygiene`
- Preflight `git status --short`: clean
- `HEAD` included `d8f245c Merge pull request #36 from RavilkaDev0/feature/slice-5b-database-service-docker-build-validation`

## 3. Files Changed

- `services/.dockerignore` -> added
- `docs/runbooks/slice-5c-services-dockerignore-hygiene-report.md` -> added

## 4. services/.dockerignore Policy

Added conservative deny rules for generated files, local artifacts, caches, and secrets:

- `.git`
- `.gitignore`
- `**/.env`
- `**/.env.*`
- allowlist:
  - `!**/.env.example`
  - `!**/.env.*.example`
- Python env/cache noise:
  - `**/.venv`
  - `**/venv`
  - `**/env`
  - `**/__pycache__`
  - `**/.pytest_cache`
  - `**/.ruff_cache`
  - `**/.mypy_cache`
  - `**/*.pyc`
  - `**/*.pyo`
- frontend/build noise:
  - `**/node_modules`
  - `**/.next`
  - `**/dist`
  - `**/build`
  - `**/coverage`
- OS noise:
  - `**/.DS_Store`
  - `**/Thumbs.db`
- misc context noise:
  - `docs`
  - `runbooks`
  - `*.log`

Explicitly preserved by policy:

- `database-service/requirements.txt`
- `database-service/**`
- `orchestrator/requirements.txt`
- `orchestrator/**`
- Dockerfiles
- `.env.example` files

## 5. Build Context Hygiene Rationale

`Slice 5B` proved that the build contract for `database-service` uses:

```powershell
docker build -f services/database-service/Dockerfile ... services
```

That means Docker uses `services/.dockerignore`, not `services/database-service/.dockerignore`.

Before this slice:

- `services/.dockerignore` -> `Not found`
- service-local ignore rules did not protect the actual parent context

After this slice:

- effective parent-context ignore rules exist
- the build contract remains unchanged
- build hygiene is materially improved without touching service code or Dockerfiles

## 6. Compose Config Result

`docker compose -f services/database-service/docker-compose.yml config` passed successfully.

Confirmed:

- context resolves to `I:\WareHub\services`
- Dockerfile resolves to `database-service/Dockerfile`
- runtime command remains `python manage.py runserver 0.0.0.0:8000`
- no auto-migrate command introduced

## 7. Docker Build Command

Executed from repo root:

```powershell
docker build -f services/database-service/Dockerfile -t warehub-database-service:slice-5c-dockerignore-validation services
```

## 8. Docker Build Result

Build passed successfully.

Observed:

- `load .dockerignore` used the new parent-context file
- build context transfer dropped to approximately `16.24kB`
- build reused cached dependency layers
- final image was tagged successfully as `warehub-database-service:slice-5c-dockerignore-validation`

Final image id from `docker image inspect`:

- `sha256:7597e61a20acee3a452d7c74347dc8bc4d395b4f1bd08f309e88150285ac4da4`

## 9. Image Inspect Result

`docker image inspect warehub-database-service:slice-5c-dockerignore-validation` passed successfully.

Confirmed:

- image exists
- `WorkingDir` -> `/app`
- `Cmd`:
  - `python`
  - `manage.py`
  - `runserver`
  - `0.0.0.0:8000`
- `ExposedPorts` contains `8000/tcp`
- no explicit `Entrypoint`

## 10. Temporary Image Cleanup Result

Cleanup command:

```powershell
docker image rm warehub-database-service:slice-5c-dockerignore-validation
```

Result:

- untag succeeded
- delete succeeded

Post-cleanup:

- `docker image ls warehub-database-service` returned no tagged image rows

## 11. Context Size / Hygiene Notes

The main measurable improvement in this slice:

- previous validated build context transfer in `Slice 5B` was approximately `130MB`
- current validated build context transfer was approximately `16.24kB`

Interpretation:

- parent-context noise is now largely excluded
- local `.venv`, caches, frontend artifacts, and env files are no longer riding along in the `services` Docker context
- this makes the `database-service` build safer and cheaper for future CI consideration

## 12. CI Readiness Recommendation

Current state:

- `database-service` Docker build is now safer for CI consideration than it was in `Slice 5B`

Conservative recommendation:

- validate `services/orchestrator` Docker build first in a separate narrow slice before any Docker-build CI expansion

Alternative, if risk appetite is higher:

- add `database-service` Docker build check to CI as non-required first

Recommended conservative path:

- `Slice 5D` -> validate `services/orchestrator` Docker build

## 13. Blockers

- none for this slice

## 14. Warnings

- `services/.dockerignore` is intentionally conservative; any future service build that depends on generated local artifacts inside `services` would need explicit review
- forbidden-dir scan was not empty, but findings are pre-existing local ignored/generated noise:
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
- `git diff --stat` does not show new untracked files, so the report file appears in `git status --short` but not in diff stat

## 15. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -7`
- `docker --version`
- `docker compose version`
- `Get-ChildItem services -Force`
- `Get-Content services/database-service/Dockerfile`
- `Get-Content services/database-service/docker-compose.yml`
- `Get-Content services/database-service/.dockerignore`
- `Get-Content services/orchestrator/Dockerfile`
- `Get-Content services/orchestrator/requirements.txt`
- `Get-Content services/.dockerignore`
- `docker compose -f services/database-service/docker-compose.yml config`
- `docker build -f services/database-service/Dockerfile -t warehub-database-service:slice-5c-dockerignore-validation services`
- `docker image inspect warehub-database-service:slice-5c-dockerignore-validation`
- `docker image rm warehub-database-service:slice-5c-dockerignore-validation`
- `docker image ls warehub-database-service`
- `git diff --stat`
- `git diff -- services/.dockerignore`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
- final `git status --short`

## 16. Proposed Next Slices

- `Slice 5D`: validate `services/orchestrator` Docker build
- then, depending on risk appetite:
  - add `database-service` Docker build check to CI as non-required first
  - or validate one more service build before any CI Docker-build expansion
