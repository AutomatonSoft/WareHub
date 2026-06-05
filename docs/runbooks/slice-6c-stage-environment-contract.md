# Slice 6C - Stage Environment Contract

## 1. Scope

- Goal: finalize the intended stage deploy strategy as a planning-only repository contract.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This report is based only on repository files inspected in this slice and prior Slice 6A and Slice 6B runbooks.
- This slice does not implement deploy automation.

## 2. Decision Summary

- Registry: `GHCR`
- Deploy method: direct `SSH` + `infra/up-stage.sh`
- GitHub Environment: `stage`
- Deploy workflow: not implemented in this slice

## 3. Why GHCR

- Current CI is implemented in GitHub Actions at `.github/workflows/ci.yml`.
- Docker build validation is already implemented in GitHub Actions for:
  - `services/database-service/Dockerfile`
  - `services/orchestrator/Dockerfile`
  - `apps/frontend/Dockerfile`
  - `apps/backend/Dockerfile`
  - `apps/mobile/Dockerfile`
  - `infra/Dockerfile`
- `infra/.env.example` uses `ghcr.io` placeholders for deployable image references:
  - `BACKEND_IMAGE=ghcr.io/example/warehub-backend`
  - `FRONTEND_IMAGE=ghcr.io/example/warehub-frontend`
  - `MOBILE_IMAGE=ghcr.io/example/warehub-mobile`
  - `SERVICES_IMAGE=ghcr.io/example/warehub-database-service`
  - `ORCHESTRATOR_IMAGE=ghcr.io/example/warehub-orchestrator`
- `infra/README.md` documents the intended topology as `GitHub Actions -> GHCR -> Stage/Prod`.
- Decision for this slice:
  - treat `GHCR` as the intended registry source of truth for future GitHub-based stage deploy automation
- Gitea-related runner references still exist in the repository and remain inconsistent with the current GitHub Actions baseline.
- Those Gitea references should be treated as legacy or stale until a later cleanup slice confirms or removes them.

## 4. Why Direct SSH + up-stage.sh For First Stage Deploy

- `infra/up-stage.sh` already exists as the documented stage entrypoint.
- `infra/up-stage.sh` delegates to `infra/scripts/release-stage.sh`.
- `infra/scripts/release-stage.sh` already performs the current stage release shape:
  - updates stage image tag keys in `.env`
  - optionally waits for image availability
  - runs `docker compose -f deploy/stage/docker-compose.yml --env-file "$ENV_FILE" pull`
  - runs `docker compose -f deploy/stage/docker-compose.yml --env-file "$ENV_FILE" up -d --force-recreate`
- This path is simpler than the watcher queue model for the first deploy automation pass.
- This path is easier to debug because the release entrypoint is explicit and already documented.
- This path is easier to roll back because the operator can rerun the same entrypoint with previous immutable tags.
- Watcher-based deploy request flow remains available as future hardening, not as the first implementation target.

## 5. GitHub Environment Contract: `stage`

| Field | Intended value | Status |
|---|---|---|
| environment name | `stage` | decided |
| required reviewers | `TODO / unknown` | needs confirmation |
| branch restriction | `stage` | proposed from repo branch policy |
| secrets source | GitHub Environment secrets for `stage` | proposed |
| variables source | GitHub Environment variables for `stage` | proposed |
| protection rules | branch restriction and reviewer rules `TODO / unknown` | needs confirmation |
| status | contract only, not implemented | current |

## 6. Required GitHub Secrets For Future Stage Deploy

| Secret name | Required / optional | Purpose | Inferred from | Value status |
|---|---|---|---|---|
| `STAGE_SSH_HOST` | required | target stage host or IP for remote deploy connection | `docs/ci-cd/secret-policy.md` | `TODO / unknown` |
| `STAGE_SSH_USER` | required | remote deploy user | `docs/ci-cd/secret-policy.md` | `TODO / unknown` |
| `STAGE_SSH_KEY` | required | SSH private key for stage host access | `docs/ci-cd/secret-policy.md` | `TODO / unknown` |
| `STAGE_SSH_PORT` | required | SSH port for stage host connection | `infra/scripts/ops-preflight.ps1`, `infra/README.md` examples | `TODO / unknown` |
| `STAGE_DEPLOY_PATH` | required | remote infra checkout or deploy bundle path | candidate paths appear across repo docs and scripts | `TODO / unknown` |
| `STAGE_ENV_FILE` | required | stage runtime env payload written securely during deploy | `docs/ci-cd/secret-policy.md`, `infra/up-stage.sh`, `infra/scripts/release-stage.sh` | `TODO / unknown` |
| `GHCR_USERNAME` | required | GHCR pull or push identity for future workflow or host auth | GHCR decision in this slice | `TODO / unknown` |
| `GHCR_TOKEN` | required | GHCR auth token for future workflow or host auth | GHCR decision in this slice, `docs/ci-cd/secret-policy.md` lists `REGISTRY_TOKEN` as future secret | `TODO / unknown` |

Notes:

