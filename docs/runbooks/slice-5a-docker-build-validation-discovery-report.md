# Slice 5A - Docker Build Validation Discovery Report

## 1. Summary

This slice inventoried the Docker build surface of the WareHub monorepo before adding any Docker build checks.

Required conclusions:

- no Docker images were built
- no containers were started
- no workflow, code, compose, or Dockerfile files were changed
- Docker build validation should be added only one service at a time
- the first build-validation slice should target the lowest-risk candidate discovered here

## 2. Git State

- repository path: `I:\WareHub`
- branch: `feature/slice-5a-docker-build-validation-discovery`
- preflight working tree: clean
- `HEAD` contains stage merge Slice 4R:
  - `ea35108 Merge pull request #34 from RavilkaDev0/feature/slice-4r-remove-rust-backend-metadata-job`

Final git state after this slice:

- one new report file only

## 3. Docker Tooling Versions

- `docker --version`
  - `Docker version 29.4.3, build 055a478`
- `docker compose version`
  - `Docker Compose version v5.1.3`

## 4. Dockerfile Inventory

Dockerfiles found:

1. `apps/backend/Dockerfile`
   - intended target: Rust backend
   - stages: `dev`, `builder`, `stage`, `prod`
   - likely build context: `apps/backend`
   - key COPY paths:
     - `Cargo.toml`
     - `Cargo.lock`
     - `migrations`
     - `src`
   - dependency install/build:
     - `cargo build --release`
   - exposed port:
     - `8932`
   - final command:
     - `/usr/local/bin/sofortbot-backend`
   - obvious risks:
     - Rust release build is heavier than metadata-only checks
     - requires full cargo dependency/network resolution during build
     - dev stage uses `cargo run`, which is not a CI-safe runtime validation by itself

2. `apps/frontend/Dockerfile`
   - intended target: Next.js frontend
   - stages: `deps`, `dev`, `builder`, `stage`, `prod`
   - likely build context: `apps/frontend`
   - key COPY paths:
     - `package*.json*`
     - full source tree via `COPY . .`
   - dependency install/build:
     - `npm ci` or fallback `npm install`
     - `npm run build`
   - exposed port:
     - `8931`
   - final commands:
     - dev: `npm run dev -- --port 8931`
     - stage/prod: `npm run start -- --port 8931`
   - obvious risks:
     - broad `COPY . .`
     - build requires Node package install
     - build depends on frontend build contract remaining green inside Docker
     - fallback `npm install` makes build path less deterministic than `npm ci`-only

3. `apps/mobile/Dockerfile`
   - intended target: Flutter web mobile build/runtime
   - stages: `dev`, `builder`, `stage`, `prod`
   - likely build context: `apps/mobile`
   - key COPY paths:
     - full source tree via `COPY . .`
   - dependency install/build:
     - `flutter pub get`
     - `flutter test`
     - `flutter build web --release`
   - exposed port:
     - `8081`
   - final runtime:
     - dev: `flutter run -d web-server`
     - stage/prod: nginx serving built web output
   - obvious risks:
     - Flutter version in Dockerfile is `3.41.1`, while validated CI slice used `3.41.4`
     - Docker build would run tests and web build, which is high surface area
     - broad `COPY . .`
     - web build path not yet validated in Phase 4

4. `infra/Dockerfile`
   - intended target: infra utility container
   - stages: `dev`, `stage`, `prod`
   - likely build context: `infra`
   - key COPY paths:
     - none
   - dependency install/build:
     - `apk add --no-cache bash curl jq docker-cli`
   - exposed ports:
     - none
   - final commands:
     - idle utility container commands with `tail -f /dev/null`
   - obvious risks:
     - no app logic, but not a product runtime image
     - validation value is mostly package-install reproducibility
     - not a priority candidate for product build validation

5. `services/database-service/Dockerfile`
   - intended target: Django database-service
   - likely build context: `services`
   - key COPY paths:
     - `database-service/requirements.txt`
     - `database-service`
   - dependency install/build:
     - `pip install -r /app/requirements.txt`
   - exposed port:
     - `8000`
   - final command:
     - `python manage.py runserver 0.0.0.0:8000`
   - obvious risks:
     - build context must be `services`, not repo root and not service directory itself
     - pip install requires Python package network access
     - runtime command is local/dev flavored, but build surface itself is relatively narrow

