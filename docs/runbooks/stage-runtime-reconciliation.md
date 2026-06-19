# Stage Runtime Reconciliation

## Purpose

Stage Runtime Reconciliation is a one-time stage-only repair workflow.

It is not an application deployment.
It does not change application image refs.
It only canonicalizes the live stage runtime back to:

- `/opt/warehub/stage/.env`
- `/opt/warehub/stage/docker-compose.yml`

The workflow exists because the current gateway runtime still points at:

- `/opt/warehub/stage/.env.gateway-candidate`
- `/opt/warehub/stage/docker-compose.gateway-candidate.yml`

Production is out of scope.

## Trigger

Run `.github/workflows/stage-runtime-reconcile.yml` manually with:

```text
confirm_stage_reconciliation=RECONCILE_STAGE_RUNTIME
```

There are no automatic triggers.

The workflow is intended to execute only from the `stage` branch ref:

- `GITHUB_REF=refs/heads/stage`
- `GITHUB_REF_NAME=stage`

Any manual dispatch resolved from another ref, including a default-branch `main` copy used only for workflow registration, must fail closed before SSH key setup, candidate preparation, tar streaming, SSH, or any stage mutation.

## Safety Model

The workflow reuses the same trust model as Stage Compose Preflight:

- pinned `STAGE_SSH_KNOWN_HOSTS`
- `StrictHostKeyChecking=yes`
- `STAGE_SSH_KEY`
- exact deploy path `/opt/warehub/stage`
- exact compose project `warehub-stage`
- one tar stream into one SSH session
- candidate extraction only under `/tmp/warehub-stage-reconcile.XXXXXXXX`
- symlink rejection
- candidate whitelist enforcement
- checksum validation before reconciliation

The candidate bundle contains only:

- `.env`
- `docker-compose.yml`
- `verify-gateway-only-ports.py`
- `run-stage-runtime-reconciliation.sh`
- `candidate.sha256`
- `metadata.env`

`metadata.env` is parsed as raw text.
It is never executed with `source`, `.`, or `eval`.
Only these keys are allowed:

- `SOURCE_COMMIT_SHA`
- `EXPECTED_LIVE_ENV_SHA256`
- `EXPECTED_LIVE_COMPOSE_SHA256`

`SOURCE_COMMIT_SHA` must equal the actual workflow source provenance from `github.sha`.
The workflow validates that:

- `GITHUB_SHA` matches the lowercase 40-character SHA format
- `git rev-parse HEAD` equals `GITHUB_SHA`

No hardcoded historical stage commit SHA is used.

## Workflow Summary

The helper:

1. Validates candidate bundle shape, checksums, metadata syntax, and live hash guards.
2. Fails closed unless the workflow checkout is exactly the `stage` ref and `github.sha` matches the checked out commit.
3. Verifies that the candidate `.env` still matches the currently running six image refs.
4. Verifies that the current gateway container still points at the two legacy gateway-candidate files.
5. Creates a backup under `/opt/warehub/backups/stage/runtime-reconcile-<UTC timestamp>-<short sha>`.
6. Prepares same-filesystem temp files in `/opt/warehub/stage` and fails closed on stale `.reconcile-new` files.
7. Enables rollback traps before the first live rename.
8. Atomically promotes the canonical `.env` and `docker-compose.yml`.
9. Recreates only `gateway`.
10. Polls localhost readiness at `http://127.0.0.1:8940/gateway/healthz`.
11. Runs bounded public smoke checks only after localhost readiness succeeds.
12. Verifies non-gateway container IDs stay unchanged.
13. Verifies the pre/post volume snapshot is identical.
14. Verifies gateway labels now point only to `/opt/warehub/stage/.env` and `/opt/warehub/stage/docker-compose.yml`.
15. Deletes the two legacy gateway-candidate files only after validation is complete.

The only allowed Docker lifecycle command is:

```text
docker compose --project-name warehub-stage --env-file <approved-env> -f <approved-compose> up -d --no-deps --force-recreate gateway
```

The workflow must not:

