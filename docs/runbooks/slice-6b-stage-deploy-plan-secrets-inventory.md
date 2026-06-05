# Slice 6B - Stage Deploy Plan And Secrets Inventory

## 1. Scope

- Goal: planning-only stage deploy plan and authoritative secrets/env inventory based on current repository state.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This report is factual and based only on inspected repository files.
- Unknown values are marked as `TODO / unknown`, `placeholder`, or `needs decision`.

## 2. Inputs Inspected

- `docs/runbooks/slice-6a-deploy-discovery-report.md`
- `docs/ci-cd/branching-and-release-policy.md`
- `docs/ci-cd/deployment-policy.md`
- `docs/ci-cd/secret-policy.md`
- `infra/README.md`
- `infra/.env.example`
- `infra/versions.env`
- `infra/up-stage.sh`
- `infra/scripts/release-stage.sh`
- `infra/scripts/enqueue-deploy.sh`
- `infra/scripts/deploy-watcher.sh`
- `infra/scripts/verify-required-env.ps1`
- `infra/scripts/security-preflight.ps1`
- `infra/scripts/ops-preflight.ps1`
- `infra/deploy/stage/docker-compose.yml`
- `infra/deploy/nginx/sofortbot.conf.template`
- `infra/deploy/systemd/INSTALL.md`
- `infra/deploy/systemd/sofortbot-deploy-watcher.service`
- `infra/deploy/runners/INSTALL.md`
- `infra/deploy/runners/.env.example`
- `.github/workflows/ci.yml`
- `README.md`
- `AGENTS.md`

## 3. Current Confirmed CI/CD Baseline

- CI checks currently present in `.github/workflows/ci.yml`:
  - `repo-safety`
  - `compose-config`
  - `database-service`
  - `frontend`
  - `mobile`
  - `orchestrator`
  - `rust-backend`
  - `python-services-docker-build`
  - `frontend-docker-build`
  - `remaining-docker-builds`
- Docker build validation coverage currently present in `.github/workflows/ci.yml`:
  - `services/database-service/Dockerfile`
  - `services/orchestrator/Dockerfile`
  - `apps/frontend/Dockerfile`
  - `apps/backend/Dockerfile`
  - `apps/mobile/Dockerfile`
  - `infra/Dockerfile`
- Current GitHub Actions state is CI-only.
- No deploy workflow exists yet in `.github/workflows/ci.yml`.
- No registry login, image push, SSH, remote rollout, or GitHub Environment deploy gate is implemented in `.github/workflows/ci.yml`.

## 4. Stage Deployment Target Facts

| Item | Value from repo | Status |
|---|---|---|
| stage branch | `stage` | confirmed |
| stage domain | `stagewarehub.automatonsoft.de` in `infra/README.md` and `infra/deploy/nginx/INSTALL.md` | confirmed |
| stage server host/IP | `TODO / unknown` | unknown |
| SSH user | `TODO / unknown` | unknown |
| SSH port | `22` appears as default/example in `infra/README.md` and `infra/scripts/ops-preflight.ps1` remote mode | placeholder |
| deploy path | candidate paths found: `/opt/sofortbot-infra`, `/home/deploy/sofortbot-infra`, `~/sofortbot-infra`, `/home/server/sofotbot/infra`, `/opt/sofortbot/sofortbot-infra` | needs decision |
| deploy method | repo contains two stage deploy patterns: direct `./up-stage.sh` and watcher-based `./scripts/enqueue-deploy.sh --env stage --version ...` | needs decision |
| registry source | inconsistent: `infra/README.md` points to `GHCR`; runner assets are Gitea-specific; `infra/.env.example` uses `ghcr.io/example/...`; older infra docs mention Gitea as operational source of truth | needs decision |
| compose file | `infra/deploy/stage/docker-compose.yml` | confirmed |
| env file path | `.env` from `infra/up-stage.sh`, `infra/scripts/release-stage.sh`, and `infra/README.md` | confirmed |
| rollback method | immutable previous image tag is required by `docs/ci-cd/deployment-policy.md`; stage tags are managed through `BACKEND_STAGE_TAG`, `FRONTEND_STAGE_TAG`, `MOBILE_STAGE_TAG`, `SERVICES_STAGE_TAG` | confirmed |
| healthcheck endpoints | backend: `/healthz`, `/readyz`, `/api/v1/healthz`, `/api/v1/readyz`; orchestrator: `/healthz`, `/readyz`, `/metrics`; services: `/api/v1/healthz`; compose healthchecks exist for `postgres` and `orchestrator` | confirmed |

