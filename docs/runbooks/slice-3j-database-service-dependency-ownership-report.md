# Slice 3J — Database-Service Dependency Ownership Report

## 1. Summary

Slice 3J introduced explicit service-local dependency ownership for `services/database-service`.

Selected decision:

- Variant B
- `database-service` now owns its bootstrap dependency manifest at `services/database-service/requirements.txt`

Result:

- service-local dependency manifest created
- Dockerfile switched from shared `services/requirements.txt` to service-local `services/database-service/requirements.txt`
- service-local compose contract remains monorepo-safe
- local documentation updated to reflect the new ownership boundary
- shared `services/requirements.txt` was left unchanged

## 2. Files Changed

- `services/database-service/requirements.txt`
- `services/database-service/Dockerfile`
- `services/database-service/README.md`
- `docs/runbooks/local-dev.md`
- `docs/runbooks/slice-3j-database-service-dependency-ownership-report.md`

## 3. Decision

Decision:

- move `database-service` bootstrap dependency ownership to a service-local manifest

Explicit policy:

- `services/database-service/requirements.txt` is now the source of truth for `database-service` Docker/local bootstrap
- `services/requirements.txt` remains in the repo and was not modified in this slice
- `services/orchestrator/requirements.txt` remains separate and unchanged

Reasoning:

- this makes `database-service` more autonomous inside the monorepo
- it reduces hidden coupling between `database-service` and the broader `services` area
- it avoids breaking `orchestrator` or forcing a larger dependency split in the same slice

## 4. New Dependency Manifest

Created:

- `services/database-service/requirements.txt`

Contents:

- copied from the current `services/requirements.txt` baseline
- prefixed with ownership comments:
  - `# Database-service dependency manifest.`
  - `# Source of truth for services/database-service Docker/local bootstrap.`
  - `# Initially split from services/requirements.txt during monorepo migration.`
  - `# Do not add secrets here.`

Current limitation:

- this is an ownership split, not a dependency cleanup slice
- the manifest was intentionally copied as baseline to avoid accidental breakage

## 5. Dockerfile Update

Updated:

- `services/database-service/Dockerfile`

New contract with build context `services`:

- `COPY database-service/requirements.txt /app/requirements.txt`
- `RUN pip install --no-cache-dir -r /app/requirements.txt`
- `COPY database-service /app`
- `WORKDIR /app`

Constraints preserved:

- no migrations in Dockerfile
- no auto-migrate in `CMD`
- no runtime Python code change

## 6. Compose Contract

Observed compose file:

- `services/database-service/docker-compose.yml`

Confirmed contract remains:

- build context `..`
- Dockerfile `database-service/Dockerfile`
- local/dev only
- no auto-migrate command
- no real env files
- no stage/prod paths

Compose validation result:

- `docker compose -f services/database-service/docker-compose.yml config` succeeded
- resolved build context is `I:\WareHub\services`
- resolved Dockerfile is `database-service/Dockerfile`

## 7. Documentation Changes

Updated:

- `services/database-service/README.md`
- `docs/runbooks/local-dev.md`

What changed:

- documented that dependency source of truth is now `services/database-service/requirements.txt`
- documented that `services/requirements.txt` is no longer the source of truth for `database-service` bootstrap
- kept build context as `services`
- kept Dockerfile path as `database-service/Dockerfile`
- kept migrations manual-only and not auto-run
- kept compose guidance local/dev only

## 8. Validation Results

Commands run:

- `git status --short`
- file existence checks for:
  - `services/database-service/requirements.txt`
  - `services/database-service/Dockerfile`
  - `services/database-service/manage.py`
  - `services/database-service/docker-compose.yml`
- `docker compose -f services/database-service/docker-compose.yml config`
- `rg -n "services/requirements.txt|services/database_service|sofortbot-services|sofortbot-infra|F:\\SofortBOT|python manage.py migrate|migrate &&|&& python manage.py migrate" services/database-service/requirements.txt services/database-service/Dockerfile services/database-service/docker-compose.yml services/database-service/README.md docs/runbooks/local-dev.md`
- env scan
- forbidden dirs scan

Results:

- expected changed files detected by `git status --short`
- all required files exist
- compose config succeeded
- `rg` returned only expected historical note matches for `services/requirements.txt`
- no `services/database_service`
- no old `sofortbot-*` or `F:\SofortBOT` path references in changed files
- no auto-migrate command remained in changed files
- env scan found only `.env.example` / `.env.*.example`
- forbidden dirs scan was empty

## 9. Remaining Limitations

- `services/requirements.txt` still exists and may continue to serve other legacy or shared workflows outside this slice
- the new service-local manifest is baseline-copied and not yet minimized to proven service-only dependencies
- host-local manual install/start commands remain conservative and partially undocumented by design

## 10. Risks

- dependency drift can emerge later if `services/requirements.txt` and `services/database-service/requirements.txt` evolve independently without policy
- future cleanup of duplicated dependencies needs a separate controlled slice with evidence
- the service-local compose contract is local/dev only and must not be reused as deploy guidance

## 11. Next Step

Recommended next slice:

- a narrow dependency cleanup/audit slice for `services/database-service/requirements.txt`

Suggested goal:

- determine which copied dependencies are truly required by `database-service`
- keep `orchestrator` and shared workflows untouched
- update docs only after evidence-based cleanup