- deploy a new application version
- change application image refs
- recreate non-gateway services
- run `docker compose pull`
- run `docker compose down`
- touch production

## State Machine And Rollback

The helper uses explicit runtime states:

- `PRE_MUTATION`
- `PROMOTION_STARTED`
- `PROMOTED`
- `GATEWAY_RECREATED`
- `VALIDATED`
- `ROLLBACK_RUNNING`
- `ROLLED_BACK`
- `COMPLETED`

Signals `INT`, `TERM`, and `HUP` are trapped before the first live mutation.

Rules:

- before the first live mutation, failure exits without rollback
- after the first live mutation, ordinary failure, signal, or unexpected shell error triggers rollback exactly once
- rollback signals are ignored while rollback is already running
- rollback is disabled after successful validation, before legacy cleanup begins

Rollback restores:

- the previous canonical `.env`
- the previous canonical `docker-compose.yml`
- the previous gateway-candidate env file
- the previous gateway-candidate compose file

Then it recreates only `gateway` against the gateway-candidate pair and re-checks:

- gateway image ref
- gateway immutable image ID
- unchanged non-gateway container IDs
- localhost gateway readiness
- bounded public smoke checks

## Readiness And Smoke Checks

After gateway recreation, the helper first polls:

```text
http://127.0.0.1:8940/gateway/healthz
```

Polling contract:

- attempts: `30`
- interval: `2` seconds
- connect timeout: `2` seconds
- max time per request: `5` seconds

Each request uses:

```text
curl --fail --silent --show-error --location --connect-timeout 2 --max-time 5
```

After localhost readiness succeeds, the helper runs bounded public GET checks for:

- `https://<stage-domain>/gateway/healthz`
- `https://<stage-domain>/login`
- `<STAGE_PUBLIC_API_BASE_URL>/healthz`
- `<STAGE_PUBLIC_SERVICES_API_BASE_URL>/healthz`
- `<STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL>/healthz`

Public checks use the same curl timeout contract and bounded retry loops.

## Volume Invariant

Before the first live mutation, the helper captures a deterministic project volume snapshot and stores it in the backup.

Each snapshot row is keyed by compose service association plus:

- mount type
- volume name
- mount source
- mount destination

After gateway recreation, the helper captures a second snapshot and compares the exact sorted strings.

Any drift fails reconciliation and triggers rollback.

## Backup Contents

Each backup directory stores:

- `live.env`
- `live.docker-compose.yml`
- `gateway-candidate.env`
- `gateway-candidate.docker-compose.yml`
- `container-snapshot.txt`
- `image-refs.txt`
- `image-ids.txt`
- `metadata.txt`
- `volume-snapshot-before.txt`
- `checksums.sha256`

`metadata.txt` preserves audit provenance, including `source_commit_sha=<github.sha>`.

The backup directory uses mode `700`.
Secret-bearing files use mode `600`.

## Exit Codes

The helper uses stable exit codes:

- `0`: reconciliation success
- `10`: reconciliation failed before live mutation
- `20`: reconciliation failed after live mutation and rollback succeeded
- `30`: reconciliation failed after live mutation and rollback failed
- `40`: invalid input or security guard failure
- `50`: reconciliation succeeded, but legacy candidate cleanup is incomplete

The workflow preserves the exact helper exit code.

## Legacy Cleanup Policy

Legacy cleanup is attempted only after:

- localhost gateway readiness succeeds
- public smoke checks succeed
- canonical gateway labels are verified
- non-gateway container IDs are unchanged
- pre/post volume snapshots match
- backup checksums are already verified

If cleanup is incomplete after the canonical runtime is already valid, the helper does not attempt destructive rollback.
Instead it exits with code `50`, keeps the backup, and leaves the canonical runtime active.

## Re-run Behavior

This workflow is intentionally fail-closed after complete success.

After successful reconciliation, the two gateway-candidate files are removed.
A later rerun must fail because the helper requires those files and requires the live gateway container to reference them before promotion.

Registration note:

- a separate default-branch registration slice may be needed so GitHub can see the workflow file
- that registration copy does not imply production execution
- production remains out of scope for this workflow
