# Slice 6M - Stage GitHub Environment Checklist Report

## 1. Scope

- Goal: prepare a planning-only checklist for manually creating and verifying the GitHub Environment `stage` secrets and variables defined in Slice 6L.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This slice does not deploy anything.
- This slice does not create or modify GitHub Secrets or Variables.

## 2. Confirmed Baseline

- Slice 6L contract exists.
- Stage GitHub Environment is planned.
- No deploy has been performed yet.
- No GitHub Secrets or Variables were changed in this slice.

## 3. Stage GitHub Environment Creation Checklist

- open repository `Settings`
- open `Environments`
- create or select environment `stage`
- keep deployment branches scoped to `stage`
- optionally configure reviewers later
- add required secrets
- add required variables

## 4. Required Stage Secrets Checklist

| Secret name | Required/optional | Source | Entered in GitHub | Verified without printing value |
|---|---|---|---|---|
| `STAGE_SSH_KEY` | required | Slice 6L stage secret contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_ENV_FILE` | required | Slice 6L stage secret contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_GHCR_TOKEN` | required | Slice 6L stage secret contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_POSTGRES_PASSWORD` | required | Slice 6L stage secret contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_SERVICES_SECRET_KEY` | required | Slice 6L stage secret contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_BACKEND_SENTRY_DSN` | optional | Slice 6L stage secret contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_BACKEND_UPLOAD_FTP_PASS` | optional | Slice 6L stage secret contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_AFTERBUY_JV_PASS` | required if integration enabled | Slice 6L stage secret contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_AFTERBUY_XL_PASS` | required if integration enabled | Slice 6L stage secret contract | `TODO / unknown` | `TODO / unknown` |

## 5. Required Stage Variables Checklist

| Variable name | Proposed value | Source | Entered in GitHub | Verified |
|---|---|---|---|---|
| `STAGE_DOMAIN` | `stagewarehub.automatonsoft.de` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_SSH_HOST` | `217.160.149.34` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_SSH_USER` | `cddeploy` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_SSH_PORT` | `22` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_DEPLOY_PATH` | `/opt/warehub/stage` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_FRONTEND_PORT` | `8941` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_BACKEND_PORT` | `8942` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_POSTGRES_PORT` | `8943` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_SERVICES_PORT` | `8944` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_ORCHESTRATOR_PORT` | `8945` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_GHCR_USERNAME` | `RavilkaDev0` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_IMAGE_TAG` | `stage-a1c2946` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_BACKEND_IMAGE` | `ghcr.io/ravilkadev0/warehub/backend` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_FRONTEND_IMAGE` | `ghcr.io/ravilkadev0/warehub/frontend` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_MOBILE_IMAGE` | `ghcr.io/ravilkadev0/warehub/mobile` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_SERVICES_IMAGE` | `ghcr.io/ravilkadev0/warehub/services` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_ORCHESTRATOR_IMAGE` | `ghcr.io/ravilkadev0/warehub/orchestrator` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |
| `STAGE_INFRA_IMAGE` | `ghcr.io/ravilkadev0/warehub/infra` | Slice 6L stage variable contract | `TODO / unknown` | `TODO / unknown` |

## 6. Safe Verification Plan

Command shapes only. NOT EXECUTED in this slice.

```bash
gh secret list --env stage
gh variable list --env stage
```

Notes:

- secret values must never be printed
- only secret names should be verified
- variables may show values, but should still be reviewed carefully before sharing logs

## 7. STAGE_ENV_FILE Checklist

- must be assembled from `infra/deploy/stage/env.stage.sanitized.template`
- must contain the real runtime env payload for stage
- must be stored as a GitHub Environment secret
- must never be committed
- must not be printed in logs
- should be validated by name and existence only

## 8. Risk Notes

- `STAGE_ENV_FILE` as one large secret is convenient but harder to audit
- separate secrets are easier to rotate
- real values must come from password manager or operator records, not from the repository
- exposed GHCR token must be revoked or replaced if not already done
- stage and prod secrets must remain separate even if values temporarily match

## 9. Completion Criteria For This Checklist

- environment `stage` exists
- all required secrets exist
- all required variables exist
- no secret values are printed
- repo-safety remains green
- no real `.env` committed

## 10. Remaining Blockers Before First Stage Deploy

- GitHub Environment not verified yet
- `STAGE_ENV_FILE` not created or verified yet
- `docker compose config` not run with real env
- migration plan not executed
- deploy workflow not added
- cert renewal automation not confirmed
- nginx upstream still returns `502` until containers run

## 11. Recommended Next Slice

- `Slice 6N - prepare STAGE_ENV_FILE assembly and validation plan`

Important:

- Slice 6N should not deploy
- Slice 6N should not print secret values
- Slice 6N should not commit real `.env`
- Slice 6N may prepare local or operator-only generation steps

## 12. Explicit Non-Goals

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