## 5. Stage Deploy Flow Proposal

This is a safe future flow proposal based on current repository assets. It is not implemented in this slice.

1. Merge the PR into `stage`.
2. Wait for all required CI checks to pass on the `stage` branch state.
3. Build images and make them available through the chosen registry strategy.
4. Resolve the final stage host connection contract:
   - confirmed host/IP
   - confirmed SSH user
   - confirmed remote repo path
5. Connect to the stage host.
6. Update the infra checkout or deploy bundle according to the approved deploy method.
7. Run preflight checks before rollout:
   - security preflight
   - ops preflight
   - required env verification
   - optional migration-plan dry verification
8. Trigger the stage release path:
   - direct mode: `./up-stage.sh <stage-tag>`
   - watcher mode: `./scripts/enqueue-deploy.sh --env stage --version <stage-version>`
9. Run post-deploy checks:
   - `docker compose -f deploy/stage/docker-compose.yml --env-file .env ps`
   - container health status
   - backend/orchestrator/services HTTP health endpoints
   - frontend domain reachability on `https://stagewarehub.automatonsoft.de`
10. Write or update stage smoke signoff evidence.

## 6. Authoritative GitHub Secrets Inventory For Future Stage Deploy

The table below lists future GitHub-side secrets inferred from repository files. Values are intentionally not included.

| Secret name | Required / optional | Source file where need was inferred | Purpose | Value status |
|---|---|---|---|---|
| `STAGE_SSH_HOST` | required | `docs/ci-cd/secret-policy.md` | stage host target for remote deploy connection | must be provided later |
| `STAGE_SSH_USER` | required | `docs/ci-cd/secret-policy.md` | remote deploy user | must be provided later |
| `STAGE_SSH_KEY` | required | `docs/ci-cd/secret-policy.md` | SSH private key for stage host access | must be provided later |
| `STAGE_ENV_FILE` | required | `docs/ci-cd/secret-policy.md` | stage runtime `.env` content or equivalent bundled env secret | must be provided later |
| `REGISTRY_TOKEN` | optional until registry decision is made | `docs/ci-cd/secret-policy.md` | registry authentication if external registry publish/pull is chosen | unknown |
| `GITEA_RUNNER_REGISTRATION_TOKEN` | optional for deploy flow; only required if Gitea runner infrastructure is used | `infra/deploy/runners/.env.example` | register Gitea runners | unknown |
| `STAGE_POSTGRES_PASSWORD` | required at runtime; GitHub storage model not defined yet | `infra/deploy/stage/docker-compose.yml` | stage Postgres password | must be provided later |
| `SERVICES_SECRET_KEY` | required at runtime; GitHub storage model not defined yet | `infra/deploy/stage/docker-compose.yml` | Django service secret key | must be provided later |
| `BACKEND_UPLOAD_FTP_PASS` | optional unless FTP-backed media is used in stage | `infra/deploy/stage/docker-compose.yml`, `infra/README.md` | backend FTP media password | must be provided later |
| `AFTERBUY_JV_PASS` | required if stage backend needs JV Afterbuy integration | `infra/deploy/stage/docker-compose.yml` | JV Afterbuy password | must be provided later |
| `AFTERBUY_XL_PASS` | required if stage backend needs XL Afterbuy integration | `infra/deploy/stage/docker-compose.yml` | XL Afterbuy password | must be provided later |
| `BACKEND_STAGE_SENTRY_DSN` | optional | `infra/deploy/stage/docker-compose.yml`, `infra/README.md` | backend Sentry DSN for stage | must be provided later |
| `FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE` | optional | `infra/deploy/stage/docker-compose.yml` | frontend stage Sentry sampling control | must be provided later |

Notes:

- The repository explicitly names only some future GitHub secret names.
- Runtime env key storage strategy is still unresolved:
  - one bundled secret such as `STAGE_ENV_FILE`
  - per-key GitHub Environment secrets
  - server-managed `.env` outside GitHub
- This report treats `STAGE_ENV_FILE` as the only currently explicit authoritative GitHub-side env bundle secret from repository policy.

## 7. Runtime Env Inventory For Stage

