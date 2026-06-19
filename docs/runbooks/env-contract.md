# Env Contract

## Purpose

This runbook defines the local and deploy env contract for the WareHub monorepo.

- Root `.env` is the only manually maintained local env file
- Root `.env` is private and git-ignored
- Real secret values must never be committed, printed, or copied into docs
- Stage and prod use sanitized deploy templates plus ignored live runtime env files

## Local Source Of Truth

For local startup from repo root:

```powershell
Set-Location I:\WareHub
.\start-dev.ps1 -NoNewWindows
```

`start-dev.ps1` now loads repo-root `.env` first and uses it as the source of truth for:

- local Docker dependency compose variables
- frontend dev server environment
- backend runtime environment
- database-service runtime environment
- orchestrator runtime environment

Per-service real env files are no longer the intended manually maintained source files:

- `apps/backend/.env`
- `apps/frontend/.env.local`
- `services/database-service/.env`
- `services/orchestrator/.env`

Legacy per-service files may still exist as fallback artifacts for direct manual service runs, but root `.env` must win when both exist.

## Precedence Rules

Local precedence order is:

1. process environment injected by `start-dev.ps1`
2. derived safe local DB runtime from `DEV_POSTGRES_*`
3. repo-root `.env`
4. repo-root `infra/.env` if present as a legacy fallback
5. per-service local env file only as a last fallback

This preserves legacy direct-run support without letting service-local files silently override the root contract.

For local startup, `start-dev.ps1` marks child processes with `WAREHUB_LOCAL_DEV_ROOT_ENV_ACTIVE=true` and derives a safe local DB runtime from `DEV_POSTGRES_*`.
That local runtime overrides any generic nonlocal `DATABASE_URL` for backend and database-service process startup without editing the real root `.env`.
The local compose/runtime DB contract is fixed to the local-safe values `warehub/warehub/warehub` on `localhost:<DEV_POSTGRES_PORT>` during `start-dev.ps1`.

## Public vs Secret

- `NEXT_PUBLIC_*` variables are browser-visible and must be safe for client bundles
- non-`NEXT_PUBLIC_*` variables are internal-only unless explicitly documented otherwise
- secrets such as passwords, API keys, SMTP credentials, tokens, and DSNs belong only in ignored local/stage/prod runtime env files

## SMTP Notes

Verified local ALL-INKL shape:

- `SMTP_HOST=wXXXXXXX.kasserver.com`
- `SMTP_PORT=587`
- `SMTP_INSECURE=false`
- `SMTP_FROM=mailbox@example.com`
- `PASSWORD_RESET_CODE_TTL_MINUTES=10`
- `PASSWORD_RESET_LOG_CODES=false`

Default recommendation for `.env`:

- use plain mailbox sender: `SMTP_FROM=mailbox@example.com`

Do not default to display-name sender format such as `WareHub <mailbox@example.com>` unless the runtime parser has been explicitly verified to preserve it correctly.

If SMTP credentials are missing locally, local password-reset fallback logging may still be used for development, but `PASSWORD_RESET_LOG_CODES` must remain `false` outside explicit local-only debugging.

## Local vs Deploy Mapping

- Local: repo-root `.env`
- Stage template: `infra/deploy/stage/env.stage.sanitized.template`
- Stage live runtime: `/opt/warehub/stage/.env` on the stage host
- Production: sanitized templates in `infra/deploy/prod/` plus runtime server `.env`

Do not copy local secrets into stage/prod templates.
Do not copy live stage/prod secrets back into the repository.

## Stage Compose Preflight

Stage Compose Preflight is a read-only validation workflow, not a deployment.

The workflow:

- reads the candidate stage env from the `STAGE_ENV_FILE` GitHub Environment secret
- requires the `STAGE_SSH_KNOWN_HOSTS` GitHub Environment secret with trusted pinned known_hosts entries for the stage host
- validates that env locally with `infra/scripts/verify-required-env.ps1 -InputKind Runtime`
- sends candidate files through one tar stream into one SSH session
- extracts candidate files only to `/tmp/warehub-stage-preflight.*` on the stage host
- runs `docker compose config --quiet` against the candidate files
- runs `infra/scripts/verify-gateway-only-ports.py` against the candidate files
- verifies live `/opt/warehub/stage/.env` and `docker-compose.yml` hashes do not change
- verifies the stage Compose project container IDs do not change
- removes only the temporary candidate directory through a remote trap