- This runbook defines future secret names only.
- No secret values are included.
- `GHCR_TOKEN` naming is proposed for clarity in a GitHub-specific workflow, but repository policy currently documents `REGISTRY_TOKEN`; exact final name still needs confirmation.

## 7. Required GitHub Variables For Future Stage Deploy

| Variable name | Required / optional | Purpose | Proposed value or TODO |
|---|---|---|---|
| `STAGE_BRANCH` | required | branch gate for stage deploy workflow | `stage` |
| `STAGE_DOMAIN` | required | canonical stage domain | `stagewarehub.automatonsoft.de` |
| `STAGE_DEPLOY_METHOD` | required | explicit stage release path | `direct-ssh-up-stage-sh` |
| `STAGE_REGISTRY` | required | intended image registry | `ghcr.io` |
| `STAGE_COMPOSE_FILE` | required | compose file used by release script | `infra/deploy/stage/docker-compose.yml` |
| `STAGE_HEALTHCHECK_FRONTEND_URL` | required | frontend smoke URL after deploy | `https://stagewarehub.automatonsoft.de` |

## 8. Stage Image Naming Contract For GHCR

Intended image references for future workflow design:

- `ghcr.io/<owner>/<repo>/backend`
- `ghcr.io/<owner>/<repo>/frontend`
- `ghcr.io/<owner>/<repo>/mobile`
- `ghcr.io/<owner>/<repo>/services`
- `ghcr.io/<owner>/<repo>/orchestrator`
- `ghcr.io/<owner>/<repo>/infra`

Tag strategy:

- primary stage release tag: `stage-<short_sha>`
- optional convenience tag: `stage-latest`
- `stage-latest` must not be the rollback source of truth
- immutable tags are required for rollback

Current repo note:

- `infra/.env.example` currently uses flatter image names such as `ghcr.io/example/warehub-backend`.
- The exact GHCR owner and path contract still needs confirmation before workflow implementation.

## 9. Future Stage Deploy Workflow Contract

This section describes intended workflow shape only. It is not implemented in this slice.

1. Trigger on `push` to `stage` or on `workflow_dispatch`.
2. Require successful CI validation before deploy steps run.
3. Use GitHub Environment `stage`.
4. Build and push stage images to `GHCR`.
5. Connect to the stage host over `SSH`.
6. Write `STAGE_ENV_FILE` securely to the approved deploy path.
7. Run preflight commands before rollout.
8. Run `./up-stage.sh stage-<short_sha>`.
9. Run post-deploy healthchecks.
10. Publish a workflow summary with deployed tags and healthcheck status.

## 10. Stage Host Preparation Checklist

- Docker installed
- Docker Compose plugin installed
- deploy user created
- deploy path exists
- repo checkout or deploy bundle exists on host
- GHCR pull access configured
- `.env` created from `STAGE_ENV_FILE`
- nginx configured for `stagewarehub.automatonsoft.de`
- firewall ports checked
- previous immutable tags policy or rollback directory confirmed

## 11. Stage Healthcheck Contract

Minimum post-deploy checks inferred from repository files:

- `docker compose -f infra/deploy/stage/docker-compose.yml --env-file .env ps`
- orchestrator health:
  - `GET /healthz`
- backend health:
  - `GET /healthz` or `GET /api/v1/healthz`
- services health:
  - `GET /api/v1/healthz`
- frontend domain check:
  - `https://stagewarehub.automatonsoft.de`
- frontend API meta reachability:
  - `https://stagewarehub.automatonsoft.de/api/v1/meta`
- APK URL check if applicable:
  - `https://stagewarehub.automatonsoft.de/warehubstage.apk`

Notes:

- `infra/deploy/stage/docker-compose.yml` defines container healthchecks for `postgres` and `orchestrator`.
- Backend and services HTTP health endpoints are documented in earlier deploy discovery and stage planning runbooks.

## 12. Rollback Contract

- Rollback uses the previous immutable image tag.
- `stage-latest` must not be the rollback source of truth.
- Rollback can be performed by restoring previous stage tag values in `.env` or by passing the previous approved version or tag to `./up-stage.sh`, depending on the final operator procedure.
- After rollback, rerun the same post-deploy healthchecks.
- Write rollback signoff evidence after the rollback validation completes.

## 13. Open TODOs Before Implementation

- actual stage host or IP
- SSH user
- SSH port confirmation
- deploy path
- final GHCR owner and repo naming contract
- whether `GHCR_TOKEN` can be `GITHUB_TOKEN` or requires a separate PAT
- exact `STAGE_ENV_FILE` contents by key name
- final backend, services, orchestrator, and frontend healthcheck URLs
- whether direct deploy should trigger automatically after merge to `stage` or remain `workflow_dispatch` initially
- final required reviewers and protection rules for GitHub Environment `stage`

## 14. Recommended Next Slice

- `Slice 6D - prepare stage GitHub Environment and GHCR publish workflow draft`
- That slice should still not deploy until secrets, host contract, and deploy path are confirmed.

## 15. Explicit Non-Goals

- no deploy
- no SSH
- no server changes
- no GitHub Secrets changes
- no deploy workflow added
- no runtime changes
- no script changes
- no compose changes
- no Dockerfile changes
- no source changes
