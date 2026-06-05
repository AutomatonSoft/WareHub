# Slice 6A - Deploy Discovery Report

## 1. Scope

- Goal: discovery-only report for current deploy/CD readiness in `I:\WareHub`.
- Allowed change in this slice: add this runbook only.
- Inspected repository locations:
  - `.github/workflows/ci.yml`
  - `docs/ci-cd/`
  - `docs/runbooks/`
  - `infra/README.md`
  - `infra/versions.env`
  - `infra/up-stage.sh`
  - `infra/up-prod.sh`
  - `infra/deploy/`
  - `infra/scripts/`
  - `infra/local/`
  - `README.md`
  - `AGENTS.md`
- Explicitly not done:
  - no deploy
  - no SSH
  - no server access
  - no workflow deploy automation
  - no runtime or source changes

## 2. CI Baseline Summary

- `.github/workflows/ci.yml` exists and is a CI-only workflow named `CI`.
- Triggers:
  - `pull_request` to `stage`
  - `pull_request` to `main`
  - `workflow_dispatch`
- Current workflow contents are validation-only:
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
- Current CI validates compose config, application checks, tests, and Docker builds.
- No deploy job was found in `.github/workflows/ci.yml`.
- No registry login, image push, artifact publish, SSH, or remote rollout step was found in `.github/workflows/ci.yml`.

## 3. Deployment-Related Repository Inventory

### Top-level and policy/docs

- `README.md`
- `AGENTS.md`
- `docs/ci-cd/branching-and-release-policy.md`
- `docs/ci-cd/deployment-policy.md`
- `docs/ci-cd/secret-policy.md`
- deploy-related runbooks already present in `docs/runbooks/`:
  - `backup-and-restore-policy.md`
  - `migration-policy.md`
  - `stage-main-promotion-checklist.md`
  - `local-dev.md`
  - `monorepo-migration-slice-plan.md`
  - multiple slice reports for CI and Docker build validation in Slice 4 and Slice 5

### Infra deploy assets

- `infra/versions.env`
- `infra/up-stage.sh`
- `infra/up-prod.sh`
- `infra/deploy/stage/docker-compose.yml`
- `infra/deploy/prod/docker-compose.yml`
- `infra/deploy/nginx/sofortbot.conf.template`
- `infra/deploy/nginx/INSTALL.md`
- `infra/deploy/runners/docker-compose.yml`
- `infra/deploy/runners/.env.example`
- `infra/deploy/runners/install-12-runners.sh`
- `infra/deploy/runners/INSTALL.md`
- `infra/deploy/systemd/sofortbot-deploy-watcher.service`
- `infra/deploy/systemd/install-watcher.sh`
- `infra/deploy/systemd/INSTALL.md`
- `infra/scripts/`
- `infra/local/docker-compose.dev.yml`

### Infra supporting docs

- `infra/README.md`
- `infra/OPS_HEALTH_VERIFICATION.md`
- `infra/REQUEST_ID_PROPAGATION_CHECKLIST.md`
- `infra/SECURITY_BASELINE.md`
- `infra/SECRET_ROTATION_PLAN.md`
- `infra/docs/STAGE_SMOKE_SIGNOFF_TEMPLATE.md`
- `infra/docs/ROLLBACK_DRILL_SIGNOFF_TEMPLATE.md`
- `infra/docs/MVP_GO_NO_GO_APPROVAL_TEMPLATE.md`
- `infra/docs/MVP_LAUNCH_READINESS_CHECKLIST.md`

## 4. Stage Deploy Assets Found

- `infra/deploy/stage/docker-compose.yml`
  - stage stack exists for `postgres`, `backend`, `frontend`, `mobile`, `services`, `orchestrator`
  - includes healthcheck for `postgres`
  - includes healthcheck for `orchestrator` on `http://127.0.0.1:8011/healthz`
- `infra/up-stage.sh`
  - top-level stage rollout wrapper
  - defaults to `stage-latest` when no tag argument is passed
  - optionally performs `git pull --ff-only`
  - then calls `scripts/release-stage.sh`
