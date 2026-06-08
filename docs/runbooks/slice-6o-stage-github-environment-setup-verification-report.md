# Slice 6O - Stage GitHub Environment Setup Verification Report

## 1. Scope

- Goal: document that GitHub Environment `stage` was created, stage variables were added, and required initial stage secrets were added without printing secret values.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- Slice 6L stage environment contract exists.
- Slice 6M stage GitHub Environment checklist exists.
- Slice 6N stage env file assembly and validation planning exists.
- GitHub Environment `stage` was created.
- Initial stage variables were created.
- Initial stage secrets were created by name only.
- No deploy was performed.

## 3. Environment Creation Result

- environment name: `stage`
- created_at: `2026-06-08T10:01:38Z`
- protection_rules: `[]`
- deployment_branch_policy: `null`
- approval/reviewer status: `TODO / not configured yet`
- notes:
  - approval rules were not configured yet
  - admins can bypass: `true`

## 4. Stage Variables Verification Table

| Variable name | Value | Status |
|---|---|---|
| `STAGE_BACKEND_IMAGE` | `ghcr.io/ravilkadev0/warehub/backend` | present |
| `STAGE_BACKEND_PORT` | `8942` | present |
| `STAGE_DEPLOY_PATH` | `/opt/warehub/stage` | present |
| `STAGE_DOMAIN` | `stagewarehub.automatonsoft.de` | present |
| `STAGE_FRONTEND_IMAGE` | `ghcr.io/ravilkadev0/warehub/frontend` | present |
| `STAGE_FRONTEND_PORT` | `8941` | present |
| `STAGE_GHCR_USERNAME` | `RavilkaDev0` | present |
| `STAGE_IMAGE_TAG` | `stage-a1c2946` | present |
| `STAGE_INFRA_IMAGE` | `ghcr.io/ravilkadev0/warehub/infra` | present |
| `STAGE_MOBILE_IMAGE` | `ghcr.io/ravilkadev0/warehub/mobile` | present |
| `STAGE_ORCHESTRATOR_IMAGE` | `ghcr.io/ravilkadev0/warehub/orchestrator` | present |
| `STAGE_ORCHESTRATOR_PORT` | `8945` | present |
| `STAGE_POSTGRES_PORT` | `8943` | present |
| `STAGE_SERVICES_IMAGE` | `ghcr.io/ravilkadev0/warehub/services` | present |
| `STAGE_SERVICES_PORT` | `8944` | present |
| `STAGE_SSH_HOST` | `217.160.149.34` | present |
| `STAGE_SSH_PORT` | `22` | present |
| `STAGE_SSH_USER` | `cddeploy` | present |

## 5. Stage Secrets Verification Table

| Secret name | Status | Value printed? |
|---|---|---|
| `STAGE_GHCR_TOKEN` | present | no |
| `STAGE_POSTGRES_PASSWORD` | present | no |
| `STAGE_SERVICES_SECRET_KEY` | present | no |
| `STAGE_SSH_KEY` | present | no |

## 6. Failed Attempt Note

- The first environment create attempt failed because `wait_timer` was sent as string using `-f`.
- The fix was to use typed `-F wait_timer=0`.
- Variable creation attempts returned `404` before the environment existed.
- No data loss occurred.
- No secrets were printed.

## 7. Commands Executed

Command shapes documented for this verification slice:

- `gh api repos/RavilkaDev0/WareHub/environments`
- `gh api --method PUT repos/RavilkaDev0/WareHub/environments/stage -F wait_timer=0`
- `gh variable set <name> --env stage --body <value>`
- `gh variable list --env stage`
- `gh secret set STAGE_SSH_KEY --env stage --body <value>`
- `gh secret set STAGE_GHCR_TOKEN --env stage --body <value>`
- `gh secret set STAGE_POSTGRES_PASSWORD --env stage --body <value>`
- `gh secret set STAGE_SERVICES_SECRET_KEY --env stage --body <value>`
- `gh secret list --env stage`

No secret values are included in this report.

## 8. Remaining Missing Stage Secrets

- `STAGE_ENV_FILE`
  - required before first real stage compose preflight or deploy
- `STAGE_BACKEND_SENTRY_DSN`
  - optional unless Sentry is enabled for stage
- `STAGE_BACKEND_UPLOAD_FTP_PASS`
  - optional unless FTP-backed storage is enabled
- `STAGE_AFTERBUY_JV_PASS`
  - required if stage Afterbuy JV integration is enabled
- `STAGE_AFTERBUY_XL_PASS`
  - required if stage Afterbuy XL integration is enabled

## 9. Remaining Blockers Before First Stage Deploy

- `STAGE_ENV_FILE` not created
- `docker compose config` not run with real env
- migration plan not executed
- deploy workflow not added
- cert renewal automation not confirmed
- nginx upstream still returns `502` until containers run

## 10. Recommended Next Slice

- `Slice 6P - create STAGE_ENV_FILE operator-side and upload as stage secret`

Important:

- Slice 6P should not deploy
- Slice 6P should not print secret values
- Slice 6P should not commit real env
- Slice 6P may verify secret name only after upload

## 11. Explicit Non-Goals

- no deploy
- no docker compose up
- no real `.env` creation
- no server changes
- no SSH
- no nginx reload
- no certbot changes
- no workflow changes
- no runtime changes
- no script changes
- no compose changes
- no Dockerfile changes
- no source changes
