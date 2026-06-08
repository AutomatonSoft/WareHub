# Slice 6L - Stage Env Secret Contract And GitHub Environment Setup Plan

## 1. Scope

- Goal: define the exact GitHub Environment secrets and variables contract for the `stage` environment before any deploy.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This slice is planning-only.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- GHCR publish is verified.
- GHCR pull from the server is verified.
- DNS/TLS/nginx read-only preflight is complete.
- Sanitized env templates exist:
  - `infra/deploy/stage/env.stage.sanitized.template`
  - `infra/deploy/prod/env.prod.sanitized.template`
- No deploy has been performed yet.

## 3. Environment Separation Decision

- Stage and prod secrets must use different names.
- Values may temporarily match, but names must remain separate.
- No shared DB, storage, or runtime secrets between stage and prod.
- Stage secrets must use `STAGE_*` or explicit stage-scoped names.
- Prod secret contract is future work and is not implemented in this slice.

## 4. GitHub Environment Contract

| Field | Value | Status |
|---|---|---|
| environment name | `stage` | proposed |
| branch source | `stage` | proposed |
| deploy target | `217.160.149.34` | confirmed |
| deploy user | `cddeploy` | confirmed |
| deploy path | `/opt/warehub/stage` | confirmed |
| domain | `stagewarehub.automatonsoft.de` | confirmed |
| approval status | `TODO / decide later` | unknown |
| status | planning only, not created in this slice | current |

## 5. Required GitHub Environment Secrets For Stage

| Secret name | Purpose | Source/template key | Required/optional | Value status |
|---|---|---|---|---|
| `STAGE_SSH_KEY` | private key for `cddeploy` access | deploy contract | required | `TODO / secret / GitHub Environment` |
| `STAGE_ENV_FILE` | assembled runtime `.env` payload for stage deploy | generated from sanitized template plus secrets/variables | required | `TODO / secret / GitHub Environment` |
| `STAGE_GHCR_TOKEN` | GHCR pull token for stage host or deploy workflow | GHCR access contract | required | `TODO / secret / GitHub Environment` |
| `STAGE_POSTGRES_PASSWORD` | stage Postgres password | `STAGE_POSTGRES_PASSWORD` | required | `TODO / secret / GitHub Environment` |
| `STAGE_SERVICES_SECRET_KEY` | Django services secret key for stage | `SERVICES_SECRET_KEY` | required | `TODO / secret / GitHub Environment` |
| `STAGE_BACKEND_SENTRY_DSN` | backend Sentry DSN for stage | `BACKEND_STAGE_SENTRY_DSN` | optional | `TODO / secret / GitHub Environment` |
| `STAGE_BACKEND_UPLOAD_FTP_PASS` | backend FTP password for stage media/storage | `BACKEND_UPLOAD_FTP_PASS` | optional | `TODO / secret / GitHub Environment` |
| `STAGE_AFTERBUY_JV_PASS` | stage Afterbuy JV password | `AFTERBUY_JV_PASS` | required if integration enabled | `TODO / secret / GitHub Environment` |
| `STAGE_AFTERBUY_XL_PASS` | stage Afterbuy XL password | `AFTERBUY_XL_PASS` | required if integration enabled | `TODO / secret / GitHub Environment` |

## 6. Required GitHub Environment Variables For Stage