- `infra/scripts/release-stage.sh`
  - appears to update stage image tags in `.env`
  - then runs `docker compose -f deploy/stage/docker-compose.yml --env-file "$ENV_FILE" pull`
  - then runs `docker compose ... up -d --force-recreate`
- `infra/versions.env`
  - tracks `STAGE_VERSION`
- `infra/README.md`
  - documents stage runtime env groups
  - documents `./up-stage.sh`
  - documents stage queue-based deploy request example
- `infra/docs/STAGE_SMOKE_SIGNOFF_TEMPLATE.md`
  - stage smoke-signoff template exists
- `infra/scripts/verify-stage-migration-plan.ps1`
  - stage migration-plan dry verification exists
- `docs/ci-cd/deployment-policy.md`
  - says stage deploy should be automatic after merge to `stage`

## 5. Prod Deploy Assets Found

- `infra/deploy/prod/docker-compose.yml`
  - prod stack exists for `postgres`, `backend`, `frontend`, `mobile`, `services`, `orchestrator`
  - includes healthcheck for `postgres`
  - includes healthcheck for `orchestrator` on `http://127.0.0.1:8011/healthz`
- `infra/up-prod.sh`
  - top-level prod rollout wrapper
  - reads `PROD_VERSION` from `versions.env` when not passed explicitly
  - validates `vX.Y.Z` format
  - optionally performs `git pull --ff-only`
  - then calls `scripts/release-prod.sh`
- `infra/scripts/release-prod.sh`
  - appears to update prod image version keys in `.env`
  - then runs `docker compose -f deploy/prod/docker-compose.yml --env-file "$ENV_FILE" pull`
  - then runs `docker compose ... up -d --force-recreate`
- `infra/versions.env`
  - tracks `PROD_VERSION`
- `infra/README.md`
  - documents `./up-prod.sh`
  - documents prod queue-based deploy request example
- `infra/scripts/verify-prod-migration-plan.ps1`
  - prod migration-plan dry verification exists
- `docs/runbooks/backup-and-restore-policy.md`
  - says production deploys with migrations require backup
- `docs/runbooks/migration-policy.md`
  - says implicit production migrations are forbidden
- `docs/ci-cd/deployment-policy.md`
  - says production deploy requires manual approval after merge to `main`
  - says fully automatic production deploy is forbidden

## 6. Local Deploy/Dev Assets Found

- `infra/local/docker-compose.dev.yml`
  - local dependency stack exists for:
    - `warehub-postgres`
    - `warehub-redis`
    - `warehub-minio`
    - `warehub-rabbitmq`
  - this is local/dev infrastructure, not stage/prod deploy automation
- `.github/workflows/ci.yml`
  - `compose-config` job validates `infra/local/docker-compose.dev.yml`
- `docs/runbooks/local-dev.md`
  - explicitly states it is local/dev only and not deploy automation
- `infra/.env.example`
  - contains local, stage, prod, and image placeholder keys
  - includes stage/prod domain and image placeholders but is still a template, not a runtime source of truth

## 7. Existing Scripts And What Each Appears To Do

### Top-level infra entrypoints

- `infra/up-stage.sh`
  - stage rollout wrapper around `scripts/release-stage.sh`
- `infra/up-prod.sh`
  - prod rollout wrapper around `scripts/release-prod.sh`

### Release and deploy orchestration

- `infra/scripts/release-stage.sh`
  - updates stage tag keys and redeploys selected services through stage compose
- `infra/scripts/release-prod.sh`
  - updates prod version keys and redeploys selected services through prod compose
- `infra/scripts/release-infra.sh`
  - generic release helper for `stage` or `prod`
- `infra/scripts/enqueue-deploy.sh`
  - writes staged/prod deploy request files into `.deploy-requests`
- `infra/scripts/deploy-watcher.sh`
  - watches request files, checks image availability, and triggers deploys

### Validation, safety, and migration helpers