The table below is limited to stage-relevant runtime keys found in `infra/.env.example`, `infra/deploy/stage/docker-compose.yml`, `infra/README.md`, and `infra/scripts/verify-required-env.ps1`.

| Env key | Required / optional / unknown | Source file | Target service if known | Notes |
|---|---|---|---|---|
| `BACKEND_IMAGE` | required | `infra/.env.example`, `infra/deploy/stage/docker-compose.yml` | backend | image repository reference |
| `BACKEND_STAGE_TAG` | required | `infra/README.md`, `infra/scripts/release-stage.sh`, `infra/deploy/stage/docker-compose.yml` | backend | stage image tag |
| `FRONTEND_IMAGE` | required | `infra/.env.example`, `infra/deploy/stage/docker-compose.yml` | frontend | image repository reference |
| `FRONTEND_STAGE_TAG` | required | `infra/README.md`, `infra/scripts/release-stage.sh`, `infra/deploy/stage/docker-compose.yml` | frontend | stage image tag |
| `MOBILE_IMAGE` | required | `infra/.env.example`, `infra/deploy/stage/docker-compose.yml` | mobile | image repository reference |
| `MOBILE_STAGE_TAG` | required | `infra/README.md`, `infra/scripts/release-stage.sh`, `infra/deploy/stage/docker-compose.yml` | mobile | stage image tag |
| `SERVICES_IMAGE` | required | `infra/.env.example`, `infra/deploy/stage/docker-compose.yml` | services | image repository reference |
| `SERVICES_STAGE_TAG` | required | `infra/README.md`, `infra/scripts/release-stage.sh`, `infra/deploy/stage/docker-compose.yml` | services | stage image tag |
| `ORCHESTRATOR_IMAGE` | required | `infra/.env.example`, `infra/scripts/verify-required-env.ps1`, `infra/deploy/stage/docker-compose.yml` | orchestrator | explicitly required by preflight |
| `ORCHESTRATOR_STAGE_TAG` | required | `infra/scripts/verify-required-env.ps1`, `infra/deploy/stage/docker-compose.yml` | orchestrator | explicitly required by preflight |
| `STAGE_POSTGRES_DB` | required | `infra/deploy/stage/docker-compose.yml` | postgres, backend, services | stage DB name |
| `STAGE_POSTGRES_USER` | required | `infra/deploy/stage/docker-compose.yml` | postgres, backend, services | stage DB user |
| `STAGE_POSTGRES_PASSWORD` | required | `infra/deploy/stage/docker-compose.yml` | postgres, backend, services | secret-bearing |
| `STAGE_POSTGRES_PORT` | required | `infra/.env.example`, `infra/deploy/stage/docker-compose.yml` | postgres | published host port |
| `STAGE_BACKEND_PORT` | required | `infra/.env.example`, `infra/deploy/stage/docker-compose.yml` | backend | published host port |
| `STAGE_FRONTEND_PORT` | required | `infra/.env.example`, `infra/deploy/stage/docker-compose.yml` | frontend | published host port |
| `STAGE_SERVICES_PORT` | required | `infra/.env.example`, `infra/deploy/stage/docker-compose.yml` | services | published host port |
| `STAGE_ORCHESTRATOR_PORT` | required | `infra/.env.example`, `infra/deploy/stage/docker-compose.yml` | orchestrator | published host port |
| `STAGE_PUBLIC_API_BASE_URL` | required | `infra/.env.example`, `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | frontend | public stage backend base URL |
| `STAGE_PUBLIC_SERVICES_API_BASE_URL` | required | `infra/.env.example`, `infra/README.md`, `infra/scripts/verify-required-env.ps1`, `infra/deploy/stage/docker-compose.yml` | frontend | explicitly required by preflight |
| `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL` | required | `infra/.env.example`, `infra/README.md`, `infra/scripts/verify-required-env.ps1` | frontend or external clients | explicitly required by preflight |
| `STAGE_DOMAIN` | optional | `infra/.env.example` | nginx / docs | placeholder domain key; not consumed directly by compose |
| `BACKEND_STAGE_SENTRY_DSN` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | backend | stage Sentry |
| `BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | backend | stage tracing sample rate |
| `FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE` | optional | `infra/deploy/stage/docker-compose.yml` | frontend | stage tracing sample rate |
| `FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` | optional | `infra/deploy/stage/docker-compose.yml` | frontend | replay sample rate |
| `FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` | optional | `infra/deploy/stage/docker-compose.yml` | frontend | replay sample rate |
| `STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | orchestrator | default is `http://services:8000` |
| `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | orchestrator | timeout tuning |
| `ORCHESTRATOR_HTTP_RETRIES` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | orchestrator | retry tuning |
| `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | orchestrator | idempotency TTL |
| `ORCHESTRATOR_SERVICE_NAME` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | orchestrator | service identifier |
| `ORCHESTRATOR_LOG_LEVEL` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | orchestrator | log level |
| `MOBILE_STAGE_APP_VERSION` | optional but operationally important | `infra/README.md`, `infra/scripts/release-stage.sh`, `infra/deploy/stage/docker-compose.yml` | backend | affects app-update metadata |
| `MOBILE_STAGE_APK_URL` | optional but operationally important | `infra/README.md`, `infra/scripts/release-stage.sh`, `infra/deploy/stage/docker-compose.yml` | backend, frontend | APK download/update URL |
| `SERVICES_SECRET_KEY` | required | `infra/deploy/stage/docker-compose.yml` | services | secret-bearing |
| `STAGE_RUN_MIGRATIONS_ON_STARTUP` | optional but policy-sensitive | `infra/deploy/stage/docker-compose.yml` | services | default `false`; startup migration toggle |
| `STAGE_SERVICES_ALLOWED_HOSTS` | optional | `infra/deploy/stage/docker-compose.yml` | services | default includes `stagewarehub.automatonsoft.de` |
| `BACKEND_UPLOAD_STORAGE_BACKEND` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | backend | defaults to `ftp` |
| `BACKEND_UPLOAD_FTP_HOST` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | backend | FTP media host |
| `BACKEND_UPLOAD_FTP_USER` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | backend | FTP media user |
| `BACKEND_UPLOAD_FTP_PASS` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | backend | secret-bearing |
| `BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL` | optional | `infra/README.md`, `infra/deploy/stage/docker-compose.yml` | backend | public media base URL |
| `AFTERBUY_JV_LOGIN` | unknown | `infra/deploy/stage/docker-compose.yml` | backend | integration credential key |
| `AFTERBUY_JV_PASS` | unknown | `infra/deploy/stage/docker-compose.yml` | backend | secret-bearing |
| `AFTERBUY_XL_LOGIN` | unknown | `infra/deploy/stage/docker-compose.yml` | backend | integration credential key |
| `AFTERBUY_XL_PASS` | unknown | `infra/deploy/stage/docker-compose.yml` | backend | secret-bearing |