6. `services/orchestrator/Dockerfile`
   - intended target: FastAPI orchestrator
   - likely build context: `services/orchestrator`
   - key COPY paths:
     - `requirements.txt`
     - full service tree via `COPY . .`
   - dependency install/build:
     - `pip install -r requirements.txt`
   - exposed port:
     - `8011`
   - final command:
     - `uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8011`
   - obvious risks:
     - broad `COPY . .`
     - pip install requires network access
     - build context assumptions need explicit validation before CI adoption

## 5. Compose File Inventory

Compose files found:

1. `infra/local/docker-compose.dev.yml`
   - services:
     - `warehub-postgres`
     - `warehub-redis`
     - `warehub-minio`
     - `warehub-rabbitmq`
   - build contexts:
     - none
   - images:
     - postgres, redis, minio, rabbitmq official images
   - ports:
     - postgres `8933`
     - redis `8936`
     - minio `9000/9001`
     - rabbitmq `8937/15672`
   - volumes:
     - named volumes only
   - env_file usage:
     - none
   - depends_on:
     - none
   - command overrides:
     - redis, minio
   - config result:
     - passes

2. `services/database-service/docker-compose.yml`
   - services:
     - `database-service-db`
     - `database-service`
   - build contexts:
     - `context: ..`
   - dockerfile paths:
     - `database-service/Dockerfile`
   - images:
     - postgres official image for db
   - ports:
     - db `8543`
     - app `8934`
   - volumes:
     - named postgres volume
     - bind mount `.:/app`
   - env_file usage:
     - none
   - depends_on:
     - app depends on db healthy
   - command overrides:
     - app runs `python manage.py runserver`
   - config result:
     - passes

3. `infra/deploy/stage/docker-compose.yml`
   - services:
     - `postgres`
     - `backend`
     - `frontend`
     - `mobile`
     - `services`
     - `orchestrator`
   - build contexts:
     - none, image-based compose
   - dockerfile paths:
     - none
   - images:
     - all app services use env-driven image names/tags
   - ports:
     - env-driven
   - volumes:
     - postgres data
     - orchestrator data
   - env_file usage:
     - none
   - depends_on:
     - backend/services on postgres
     - orchestrator on services
   - command overrides:
     - services runs conditional migrate-then-runserver shell command
   - config result:
     - passes with many blank-variable warnings

4. `infra/deploy/prod/docker-compose.yml`
   - services:
     - `postgres`
     - `backend`
     - `frontend`
     - `mobile`
     - `services`
     - `orchestrator`
   - build contexts:
     - none, image-based compose
   - dockerfile paths:
     - none
   - images:
     - all app services use env-driven image names/tags
   - ports:
     - env-driven
   - volumes:
     - postgres data
     - orchestrator data
   - env_file usage:
     - none
   - depends_on:
     - backend/services on postgres
     - orchestrator on services
   - command overrides:
     - services runs conditional migrate-then-runserver shell command
   - config result:
     - passes with many blank-variable warnings

5. `infra/deploy/runners/docker-compose.yml`
   - services:
     - `runner-backend-ci`
     - `runner-backend-cd`
   - build contexts:
     - none
   - dockerfile paths:
     - none
   - images:
     - `gitea/act_runner:latest`
   - ports:
     - none
   - volumes:
     - bind mounts to runner data dirs
     - bind mount to `/var/run/docker.sock`
   - env_file usage:
     - none
   - depends_on:
     - none
   - command overrides:
     - shell-based runner registration flow
   - config result:
     - passes with blank-variable warnings

## 6. Compose Config Validation Results

`docker compose config` results:

- `infra/local/docker-compose.dev.yml`
  - passed cleanly
- `services/database-service/docker-compose.yml`
  - passed cleanly
- `infra/deploy/stage/docker-compose.yml`
  - passed with many env-default warnings and blank image/tag/port placeholders
- `infra/deploy/prod/docker-compose.yml`
  - passed with many env-default warnings and blank image/tag/port placeholders
- `infra/deploy/runners/docker-compose.yml`
  - passed with blank runner env warnings

Interpretation:

- local and database-service compose files are already good candidates for static CI validation
- stage/prod/runners compose files are syntactically parseable, but they are not ready for meaningful build validation without environment context

## 7. .dockerignore Inventory

`.dockerignore` files found:

1. `apps/backend/.dockerignore`
   - likely scope: `apps/backend`
   - excludes:
     - `.git`
     - `.github`
     - `node_modules`
     - `target`
     - `dist`
     - `build`
     - `.next`
     - `coverage`
     - `.env`
     - `.env.*`
   - gaps:
     - no explicit `__pycache__`, `.venv`, `.dart_tool`

2. `apps/frontend/.dockerignore`
   - likely scope: `apps/frontend`
   - excludes:
     - `.git`
     - `.github`
     - `node_modules`
     - `.next`
     - `dist`
     - `build`
     - `coverage`
     - `.env`
     - `.env.*`
   - gaps:
     - no explicit `.venv`, `target`, `.dart_tool`, `__pycache__`

3. `apps/mobile/.dockerignore`
   - likely scope: `apps/mobile`
   - excludes:
     - `.git`
     - `.github`
     - `.dart_tool`
     - `build`
     - `coverage`
     - `.env`
     - `.env.*`
   - additional Flutter ignores:
     - `.flutter-plugins`
     - `.flutter-plugins-dependencies`
     - `.pub-cache`
     - `.pub`
   - gaps:
     - no explicit `node_modules`, `target`, `.venv`, `__pycache__`

4. `infra/.dockerignore`
   - likely scope: `infra`
   - excludes:
     - `.git`
     - `.github`
     - `.env`
     - `.env.*`
   - gaps:
     - no explicit exclusion for many generated directories

5. `services/database-service/.dockerignore`
   - likely scope: `services/database-service`
   - excludes:
     - `venv`
     - `__pycache__`
     - `*.pyc`
     - `*.sqlite3`
     - `.env`
     - `**/.env`
     - `*.local`
     - `*.secret`
     - `*secret*`
     - `*password*`
     - `*credential*`
     - `*token*`
     - `*.pem`
     - `*.key`
     - `db.sqlite3`
     - `.pytest_cache`
   - strong secret/noise filtering, but:
     - Dockerfile build context is `services`, so this file alone may not protect a parent-context build unless Docker resolves it from the Dockerfile directory as expected

## 8. Build Context and Path Risk Analysis

Key path/build-context findings:

- `services/database-service`
  - relatively coherent now after earlier bootstrap-contract slices
  - critical assumption: build context must be `services`
  - this is currently reflected by its compose file and Dockerfile COPY paths

- `services/orchestrator`
  - simple Dockerfile, but no service-local compose file to anchor build context
  - broad `COPY . .` raises medium risk

- `apps/backend`
  - Dockerfile paths appear monorepo-consistent within `apps/backend`
  - release build is heavier and more expensive than Python service builds
  - candidate is valid, but not the lowest-risk first build

- `apps/frontend`
  - broad `COPY . .`
  - builder runs `npm run build`
  - includes fallback `npm install`, which is less deterministic
  - higher risk than the Python services for first build validation

- `apps/mobile`
  - Dockerfile contains `flutter pub get`, `flutter test`, and `flutter build web --release`
  - Dockerfile Flutter version `3.41.1` does not match validated CI Flutter `3.41.4`
  - highest application-level risk among app Dockerfiles

- `infra/deploy/stage` and `infra/deploy/prod`
  - image-based deploy compose only
  - not Docker build candidates themselves
  - they reveal env dependency and startup command risks, especially migration-on-startup toggles

- `infra/deploy/runners`
  - runner-registration compose, not an app build candidate
  - depends on docker socket and runner credentials

- `infra/Dockerfile`
  - utility image only
  - low complexity but lower product value for initial build validation

## 9. Environment and Secret Handling Risks

Observed risks:

- stage/prod compose files resolve many environment variables to blank strings during `config`
- stage/prod image references become `':'` without proper image/tag env values
- stage/prod backend/services env sections contain sensitive integration placeholders for uploads and marketplace credentials
- stage/prod services compose still contains a conditional migration-on-startup command path, which is a production/deploy concern and not suitable for early build validation
- runners compose depends on Gitea runner registration secrets and host Docker socket

Positive findings:

- env scan found only `.env.example` / `.env.*.example`
- no real `.env` files were created or changed in this slice
- several `.dockerignore` files explicitly exclude `.env` and common secret patterns

## 10. Build Candidate Classification

Classification based on discovery:

### A. Low-risk candidate for first Docker build validation slice