- `infra/scripts/verify-stage-migration-plan.ps1`
  - local stage migration-plan dry verification
- `infra/scripts/verify-prod-migration-plan.ps1`
  - local prod migration-plan dry verification
- `infra/scripts/verify-all-migration-plans.ps1`
  - wrapper for stage+prod migration-plan verification
- `infra/scripts/verify-remote-migration-plans.ps1`
  - remote stage+prod migration-plan dry verification over SSH
- `infra/scripts/verify-required-env.ps1`
  - checks required deploy env keys are present in `.env`
- `infra/scripts/verify-env-example-placeholders.ps1`
  - checks `.env.example` placeholder-only policy
- `infra/scripts/verify-env-tracking.ps1`
  - checks `.env` is not tracked by git
- `infra/scripts/scan-secrets.ps1`
  - secret scan helper
- `infra/scripts/security-preflight.ps1`
  - runs grouped security preflight checks
- `infra/scripts/ops-preflight.ps1`
  - runs grouped ops preflight checks, including migration checks
- `infra/scripts/quality-gate.ps1`
  - runs grouped quality/security/ops/API preflights
- `infra/scripts/api-contract-preflight.ps1`
  - checks API-contract-related commands

### Packaging / signoff helpers

- `infra/scripts/prepare-launch-signoff-pack.ps1`
  - generates dated launch signoff artifacts

### Install helpers under `infra/deploy`

- `infra/deploy/runners/install-12-runners.sh`
  - generates and starts 12 shared Gitea runners from `.env`
- `infra/deploy/systemd/install-watcher.sh`
  - installs and enables the deploy watcher as a systemd service

## 8. Existing Policy Docs And What They Cover

- `docs/ci-cd/branching-and-release-policy.md`
  - branch model
  - `feature/* -> stage`
  - `stage -> main`
  - `hotfix/* -> main -> back-merge to stage`
  - semantic versioning rules
  - no `latest` tag for audited releases
- `docs/ci-cd/deployment-policy.md`
  - automatic stage deploy after merge to `stage`
  - production deploy only after manual approval and merge to `main`
  - no fully automatic production deploy
  - post-deploy healthcheck requirement
  - rollback should use immutable previous image tag
- `docs/ci-cd/secret-policy.md`
  - real `.env` files forbidden in git
  - only example files allowed in repo
  - future GitHub Environments planned: `stage`, `production`
  - future secret names are listed, including SSH and env-file secrets
- `docs/runbooks/backup-and-restore-policy.md`
  - production deploys with migrations require backup
  - restore automation/runbook still deferred
- `docs/runbooks/migration-policy.md`
  - explicit migrations only
  - one owner per table
  - destructive migrations require review
- `docs/runbooks/stage-main-promotion-checklist.md`
  - stage-to-main PR checklist
  - explicitly not a deploy checklist
- `docs/runbooks/monorepo-migration-slice-plan.md`
  - earlier migration plan includes later deploy slices
  - names future stage deploy, backup/migrations, and prod deploy slices

## 9. Required Information Before Real Deploy Automation

- Server host/IP:
  - unknown
  - repository contains placeholders such as `<SERVER_HOST>` and future secret names such as `STAGE_SSH_HOST` and `PROD_SSH_HOST`
- SSH user:
  - unknown
  - repository contains placeholders such as `<SERVER_USER>` and future secret names such as `STAGE_SSH_USER` and `PROD_SSH_USER`
- Deploy path:
  - actual target path is unknown
  - repository shows candidate paths:
    - `/opt/sofortbot-infra`
    - `/home/deploy/sofortbot-infra`
    - `~/sofortbot-infra`
    - `/home/server/sofotbot/infra`
    - `/opt/sofortbot/sofortbot-infra`
- Target branch mapping:
  - documented in `docs/ci-cd/branching-and-release-policy.md`
  - `feature/* -> stage`
  - `stage -> main`
  - no actual deploy-trigger workflow exists yet in GitHub Actions
