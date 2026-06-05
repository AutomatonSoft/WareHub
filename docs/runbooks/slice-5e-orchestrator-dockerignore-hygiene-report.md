# Slice 5E — Orchestrator Dockerignore Hygiene Report

## 1. Summary

`services/orchestrator/.dockerignore` was added for the effective service-local Docker build context used by `services/orchestrator`.

After adding it:

- orchestrator Docker build still passed
- `docker image inspect` still confirmed the expected runtime command and exposed port
- temporary validation image was removed successfully

This slice changed only:

- `services/orchestrator/.dockerignore`
- this report file

No containers were started. No `docker compose up/down` was run. No Dockerfiles, compose files, source code, or dependency files were changed.

## 2. Git State

- Working directory: `I:\WareHub`
- Branch: `feature/slice-5e-orchestrator-dockerignore-hygiene`
- Preflight `git status --short`: clean
- `HEAD` included `a1062aa Merge pull request #38 from RavilkaDev0/feature/slice-5d-orchestrator-docker-build-validation`

## 3. Files Changed

- `services/orchestrator/.dockerignore` -> added
- `docs/runbooks/slice-5e-orchestrator-dockerignore-hygiene-report.md` -> added

## 4. services/orchestrator/.dockerignore Policy

Added conservative service-local ignore rules for generated files, local artifacts, and secrets:

- `.git`
- `.gitignore`
- `.env`
- `.env.*`
- allowlist:
  - `!.env.example`
  - `!.env.*.example`
- Python env/cache noise:
  - `.venv`
  - `venv`
  - `env`
  - `__pycache__`
  - `.pytest_cache`
  - `.ruff_cache`
  - `.mypy_cache`
  - `*.pyc`
  - `*.pyo`
- frontend/build noise:
  - `node_modules`
  - `.next`
  - `dist`
  - `build`
  - `coverage`
- OS/misc noise:
  - `.DS_Store`
  - `Thumbs.db`
  - `*.log`

Explicitly preserved by policy:

- `requirements.txt`
- `src/**`
- `tests/**`
- `Dockerfile`
- `.env.example` files
- any config/pyproject-style files if added later

## 5. Build Context Hygiene Rationale

`Slice 5D` proved that orchestrator Docker build is a service-local-context build because the Dockerfile uses:

- `COPY requirements.txt ./`
- `COPY . .`

That means the effective Docker context is:

- `services/orchestrator`

Before this slice:

- `services/orchestrator/.dockerignore` -> `Not found`
- local `.venv`, `.pytest_cache`, `data`, and other local noise could ride along in context upload

After this slice:

- orchestrator has an effective service-local `.dockerignore`
- the Dockerfile contract remains unchanged
- context hygiene is materially improved without touching Dockerfile or source

## 6. Docker Build Command

Executed from repo root:

```powershell
docker build -f services/orchestrator/Dockerfile -t warehub-orchestrator:slice-5e-dockerignore-validation services/orchestrator
```

## 7. Docker Build Result

Build passed successfully.

Observed:

- `load .dockerignore` now used the new service-local file
- build context transfer dropped to approximately `7.58kB`
- cached dependency layers were reused
- final image was tagged successfully as `warehub-orchestrator:slice-5e-dockerignore-validation`

Final image id from inspect:

- `sha256:c78eafcb57bf7a3b0b2888e4f61304487a7b901270db24e03e9b5a836ee93d4e`

## 8. Image Inspect Result

`docker image inspect warehub-orchestrator:slice-5e-dockerignore-validation` passed successfully.

Confirmed:

- image exists
- `WorkingDir` -> `/app`
- `Cmd`:
  - `uvicorn`
  - `src.sofort_orchestrator.main:app`
  - `--host`
  - `0.0.0.0`
  - `--port`
  - `8011`
- `Entrypoint` -> `Not found`
- `ExposedPorts` contains `8011/tcp`

## 9. Temporary Image Cleanup Result

Cleanup command:

```powershell
docker image rm warehub-orchestrator:slice-5e-dockerignore-validation
```

Result:

- untag succeeded
- image delete succeeded

Post-cleanup:

- `docker image ls warehub-orchestrator` returned no tagged image rows

## 10. Context Size / Hygiene Notes

The main measurable improvement in this slice:

- previous validated build context transfer in `Slice 5D` was approximately `29.66MB`
- current validated build context transfer was approximately `7.58kB`

Interpretation:

- service-local generated noise is now largely excluded
- local `.venv`, `.pytest_cache`, logs, and similar artifacts are no longer riding along in the orchestrator Docker context
- orchestrator Docker build is now safer and cheaper for CI consideration

## 11. CI Readiness Recommendation

Current state:

- orchestrator Docker build is now safer for CI consideration than it was in `Slice 5D`

Recommended next step:

- `Slice 5F`: add `database-service` + `orchestrator` Docker build checks to CI as non-required initial Docker validation jobs

More conservative alternative:

- validate `apps/backend` Docker build first before any CI Docker-build expansion

## 12. Blockers

- none for this slice

## 13. Warnings

- `services/.dockerignore` remains irrelevant for orchestrator builds because the orchestrator contract is service-local, not parent-context
- forbidden-dir scan was not empty, but findings are pre-existing local ignored/generated noise:
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
- `git diff --stat` does not show new untracked files, so the report file appears in `git status --short` but not in diff stat

## 14. Commands Run

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -7`
- `docker --version`
- `docker compose version`
- `Get-ChildItem services/orchestrator -Force`
- `Get-Content services/orchestrator/Dockerfile`
- `Get-Content services/orchestrator/requirements.txt`
- `Get-Content services/.dockerignore`
- `Test-Path services/orchestrator/.dockerignore`
- `docker build -f services/orchestrator/Dockerfile -t warehub-orchestrator:slice-5e-dockerignore-validation services/orchestrator`
- `docker image inspect warehub-orchestrator:slice-5e-dockerignore-validation`
- `docker image rm warehub-orchestrator:slice-5e-dockerignore-validation`
- `docker image ls warehub-orchestrator`
- `git diff --stat`
- `git diff -- services/orchestrator/.dockerignore`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
- final `git status --short`

## 15. Proposed Next Slices

- `Slice 5F`: add `database-service` + `orchestrator` Docker build checks to CI as non-required initial Docker validation jobs
- or, if staying more conservative:
  - validate `apps/backend` Docker build first
