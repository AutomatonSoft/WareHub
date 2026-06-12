# Env Contract

## Purpose

This runbook defines the local env contract for the WareHub monorepo.

- Scope: local developer workflow only
- Root `.env` is the only manually maintained local env file
- Root `.env` is private and git-ignored
- Real secret values must never be committed, printed, or copied into docs
- Stage and prod continue to use sanitized deploy templates and runtime server env files

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
- Stage: sanitized templates in `infra/deploy/stage/` plus runtime server `.env`
- Production: sanitized templates in `infra/deploy/prod/` plus runtime server `.env`

Do not copy local secrets into stage/prod templates.

## Add A New Variable Safely

1. Add the variable to the owning runtime code with a safe default or explicit required check.
2. Add a safe placeholder to root `.env.example`.
3. If browser-visible, prefix it with `NEXT_PUBLIC_`.
4. Update this runbook inventory row or family pattern.
5. Run `scripts/environment/validate-env-contract.ps1`.
6. Validate local startup from repo root.

## Validation

Run from `I:\WareHub`:

```powershell
.\scripts\environment\validate-env-contract.ps1
.\start-dev.ps1 -NoNewWindows
curl.exe -i http://localhost:8932/api/v1/healthz
curl.exe -i http://localhost:8934/healthz
curl.exe -i http://localhost:8935/healthz
curl.exe -i http://localhost:8931/login
```

Use a JSON file or `ConvertTo-Json` for password reset verification. Do not use broken inline PowerShell single-quote JSON quoting.

## Inventory Matrix

| Variable name | Owner/service | Required/optional | Default if any | Root `.env` key | Local example | Stage/prod placeholder | Secret/public/internal | Source location / usage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DEV_FRONTEND_PORT` | infra/local compose | Required | `8931` | `DEV_FRONTEND_PORT` | `8931` | `STAGE_FRONTEND_PORT` / `PROD_FRONTEND_PORT` | internal | `infra/local/docker-compose.dev.yml` |
| `DEV_BACKEND_PORT` | infra/local compose | Required | `8932` | `DEV_BACKEND_PORT` | `8932` | `STAGE_BACKEND_PORT` / `PROD_BACKEND_PORT` | internal | `infra/local/docker-compose.dev.yml` |
| `DEV_POSTGRES_*` | infra/local compose | Required | local defaults | same names | `warehub` / `localhost` | `STAGE_POSTGRES_*` / `PROD_POSTGRES_*` | secret + internal | `infra/local/docker-compose.dev.yml` |
| `DEV_RABBITMQ_*` | infra/local compose | Optional | local defaults | same names | `warehub` | no direct deploy equivalent | secret + internal | `infra/local/docker-compose.dev.yml` |
| `MINIO_ROOT_*` | infra/local compose | Optional | `minio` / placeholder | same names | `minio` | deploy-specific secret storage | secret | `infra/local/docker-compose.dev.yml` |
| `BACKEND_ORIGIN` | frontend server runtime | Required | `http://localhost:8932` | `BACKEND_ORIGIN` | `http://localhost:8932` | deploy container origin | internal | `apps/frontend/next.config.mjs` |
| `SERVICES_ORIGIN` | frontend server runtime | Required | `http://localhost:8934` | `SERVICES_ORIGIN` | `http://localhost:8934` | deploy container origin | internal | `apps/frontend/next.config.mjs`, API proxy routes |
| `NEXT_PUBLIC_API_BASE_URL` | frontend browser runtime | Required | none | `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8932/api/v1` | `STAGE_PUBLIC_API_BASE_URL` / `PROD_PUBLIC_API_BASE_URL` | public | frontend pages/components |
| `NEXT_PUBLIC_SERVICES_API_BASE_URL` | frontend browser runtime | Required | none | `NEXT_PUBLIC_SERVICES_API_BASE_URL` | `http://localhost:8934` | `STAGE_PUBLIC_SERVICES_API_BASE_URL` / `PROD_PUBLIC_SERVICES_API_BASE_URL` | public | frontend data clients |
| `NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL` | frontend browser runtime | Optional | none | `NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL` | `http://localhost:8935` | `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL` / `PROD_PUBLIC_ORCHESTRATOR_API_BASE_URL` | public | frontend OpenAPI helpers |
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