The workflow must not:

- copy candidate files into `/opt/warehub/stage`
- modify live stage files
- restart, stop, start, pull, or recreate containers
- print secret values
- print candidate env hashes
- run deployment commands
- use dynamic `ssh-keyscan` trust bootstrap

Allowed remote validation commands are limited to file checks, `tar`, `chmod`, `sha256sum --check --status`, `docker ps`, `docker compose config --quiet`, and the gateway-only port validator.

Create the trusted `STAGE_SSH_KNOWN_HOSTS` value outside CI through a trusted channel. Do not promote a host key observed from an untrusted network into the trusted pin.

## Stage Runtime Reconciliation

Stage Runtime Reconciliation is a one-time operational repair workflow, not an application deployment.

It is used only to canonicalize stage runtime files back to:

- `/opt/warehub/stage/.env`
- `/opt/warehub/stage/docker-compose.yml`

while preserving the currently running application image refs.

The workflow:

- reads the candidate stage env from `STAGE_ENV_FILE`
- requires the same pinned SSH trust model as Stage Compose Preflight
- parses `metadata.env` as raw text and never executes it with `source`, `.`, or `eval`
- validates that the candidate env still matches the currently running six image refs
- backs up the live canonical files plus the current gateway-candidate files under `/opt/warehub/backups/stage`
- atomically promotes the canonical live `.env` and Compose files
- recreates only the `gateway` container
- enables rollback traps before the first live rename and rolls back on post-mutation `INT`, `TERM`, `HUP`, or unexpected shell failure
- polls `http://127.0.0.1:8940/gateway/healthz` before any public smoke checks with:
  - `30` attempts
  - `2s` interval
  - `2s` connect timeout
  - `5s` max time
- verifies that non-gateway containers and persistent volumes do not change
- captures exact pre/post volume snapshots by compose service plus mount metadata and fails on any drift
- verifies that gateway labels point only to the canonical live files
- deletes `/opt/warehub/stage/.env.gateway-candidate` and `/opt/warehub/stage/docker-compose.gateway-candidate.yml` only after success

Stable helper exit codes:

- `0` success
- `10` failed before live mutation
- `20` failed after live mutation and rollback succeeded
- `30` failed after live mutation and rollback failed
- `40` invalid input or security guard failure
- `50` canonical runtime succeeded but legacy candidate cleanup is incomplete

The workflow must not:

- deploy a new application version
- change application image refs
- run `docker compose pull`
- run `docker compose down`
- recreate non-gateway services
- touch production

If post-promotion validation fails, the workflow restores the prior canonical files, restores the gateway-candidate files, recreates only `gateway` against the gateway-candidate pair, and reports rollback success or failure separately.

If cleanup of the legacy gateway-candidate files becomes incomplete after the canonical runtime is already valid, the workflow keeps the canonical runtime active, preserves the backup, and exits non-zero without attempting destructive rollback.

## Stage Required Env Contract

Stage SMTP is required. Missing SMTP host, port, username, password, sender, or security mode is a configuration error.

`PASSWORD_RESET_LOG_CODES=true` is allowed only for explicit local debugging. Stage and production must keep reset code logging disabled.

`Template` validation is for committed sanitized templates. Template placeholders such as `CHANGE_ME`, `stage-CHANGE_ME`, `v0.0.0`, and `__SET_OUTSIDE_GIT__` are allowed only in this mode, but typed keys still must be valid ports, booleans, integers, or sample-rate floats.

`Runtime` validation is for real candidate env content from GitHub Environment secrets. Runtime validation rejects placeholder markers and values containing `CHANGE_ME`.

`BACKEND_STAGE_SENTRY_DSN` must be present in stage templates but may be empty. In runtime env it may be missing or empty; if it is non-empty it must not contain placeholder markers. Sentry sample-rate keys must be valid floats from 0 to 1 when present.

When `BACKEND_UPLOAD_STORAGE_BACKEND=ftp`, the stage env must also include the FTP host, user, password, port, root directory, storage root directory, avatar directory, and public base URL.

Validate the sanitized stage template from the repository root:

```powershell
./infra/scripts/tests/verify-required-env.tests.ps1
./infra/scripts/verify-required-env.ps1 -EnvFile infra/deploy/stage/env.stage.sanitized.template -Environment stage -InputKind Template
docker compose --env-file infra/deploy/stage/env.stage.sanitized.template -f infra/deploy/stage/docker-compose.yml config --quiet
python infra/scripts/verify-gateway-only-ports.py `
  --compose infra/deploy/stage/docker-compose.yml `
  --env-file infra/deploy/stage/env.stage.sanitized.template `
  --expected-gateway-port 8940
```

## Add A New Variable Safely

1. Add the variable to the owning runtime code with a safe default or explicit required check.
2. Add a safe placeholder to root `.env.example`.
3. If browser-visible, prefix it with `NEXT_PUBLIC_`.
4. If stage requires it, add it to `infra/deploy/stage/env.stage.sanitized.template` and the stage validator.
5. Update this runbook inventory row or family pattern.
6. Run `scripts/environment/validate-env-contract.ps1`.
7. Validate local startup from repo root.

## Validation

Run from `I:\WareHub`:

```powershell
.\scripts\environment\validate-env-contract.ps1
.\start-dev.ps1 -NoNewWindows
curl.exe -i http://localhost:8932/api/v1/healthz
curl.exe -i http://localhost:8934/api/v1/healthz
curl.exe -i http://localhost:8935/api/v1/healthz
curl.exe -i http://localhost:8931/login
```

Use a JSON file or `ConvertTo-Json` for password reset verification. Do not use broken inline PowerShell single-quote JSON quoting.

## Inventory Matrix

| Variable name | Owner/service | Required/optional | Default if any | Root `.env` key | Local example | Stage/prod placeholder | Secret/public/internal | Source location / usage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DEV_FRONTEND_PORT` | infra/local compose | Required | `8931` | `DEV_FRONTEND_PORT` | `8931` | Docker-internal `frontend:8931`; no deploy host port | internal | `infra/local/docker-compose.dev.yml` |
| `DEV_BACKEND_PORT` | infra/local compose | Required | `8932` | `DEV_BACKEND_PORT` | `8932` | Docker-internal `backend:8932`; no deploy host port | internal | `infra/local/docker-compose.dev.yml` |
| `DEV_POSTGRES_*` | infra/local compose | Required | local defaults | same names | `warehub` / `localhost` | `STAGE_POSTGRES_*` / `PROD_POSTGRES_*` | secret + internal | `infra/local/docker-compose.dev.yml` |
| `DEV_RABBITMQ_*` | infra/local compose | Optional | local defaults | same names | `warehub` | no direct deploy equivalent | secret + internal | `infra/local/docker-compose.dev.yml` |
| `MINIO_ROOT_*` | infra/local compose | Optional | `minio` / placeholder | same names | `minio` | deploy-specific secret storage | secret | `infra/local/docker-compose.dev.yml` |
| `BACKEND_ORIGIN` | frontend server runtime | Required | `http://localhost:8932` | `BACKEND_ORIGIN` | `http://localhost:8932` | deploy container origin | internal | `apps/frontend/next.config.mjs` |
| `SERVICES_ORIGIN` | frontend server runtime | Required | `http://localhost:8934` | `SERVICES_ORIGIN` | `http://localhost:8934` | deploy container origin | internal | `apps/frontend/next.config.mjs`, API proxy routes |
| `NEXT_PUBLIC_API_BASE_URL` | frontend browser runtime | Required | none | `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8932/api/v1` | `STAGE_PUBLIC_API_BASE_URL` / `PROD_PUBLIC_API_BASE_URL` | public | frontend pages/components |
| `NEXT_PUBLIC_SERVICES_API_BASE_URL` | frontend browser runtime | Required | none | `NEXT_PUBLIC_SERVICES_API_BASE_URL` | `http://localhost:8934/api/v1` | `STAGE_PUBLIC_SERVICES_API_BASE_URL` / `PROD_PUBLIC_SERVICES_API_BASE_URL` | public | frontend data clients |
| `NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL` | frontend browser runtime | Optional | none | `NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL` | `http://localhost:8935/api/v1` | `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL` / `PROD_PUBLIC_ORCHESTRATOR_API_BASE_URL` | public | frontend OpenAPI helpers |
| `DATABASE_URL` | backend + database-service | Required | none | `DATABASE_URL` | `postgres://...@localhost:8933/warehub` | deploy runtime DB URL | secret | `apps/backend/src/main.rs`, `database_service/settings.py` |
| `APP_ENV` / `APP_PORT` | backend | Required/optional | `dev` / `8932` | same names | `dev` / `8932` | deploy runtime env | internal | `apps/backend/src/main.rs` |
| `CORS_ALLOW_ORIGINS` | backend | Optional | localhost list | `CORS_ALLOW_ORIGINS` | localhost origins | deploy origin list | internal | `apps/backend/src/app_router.rs` |
| `SMTP_*` | backend | Required for real email | `587` / `false` for some keys | same names | ALL-INKL host + mailbox sender | `STAGE_SMTP_*` / `PROD_SMTP_*` | secret except host/port | `apps/backend/src/email.rs` |
| `PASSWORD_RESET_CODE_TTL_MINUTES` | backend | Optional | `10` | same name | `10` | `STAGE_PASSWORD_RESET_CODE_TTL_MINUTES` / prod equivalent | internal | `apps/backend/src/auth/handlers_password_reset.rs` |
| `PASSWORD_RESET_LOG_CODES` | backend | Optional | `false` | same name | `false` | `STAGE_PASSWORD_RESET_LOG_CODES` / prod equivalent | internal | `apps/backend/src/auth/handlers_password_reset.rs` |
| `SECRET_KEY` | database-service | Required outside throwaway local fallback | none | `SECRET_KEY` | placeholder only | deploy runtime secret | secret | `database_service/settings.py` |
| `ALLOWED_HOSTS` | database-service | Optional | localhost list | `ALLOWED_HOSTS` | `127.0.0.1,localhost` | deploy host list | internal | `database_service/settings.py` |
| `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` | database-service | Optional | localhost + deployed domains | same names | localhost origins | deploy origin list | internal | `database_service/settings.py` |
| `BACKEND_AUTH_BASE_URL` | database-service | Optional | local backend API | same name | `http://127.0.0.1:8932/api/v1` | deploy backend internal URL | internal | `database_service/settings.py` |
| `BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS` | database-service | Optional | localhost list | same name | `localhost,127.0.0.1` | deploy trusted host list | internal | `database_service/settings.py` |
| `DATABASE_SERVICE_BASE_URL` | orchestrator | Required | `http://localhost:8934` | same name | `http://localhost:8934` | `STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL` / prod equivalent | internal | `services/orchestrator/src/sofort_orchestrator/infra/settings.py` |
| `ORCHESTRATOR_*` | orchestrator | Optional | code defaults | same names | local defaults | same names in deploy templates | internal | `services/orchestrator/src/sofort_orchestrator/infra/settings.py` |
| `SENTRY_*` / `NEXT_PUBLIC_SENTRY_*` | frontend + backend | Optional | sample rates only | same names | placeholders | deploy-specific secrets | secret + public mixed | sentry configs |
| `AFTERBUY_*` | backend + database-service | Optional | URL defaults for some keys | same names | placeholder only | deploy runtime env | secret + internal | backend/service integrations |
| `HOOD_*` | database-service | Optional | code defaults for some keys | same names | placeholder only | deploy runtime env | secret + internal | `hood_service/*` |
| `UPLOAD_*` | backend + database-service | Optional | local or placeholder defaults | same names | placeholder only | deploy runtime env | secret + internal | backend upload modules, `database/ftp_upload.py` |
| `OPENAI_*` | database-service | Optional | model default only | same names | placeholder only | deploy runtime env | secret | `catalog_core/translation_openai.py` |
| `JV_SITE_KEYS` | database-service | Optional | none | `JV_SITE_KEYS` | `JV_DE,JV_AT` | runtime-specific | internal | `jv_services/source_config.py` |
| `JV_SOURCE_<SITE>_DB_*` | database-service | Optional | `3306` / `oc_` for some keys | same family | `JV_SOURCE_JV_DE_DB_HOST=...` | runtime-specific | secret | `jv_services/source_config.py` |
| `XL_SOURCE_<SITE>_DB_*` | database-service | Optional | `3306` / `oc_` for some keys | same family | `XL_SOURCE_XLMOEBEL_DE_DB_HOST=...` | runtime-specific | secret | `xl_services/source_config.py` |
| `FTP_<SITE>_*` | database-service | Optional | `21` for port | same family | `FTP_DE_HOST=...` | runtime-specific | secret | `jv_services/sync_utils.py` |