## 8. Registry Strategy Decision

### Option A: GHCR

- Pros:
  - aligns with current GitHub Actions location
  - aligns with `infra/README.md` topology showing `GitHub Actions -> GHCR -> Stage/Prod`
  - aligns with `infra/.env.example` image placeholders using `ghcr.io/example/...`
- Cons:
  - conflicts with Gitea-specific runner assets and older infra notes
  - requires a clear GitHub-side registry publish contract that is not implemented yet
- Repo evidence:
  - `infra/README.md`
  - `infra/.env.example`
  - current CI exists in `.github/workflows/ci.yml`
- Risk:
  - medium until repo owners explicitly confirm GitHub as the final deploy registry source

### Option B: Gitea registry

- Pros:
  - aligns with `infra/deploy/runners/` assets and runner labels
  - aligns with `infra/docs/NEXT_SAFE_STEPS_2026-05-20.md` statement that Gitea is operational source of truth
- Cons:
  - current active CI in this monorepo is GitHub Actions, not Gitea workflows
  - no Gitea workflow files are part of the current slice inputs
  - repository root and AGENTS guidance favor GitHub as canonical platform
- Repo evidence:
  - `infra/deploy/runners/INSTALL.md`
  - `infra/deploy/runners/.env.example`
  - `infra/docs/NEXT_SAFE_STEPS_2026-05-20.md`
- Risk:
  - high if the team has already shifted operational ownership to GitHub and the Gitea docs are stale

### Option C: Build On Server / No Registry

- Pros:
  - avoids registry publish and pull logic
  - can work even if registry strategy is unresolved
- Cons:
  - current stage release scripts and watcher logic expect image refs and `docker manifest inspect`
  - less aligned with immutable-tag rollback policy
  - increases stage host build responsibility and runtime coupling
