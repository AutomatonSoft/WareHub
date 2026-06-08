# Slice 6R - Stage Compose Config Preflight Plan

## 1. Scope

- Goal: define the next server-side preflight for stage by writing `STAGE_ENV_FILE` to `/opt/warehub/stage/.env` only after explicit approval and running `docker compose config` only.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This slice is planning-only.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- `STAGE_ENV_FILE` is uploaded as a GitHub Environment secret in environment `stage`.
- Server access is verified.
- GHCR pull is verified.
- DNS/TLS/nginx read-only preflight is complete.
- No deploy has been performed.

## 3. Purpose Of The Next Server-Side Preflight

- write `STAGE_ENV_FILE` to `/opt/warehub/stage/.env` only after explicit approval
- copy or verify `docker-compose.yml` is available under the stage deploy path
- run `docker compose config` only
- do not run `docker compose up`
- do not start containers
- do not run migrations

## 4. Required Inputs

| Input | Source | Status |
|---|---|---|
| `STAGE_ENV_FILE` secret | GitHub Environment `stage` secret | confirmed by name |
| `STAGE_SSH_KEY` secret | GitHub Environment `stage` secret | confirmed by name |
| `STAGE_SSH_HOST` variable | GitHub Environment `stage` variable | confirmed |
| `STAGE_SSH_USER` variable | GitHub Environment `stage` variable | confirmed |
| `STAGE_SSH_PORT` variable | GitHub Environment `stage` variable | confirmed |
| `STAGE_DEPLOY_PATH` variable | GitHub Environment `stage` variable | confirmed |
| `infra/deploy/stage/docker-compose.yml` | repository compose file | confirmed |
| `infra/scripts/verify-required-env.ps1` | repository preflight script | confirmed |

## 5. Safe Local/Operator Command Plan

Command shapes only. NOT EXECUTED in this slice.

- `gh secret list --env stage`
- `gh variable list --env stage`
- create a temporary local file from `STAGE_ENV_FILE` only if needed, without printing it
- write the remote file using SSH only after explicit approval
- remove the temporary local file after use

Important:

- this slice does not execute any of these commands
- `STAGE_ENV_FILE` contents must not be printed

## 6. Safe Server Command Plan After Explicit Approval

Command shapes only. NOT EXECUTED in this slice.

- `mkdir -p /opt/warehub/stage`
- write `/opt/warehub/stage/.env` with restrictive permissions
- upload or copy `docker-compose.yml` to `/opt/warehub/stage/docker-compose.yml` if needed
- `docker compose --env-file /opt/warehub/stage/.env -f /opt/warehub/stage/docker-compose.yml config`
- `docker compose --env-file /opt/warehub/stage/.env -f /opt/warehub/stage/docker-compose.yml config --quiet`
- do not run `up`
- do not run `pull` unless explicitly approved
- do not run migrations

## 7. Validation Checks Expected

- compose config parses successfully
- all required env keys are present
- no unresolved `${VAR}` warnings remain
- service images resolve to the stage tag
- ports match `8941` to `8945`
- volumes are stage-scoped
- no prod DB or prod storage credentials are used
- no secrets are printed in logs

## 8. Risks And Controls

- writing `.env` to the server is a server change and requires explicit approval
- `docker compose config` can reveal interpolated secret values if full output is printed
- prefer `--quiet` or redirected output where possible
- if full config output is needed, secrets must be scrubbed before sharing
- never paste `.env` or expanded compose config into chat
- do not run `docker compose up`

## 9. Existing Server Safety Notes

- the server hosts other projects
- do not run `docker system prune`
- do not reload nginx
- do not perform global Docker, network, or volume cleanup
- use the isolated stage path and compose project name `warehub-stage`

## 10. Recommended Execution Gate

- explicit approval is given
- `STAGE_ENV_FILE` exists by name
- local working tree is clean
- `stage` branch is up to date
- SSH access works
- target path is confirmed
- no deploy, `up`, or migration execution is allowed

## 11. Remaining Blockers Before First Stage Deploy

- compose config preflight is not executed yet
- migration plan is not executed
- deploy workflow is not added
- cert renewal automation is not confirmed
- nginx upstream still returns `502` until containers run
- first stage smoke tests are not defined

## 12. Recommended Next Slice

- `Slice 6S - execute stage compose config preflight, no deploy`

Important:

- `/opt/warehub/stage/.env` may be written only after explicit approval
- that slice may run `docker compose config` only
- that slice must not run `docker compose up`

## 13. Explicit Non-Goals

- no deploy
- no docker compose up
- no `.env` write in this slice
- no server changes
- no SSH
- no GitHub Secrets changes
- no GitHub Variables changes
- no nginx reload
- no certbot changes
- no workflow changes
- no runtime changes
- no script changes
- no compose changes
- no Dockerfile changes
- no source changes