| Variable name | Purpose | Proposed value | Source | Status |
|---|---|---|---|---|
| `STAGE_DOMAIN` | canonical stage domain | `stagewarehub.automatonsoft.de` | verified facts, nginx/docs | confirmed |
| `STAGE_SSH_HOST` | stage SSH target host | `217.160.149.34` | verified server facts | confirmed |
| `STAGE_SSH_USER` | stage SSH login user | `cddeploy` | verified server facts | confirmed |
| `STAGE_SSH_PORT` | stage SSH port | `22` | verified server facts | confirmed |
| `STAGE_DEPLOY_PATH` | stage deploy target path | `/opt/warehub/stage` | verified server facts | confirmed |
| `STAGE_FRONTEND_PORT` | stage frontend host port | `8941` | compose and env template | confirmed |
| `STAGE_BACKEND_PORT` | stage backend host port | `8942` | compose and env template | confirmed |
| `STAGE_POSTGRES_PORT` | stage Postgres host port | `8943` | compose and env template | confirmed |
| `STAGE_SERVICES_PORT` | stage services host port | `8944` | compose and env template | confirmed |
| `STAGE_ORCHESTRATOR_PORT` | stage orchestrator host port | `8945` | compose and env template | confirmed |
| `STAGE_GHCR_USERNAME` | GHCR pull username for stage host or deploy workflow | `RavilkaDev0` | GHCR verification facts | confirmed |
| `STAGE_IMAGE_TAG` | immutable stage release tag | `stage-a1c2946` | GHCR publish and pull verification | confirmed |
| `STAGE_BACKEND_IMAGE` | stage backend image ref | `ghcr.io/ravilkadev0/warehub/backend` | sanitized stage template | confirmed |
| `STAGE_FRONTEND_IMAGE` | stage frontend image ref | `ghcr.io/ravilkadev0/warehub/frontend` | sanitized stage template | confirmed |
| `STAGE_MOBILE_IMAGE` | stage mobile image ref | `ghcr.io/ravilkadev0/warehub/mobile` | sanitized stage template | confirmed |
| `STAGE_SERVICES_IMAGE` | stage services image ref | `ghcr.io/ravilkadev0/warehub/services` | sanitized stage template | confirmed |
| `STAGE_ORCHESTRATOR_IMAGE` | stage orchestrator image ref | `ghcr.io/ravilkadev0/warehub/orchestrator` | sanitized stage template | confirmed |
| `STAGE_INFRA_IMAGE` | stage infra image ref | `ghcr.io/ravilkadev0/warehub/infra` | GHCR verification scope | confirmed |

## 7. STAGE_ENV_FILE Generation Contract

- `STAGE_ENV_FILE` should be generated from:
  - `infra/deploy/stage/env.stage.sanitized.template`
  - GitHub Environment variables for non-secret stage values
  - GitHub Environment secrets for secret-bearing stage values
- Non-secret values can come from GitHub Environment variables.
- Secret values must come from GitHub Environment secrets.
- The final runtime file must not be created in this slice.
- The final runtime file must never be committed.
- The final runtime file may only be written in a later approved deploy or preflight slice.
- The intended final target path is:
  - `/opt/warehub/stage/.env`
- Writing `/opt/warehub/stage/.env` requires explicit approval in a later slice.

## 8. Stage Configuration Categories

### Non-secret GitHub Environment variables

- `STAGE_SSH_HOST`
- `STAGE_SSH_USER`
- `STAGE_SSH_PORT`
- `STAGE_DEPLOY_PATH`
- `STAGE_GHCR_USERNAME`

### Secret GitHub Environment secrets

#### SSH/deploy access

- `STAGE_SSH_KEY`

#### GHCR access

- `STAGE_GHCR_TOKEN`

#### Postgres

- `STAGE_POSTGRES_PASSWORD`

#### Backend runtime

- `STAGE_BACKEND_SENTRY_DSN`

#### Services runtime

- `STAGE_SERVICES_SECRET_KEY`

#### FTP/storage

- `STAGE_BACKEND_UPLOAD_FTP_PASS`

#### Afterbuy integrations

- `STAGE_AFTERBUY_JV_PASS`
- `STAGE_AFTERBUY_XL_PASS`

#### Observability/Sentry

- `STAGE_BACKEND_SENTRY_DSN`

## 9. GitHub UI Setup Plan

Manual GitHub UI path for a future slice:

1. Repository `Settings`
2. `Environments`
3. `New environment`
4. Create environment named `stage`
5. Add environment secrets
6. Add environment variables
7. Optionally add required reviewers later

This was not done in this slice.

## 10. GitHub CLI Setup Command Plan

Command shapes only. NOT EXECUTED in this slice.