- `services/database-service`
  - strongest current candidate
  - build context/path contract already clarified earlier
  - service-local compose already points to this build
  - Python build surface is narrower than frontend/mobile/backend multi-stage flows

### B. Medium-risk, needs context/path check first

- `services/orchestrator`
  - simple Python Dockerfile, but no compose-backed build contract
- `apps/backend`
  - monorepo-local paths look consistent, but release Rust build is heavier
- `infra/Dockerfile`
  - simple utility image, but lower validation priority for product flows

### C. High-risk, do not build yet

- `apps/frontend`
  - broad copy, npm install/build path, more moving pieces
- `apps/mobile`
  - Flutter web build path, embedded test step, version mismatch with validated CI Flutter
- `infra/deploy/stage/docker-compose.yml`
  - deploy-only, env-heavy, migration/startup risk
- `infra/deploy/prod/docker-compose.yml`
  - deploy-only, env-heavy, production-sensitive
- `infra/deploy/runners/docker-compose.yml`
  - runner registration + Docker socket + credentials

## 11. Recommended Docker Validation Sequence

Recommended narrow sequence:

1. `Slice 5B`: validate `services/database-service` Docker build only
2. `Slice 5C`: validate `services/orchestrator` Docker build only
3. `Slice 5D`: validate `apps/backend` Docker build only
4. `Slice 5E`: validate `apps/frontend` Docker build only
5. `Slice 5F`: validate `apps/mobile` Docker build only
6. `Slice 5G`: compose build policy / CI Docker build plan

This order is based on actual discovery risk, not on guessing by service importance.

## 12. CI Integration Recommendation

CI integration should be incremental:

- do not add broad Docker build checks across the monorepo at once
- validate one image at a time in isolated slices
- only after a service build is proven locally should it be considered for CI
- deploy compose files should remain outside early Docker build validation

Recommended first CI-oriented build candidate after local validation:

- `services/database-service`

## 13. Blockers

No blockers for this discovery slice itself.

Potential blockers for later build-validation slices:

- stage/prod compose files require many environment variables for meaningful use
- frontend build path remains more complex and dependency-heavy
- mobile Dockerfile uses Flutter `3.41.1`, while validated CI used `3.41.4`
- runners compose depends on credentials and host Docker socket

## 14. Warnings

- `infra/deploy/stage/docker-compose.yml`, `infra/deploy/prod/docker-compose.yml`, and `infra/deploy/runners/docker-compose.yml` all pass `docker compose config`, but only with many blank-variable warnings
- forbidden-dir scan is not empty, but findings are local ignored/generated noise and non-blocking:
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
- `docker --version`
- `docker compose version`
- `Get-ChildItem -Recurse -Force -File -Filter Dockerfile | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match 'Dockerfile|dockerfile|\.dockerfile$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -File | Where-Object { ($_.Name -match 'docker-compose|compose') -and ($_.Extension -in @('.yml','.yaml')) } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -File -Filter .dockerignore | Select-Object FullName`
- `rg -n "build:|context:|dockerfile:|image:|env_file:|ports:|volumes:|depends_on:|command:" . --glob "*compose*.yml" --glob "*compose*.yaml" --glob "*docker-compose*.yml" --glob "*docker-compose*.yaml"`
- `rg -n "FROM |COPY |RUN |CMD |ENTRYPOINT |EXPOSE |WORKDIR |ARG |ENV " . --glob "Dockerfile" --glob "*.dockerfile"`
- `Get-Content` for all found Dockerfiles
- `Get-Content` for all found compose files
- `Get-Content` for all found `.dockerignore` files
- `docker compose -f infra/local/docker-compose.dev.yml config`
- `docker compose -f services/database-service/docker-compose.yml config`
- `docker compose -f infra/deploy/stage/docker-compose.yml config`
- `docker compose -f infra/deploy/prod/docker-compose.yml config`
- `docker compose -f infra/deploy/runners/docker-compose.yml config`
- `cargo metadata --no-deps`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`

## 16. Proposed Next Slices

- `Slice 5B`: validate `services/database-service` Docker build only
- `Slice 5C`: validate `services/orchestrator` Docker build only
- `Slice 5D`: validate `apps/backend` Docker build only
- `Slice 5E`: validate `apps/frontend` Docker build only
- `Slice 5F`: validate `apps/mobile` Docker build only