- Domain mapping:
  - stage domain found:
    - `stagewarehub.automatonsoft.de`
  - prod domain found:
    - `warehub.automatonsoft.de`
  - dev domain found:
    - `devwarehub.automatonsoft.de`
  - placeholder domains also exist in `infra/.env.example`
- Env/secrets list:
  - partial list exists across `infra/README.md`, `infra/.env.example`, `docs/ci-cd/secret-policy.md`, and `infra/scripts/verify-required-env.ps1`
  - exact final deploy secrets inventory is not consolidated into one authoritative file
  - secret-bearing key names present in inspected templates/docs include:
    - `BACKEND_UPLOAD_FTP_PASS`
    - `AFTERBUY_JV_PASS`
    - `AFTERBUY_XL_PASS`
    - `SERVICES_SECRET_KEY`
    - `STAGE_POSTGRES_PASSWORD`
    - `PROD_POSTGRES_PASSWORD`
    - `STAGE_SSH_KEY`
    - `PROD_SSH_KEY`
    - `REGISTRY_TOKEN`
- Rollback strategy:
  - partially documented
  - repo states rollback should use immutable previous image tag
  - rollback drill template exists
  - no executable GitHub deploy rollback workflow exists
- Healthcheck endpoints:
  - backend endpoints documented in ops docs:
    - `/healthz`
    - `/readyz`
    - `/api/v1/healthz`
    - `/api/v1/readyz`
  - orchestrator endpoints documented in ops docs:
    - `/healthz`
    - `/readyz`
    - `/metrics`
  - services health endpoint is referenced in docs:
    - `/api/v1/healthz`
  - compose files include container healthcheck only for `postgres` and `orchestrator`
- Docker registry strategy or no-registry strategy:
  - repository is inconsistent here
  - `infra/README.md` says CI publishes images and topology points to `GHCR`
  - `infra/.env.example` uses `ghcr.io/example/...` image placeholders
  - `infra/deploy/runners` assets are for Gitea runners
  - `infra/docs/NEXT_SAFE_STEPS_2026-05-20.md` says operational source of truth for CI/CD and registry is Gitea while GitHub acts as mirror/storage
  - final registry source of truth is therefore not confirmed by inspected files

## 10. Risks / Gaps

- No GitHub deploy workflow exists yet, even though policy docs describe desired stage/prod behavior.
- Actual server host/IP, SSH user, and confirmed remote repo path are not documented as current facts in the inspected files.
- Registry source of truth is inconsistent across repository files:
  - GitHub is treated as canonical in `AGENTS.md`
  - `infra/README.md` points to GHCR
  - runner assets are Gitea-specific
  - historical infra docs reference Gitea as operational source of truth
- `README.md` is stale relative to current state:
  - it says CI/CD workflows will be added in later slices, but CI already exists
- Deploy scripts exist, but there is no repository-backed proof in this slice that they are wired to a currently approved GitHub-based deploy path.
- Stage/prod compose files still allow startup-driven migrations via `RUN_MIGRATIONS_ON_STARTUP`; policy docs say production migrations must be explicit.
- Healthcheck documentation is broader than compose healthchecks:
  - docs describe backend/services/orchestrator HTTP checks
  - compose healthchecks are only defined for `postgres` and `orchestrator`
- Secret inventory is spread across multiple files and is not yet normalized into one deploy-ready checklist.
- Backup/restore policy exists, but backup/restore automation is explicitly not yet implemented.

## 11. Recommended Next Slice

- `Slice 6B - stage deploy plan and secrets inventory`
- Recommended scope for that slice:
  - consolidate stage deploy prerequisites into one plan
  - produce one authoritative secret/env inventory by key name only
  - reconcile registry source-of-truth decision
  - confirm expected deploy path candidates and stage domain mapping
  - document exact preflight and post-deploy healthcheck sequence

## 12. Explicit Non-Goals

- no deploy
- no SSH
- no server changes
- no GitHub secrets changes
- no deploy workflow added
- no runtime changes