```bash
gh secret set STAGE_SSH_KEY --env stage --body "<value_from_password_manager>"
gh secret set STAGE_ENV_FILE --env stage --body "<value_from_password_manager>"
gh secret set STAGE_GHCR_TOKEN --env stage --body "<value_from_password_manager>"
gh secret set STAGE_POSTGRES_PASSWORD --env stage --body "<value_from_password_manager>"
gh secret set STAGE_SERVICES_SECRET_KEY --env stage --body "<value_from_password_manager>"
gh secret set STAGE_BACKEND_SENTRY_DSN --env stage --body "<value_from_password_manager>"
gh secret set STAGE_BACKEND_UPLOAD_FTP_PASS --env stage --body "<value_from_password_manager>"
gh secret set STAGE_AFTERBUY_JV_PASS --env stage --body "<value_from_password_manager>"
gh secret set STAGE_AFTERBUY_XL_PASS --env stage --body "<value_from_password_manager>"

gh variable set STAGE_DOMAIN --env stage --body "<value_from_password_manager>"
gh variable set STAGE_SSH_HOST --env stage --body "<value_from_password_manager>"
gh variable set STAGE_SSH_USER --env stage --body "<value_from_password_manager>"
gh variable set STAGE_SSH_PORT --env stage --body "<value_from_password_manager>"
gh variable set STAGE_DEPLOY_PATH --env stage --body "<value_from_password_manager>"
gh variable set STAGE_FRONTEND_PORT --env stage --body "<value_from_password_manager>"
gh variable set STAGE_BACKEND_PORT --env stage --body "<value_from_password_manager>"
gh variable set STAGE_POSTGRES_PORT --env stage --body "<value_from_password_manager>"
gh variable set STAGE_SERVICES_PORT --env stage --body "<value_from_password_manager>"
gh variable set STAGE_ORCHESTRATOR_PORT --env stage --body "<value_from_password_manager>"
gh variable set STAGE_GHCR_USERNAME --env stage --body "<value_from_password_manager>"
gh variable set STAGE_IMAGE_TAG --env stage --body "<value_from_password_manager>"
gh variable set STAGE_BACKEND_IMAGE --env stage --body "<value_from_password_manager>"
gh variable set STAGE_FRONTEND_IMAGE --env stage --body "<value_from_password_manager>"
gh variable set STAGE_MOBILE_IMAGE --env stage --body "<value_from_password_manager>"
gh variable set STAGE_SERVICES_IMAGE --env stage --body "<value_from_password_manager>"
gh variable set STAGE_ORCHESTRATOR_IMAGE --env stage --body "<value_from_password_manager>"
gh variable set STAGE_INFRA_IMAGE --env stage --body "<value_from_password_manager>"
```

## 11. Validation Checklist Before First Real STAGE_ENV_FILE

- all required secrets exist
- all required variables exist
- exposed GHCR token revoked or replaced
- `STAGE_GHCR_TOKEN` can pull GHCR images
- `STAGE_SSH_KEY` can access `cddeploy`
- `STAGE_ENV_FILE` generation dry-run reviewed
- repo-safety still green
- no real `.env` committed

## 12. Remaining Blockers Before First Stage Deploy

- GitHub Environment `stage` not created or not verified in this slice
- secrets not added in this slice
- variables not added in this slice
- `STAGE_ENV_FILE` not created
- `docker compose config` not run with real env
- migration plan not executed
- deploy workflow not added
- cert renewal automation not confirmed
- nginx upstream still returns `502` until containers run

## 13. Recommended Next Slice

- `Slice 6M - create stage GitHub Environment secrets/variables checklist report`

Important:

- Slice 6M should not deploy
- Slice 6M should not commit real secrets
- Slice 6M may verify names exist only if safe
- Slice 6M should not print secret values

## 14. Explicit Non-Goals

- no deploy
- no docker compose up
- no real `.env` creation
- no server changes
- no SSH
- no nginx reload
- no certbot changes
- no GitHub Secrets changes
- no GitHub Variables changes
- no deploy workflow added
- no runtime changes
- no script changes
- no compose changes
- no Dockerfile changes
- no source changes