- Repo evidence:
  - no inspected deploy script currently implements server-side image build as the primary stage release path
  - deploy watcher checks image availability before deploy
- Risk:
  - high because it diverges from current scripts and documented release flow

### Recommended Decision For Next Slice

- Recommended option for decision in Slice 6C: `GHCR`
- Reason:
  - it best matches the current GitHub CI location, `infra/README.md` topology, and image placeholders in `infra/.env.example`
- Important:
  - this is a decision recommendation only
  - it is not implemented in this slice
  - the inconsistency with Gitea-based runner and historical infra docs must be resolved explicitly

## 9. Healthcheck And Smoke Test Plan

### Compose-level checks

- `docker compose -f deploy/stage/docker-compose.yml --env-file .env config`
- `docker compose -f deploy/stage/docker-compose.yml --env-file .env ps`

### Container status checks

- verify `postgres` is healthy through compose status
- verify `orchestrator` is healthy through compose status
- verify backend, frontend, mobile, and services containers are running

### HTTP health endpoints found in repo

- Backend:
  - `GET /healthz`
  - `GET /readyz`
  - `GET /api/v1/healthz`
  - `GET /api/v1/readyz`
- Orchestrator:
  - `GET /healthz`
  - `GET /readyz`
  - `GET /metrics`
- Services:
  - `GET /api/v1/healthz`

### Frontend/domain checks

- `curl -I https://stagewarehub.automatonsoft.de`
- `curl https://stagewarehub.automatonsoft.de/api/v1/meta`
- optional APK check based on nginx template:
  - `https://stagewarehub.automatonsoft.de/warehubstage.apk`

### Rollback trigger criteria

- backend/orchestrator/services health endpoints fail
- frontend stage domain does not respond as expected
- required containers are not running after release
- wrong immutable tag or wrong stage image tag is applied
- stage smoke signoff cannot be completed

## 10. Rollback Plan

- Immutable previous tag requirement:
  - `docs/ci-cd/deployment-policy.md` requires rollback to an immutable previous image tag
- Version env handling:
  - `infra/versions.env` tracks `STAGE_VERSION`
  - stage deployment also depends on service-specific stage tag keys in `.env`
  - `infra/scripts/release-stage.sh` updates `BACKEND_STAGE_TAG`, `FRONTEND_STAGE_TAG`, `MOBILE_STAGE_TAG`, and `SERVICES_STAGE_TAG`
- Rollback drill/signoff requirement:
  - `infra/docs/ROLLBACK_DRILL_SIGNOFF_TEMPLATE.md` exists
  - `infra/docs/MVP_LAUNCH_READINESS_CHECKLIST.md` references production rollback drill confirmation
- Stage rollback shape implied by current scripts:
  - restore or set the previous approved stage tags in `.env`
  - rerun the stage release path
  - repeat healthchecks and stage smoke signoff
- What is missing:
  - confirmed previous-good stage tag source of truth beyond current env values
  - a dedicated stage rollback runbook
  - a GitHub-based rollback workflow
  - confirmed operator procedure for watcher-mode rollback versus direct rollout

## 11. Risks / Gaps

- actual stage host/IP is still `TODO / unknown`
- SSH user is still `TODO / unknown`
- deploy path is still unresolved across multiple candidate paths
- registry strategy is inconsistent across GitHub-oriented, GHCR-oriented, and Gitea-oriented repository artifacts
- secrets inventory is spread across multiple files and not yet consolidated into one operational contract
- deploy workflow is absent in `.github/workflows`
- `README.md` is stale because it still says CI/CD workflows will be added later
- stage deploy method is not singular yet:
  - direct `up-stage.sh`
  - watcher request queue
- policy conflict relevant to future deploy automation:
  - production policy forbids implicit startup migrations
  - stage/prod compose patterns still include `RUN_MIGRATIONS_ON_STARTUP`

## 12. Recommended Next Slice

- `Slice 6C - decide stage registry/deploy strategy and prepare GitHub Environment contract`
- Recommended scope:
  - choose one registry source of truth
  - choose one stage deploy method
  - define the GitHub Environment contract for `stage`
  - normalize the stage secrets contract by key name only
  - still do not deploy unless explicitly approved

## 13. Explicit Non-Goals

- no deploy
- no SSH
- no server changes
- no GitHub Secrets changes
- no deploy workflow added
- no runtime changes
- no script changes
- no compose changes
