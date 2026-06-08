# Slice 6S - Stage Compose Config Preflight Workflow

## 1. Scope

- Goal: add a manual `workflow_dispatch`-only GitHub Actions workflow that performs a server-side stage compose config preflight only.
- Repository root: `I:\WareHub`
- Allowed changes in this slice:
  - `.github/workflows/stage-compose-preflight.yml`
  - this runbook
- This slice does not deploy anything.

## 2. Why Workflow Is Needed

- `STAGE_ENV_FILE` is stored as a GitHub Environment secret.
- `gh` cannot read secret values back after upload.
- The local plaintext stage env file was intentionally deleted after upload.
- A GitHub Actions workflow can consume the environment secret without printing it.

## 3. Workflow Summary

- workflow name: `Stage Compose Preflight`
- workflow file: `.github/workflows/stage-compose-preflight.yml`
- trigger: `workflow_dispatch` only
- environment: `stage`
- timeout: `10` minutes
- concurrency: `stage-compose-preflight`
- the workflow was added in this slice but not executed in this slice
- no deploy
- no `docker compose up`
- no `docker compose pull`
- no migrations

## 4. Files Added

- `.github/workflows/stage-compose-preflight.yml`
- `docs/runbooks/slice-6s-stage-compose-config-preflight-workflow.md`

## 5. Required GitHub Environment Inputs

### Variables

| Variable name | Purpose | Status |
|---|---|---|
| `STAGE_SSH_HOST` | stage server host | required |
| `STAGE_SSH_USER` | stage SSH user | required |
| `STAGE_SSH_PORT` | stage SSH port | required |
| `STAGE_DEPLOY_PATH` | stage deploy path | required |

### Secrets

| Secret name | Purpose | Status |
|---|---|---|
| `STAGE_SSH_KEY` | SSH private key for stage access | required |
| `STAGE_ENV_FILE` | final runtime stage env payload | required |

## 6. Server-Side Actions Performed When Workflow Runs

- write `/opt/warehub/stage/.env`
- copy `docker-compose.yml`
- set restrictive permissions
- run `docker compose config --quiet`
- run `docker ps` filtered by compose project label
- no containers are started by the workflow

## 7. Security Controls

- no secret printing
- no expanded compose output
- no `set -x`
- SSH uses `IdentitiesOnly=yes`
- SSH uses `StrictHostKeyChecking=yes` after `ssh-keyscan`
- the workflow avoids `docker compose ps` to reduce env interpolation and logging risk
- remote `.env` is set to `chmod 600`
- local temporary files are cleaned up
- no nginx reload
- no `docker compose up`
- no `docker compose pull`

## 8. Expected Success Criteria

- after manual workflow execution, the workflow completes successfully
- after manual workflow execution, `docker compose config --quiet` passes
- after manual workflow execution, no WareHub containers are running unless they already existed before the workflow
- after manual workflow execution, no secret values appear in logs

## 9. Risks

- remote `.env` is now present on the server
- `docker compose config` may fail if env and compose content do not match
- `docker ps` filtered by compose project label is a safe read-only check
- the server hosts other projects

## 10. Rollback Notes

- remove `.github/workflows/stage-compose-preflight.yml`
- remove this runbook
- optionally remove `/opt/warehub/stage/.env` manually only if explicitly approved
- do not delete other project files

## 11. Explicit Non-Goals

- no deploy
- no `docker compose up`
- no `docker compose pull`
- no migrations
- no nginx reload
- no source changes
- no Dockerfile changes
- no compose changes
