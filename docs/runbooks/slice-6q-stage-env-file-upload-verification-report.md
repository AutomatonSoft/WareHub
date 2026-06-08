# Slice 6Q - STAGE_ENV_FILE Upload Verification Report

## 1. Scope

- Goal: document that `STAGE_ENV_FILE` was assembled locally outside the repository, validated without printing secret values, uploaded as a GitHub Environment secret, and deleted locally.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- GitHub Environment `stage` exists.
- Stage variables exist.
- Initial stage secrets exist.
- `STAGE_ENV_FILE` was previously missing.
- No deploy was performed.

## 3. STAGE_ENV_FILE Assembly Result

- `STAGE_ENV_FILE` was assembled locally outside the repository.
- Local work directory used:
  - `$env:USERPROFILE\warehub-stage-env-work`
- Local file name used:
  - `stage.env`
- The local file was based on `infra/deploy/stage/env.stage.sanitized.template`.
- Non-secret stage replacements were applied.
- `PROD_PUBLIC_SERVICES_API_BASE_URL` and `PROD_PUBLIC_ORCHESTRATOR_API_BASE_URL` were appended because `infra/scripts/verify-required-env.ps1` requires them.
- No secret values are included in this report.

## 4. Validation Result

- `TODO_UNKNOWN_PRESENT=False`
- `SECRET_PLACEHOLDER_PRESENT=False`
- `STAGE_ENV_FILE_VALIDATION_OK`
- Required keys checked:
  - `ORCHESTRATOR_IMAGE`
  - `ORCHESTRATOR_STAGE_TAG`
  - `ORCHESTRATOR_APP_VERSION`
  - `STAGE_PUBLIC_SERVICES_API_BASE_URL`
  - `PROD_PUBLIC_SERVICES_API_BASE_URL`
  - `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL`
  - `PROD_PUBLIC_ORCHESTRATOR_API_BASE_URL`

## 5. Secret Upload Result

- `STAGE_ENV_FILE` was uploaded as GitHub Environment secret `STAGE_ENV_FILE`.
- `STAGE_POSTGRES_PASSWORD` and `STAGE_SERVICES_SECRET_KEY` were regenerated and updated so they match the uploaded `STAGE_ENV_FILE`.
- `gh secret list --env stage` confirmed secret names only:
  - `STAGE_ENV_FILE`
  - `STAGE_GHCR_TOKEN`
  - `STAGE_POSTGRES_PASSWORD`
  - `STAGE_SERVICES_SECRET_KEY`
  - `STAGE_SSH_KEY`
- Secret values were not printed.

## 6. Local Cleanup Result

- The local `stage.env` file was deleted.
- `Test-Path $StageEnvFile` returned `False`.
- Final `git status` was clean.

## 7. PowerShell Expected-Output Typo Note

- Later `TODO_UNKNOWN_PRESENT=...`, `SECRET_PLACEHOLDER_PRESENT=...`, and `STAGE_ENV_FILE_VALIDATION_OK` lines were accidentally typed as commands.
- Those later commands produced `CommandNotFound` errors.
- They did not affect the successful `STAGE_ENV_FILE` validation, upload, or cleanup.
- Actual validation had already succeeded before upload.

## 8. Commands Executed

Command shapes only. No values or `STAGE_ENV_FILE` contents are included.

- create work directory
- copy sanitized template to local operator-only file
- apply non-secret replacements
- append required `PROD_PUBLIC_*` keys
- generate passwords
- `gh secret set STAGE_POSTGRES_PASSWORD --env stage --body <value>`
- `gh secret set STAGE_SERVICES_SECRET_KEY --env stage --body <value>`
- validation without printing file contents
- `gh secret set STAGE_ENV_FILE --env stage`
- `gh secret list --env stage`
- `Remove-Item $StageEnvFile`
- `Test-Path $StageEnvFile`

## 9. Remaining Blockers Before First Stage Deploy

- `docker compose config` not run with real env
- migration plan not executed
- deploy workflow not added
- cert renewal automation not confirmed
- nginx upstream still returns `502` until containers run

## 10. Recommended Next Slice

- `Slice 6R - stage compose config preflight with STAGE_ENV_FILE, no deploy`

Important:

- `/opt/warehub/stage/.env` may be written only after explicit approval
- the slice should run `docker compose config` only
- the slice should not run `docker compose up`

## 11. Explicit Non-Goals

- no deploy
- no docker compose up
- no `.env` committed
- no `.env` written to server
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
