# Stage And Production Secret Inventory

Date: 2026-07-02

This file documents which GitHub secrets and variables are actively used by the current `stage` and `production` deploy flows.

Real secret values are intentionally not included.

## Scope

- Active workflow inputs for:
  - `.github/workflows/stage-deploy.yml`
  - `.github/workflows/prod-deploy.yml`
- Current GitHub Environment inventory by secret/variable name
- Current repo-level shared secret inventory
- Legacy secrets that still exist but are not part of the active deploy path

## Source Of Truth

- Stage deploy workflow builds candidate runtime env from:
  - repo secret `SHARED_ENV_FILE`
  - environment secret `STAGE_ENV_FILE`
  - committed template `infra/deploy/stage/env.stage.sanitized.template`
- Production deploy workflow builds candidate runtime env from:
  - repo secret `SHARED_ENV_FILE`
  - environment secret `PROD_ENV_FILE`
  - committed template `infra/deploy/prod/env.prod.sanitized.template`
- Stage/prod application containers now also consume the approved runtime `.env` via compose `env_file`, so generic runtime keys from the overlay can reach the containers even when they are not individually enumerated in the compose `environment:` block.

## Active Repo-Level Shared Secret

This secret is used by both stage and production workflows.

| Name | Scope | Status | Used by |
| --- | --- | --- | --- |
| `SHARED_ENV_FILE` | repository secret | present | `stage-deploy.yml`, `prod-deploy.yml` |

## Active Stage GitHub Environment Inputs

Environment: `stage`

### Required variables

| Name | Status | Purpose |
| --- | --- | --- |
| `STAGE_SSH_HOST` | present | SSH host for stage deploy |
| `STAGE_SSH_USER` | present | SSH user for stage deploy |
| `STAGE_SSH_PORT` | present | SSH port for stage deploy |
| `STAGE_DEPLOY_PATH` | present | remote stage runtime path |

### Required secrets

| Name | Status | Purpose |
| --- | --- | --- |
| `STAGE_SSH_KEY` | present | SSH private key for stage deploy |
| `STAGE_SSH_KNOWN_HOSTS` | present | pinned host key for stage deploy |
| `STAGE_ENV_FILE` | present | stage runtime override layer merged into candidate `.env` |

### Stage completeness result

- Active stage deploy inputs are complete by name for the current workflow shape.
- `SHARED_ENV_FILE` is not stored in the `stage` environment; it is consumed as a repo secret.

## Active Production GitHub Environment Inputs

Environment: `production`

### Required variables

| Name | Status | Purpose |
| --- | --- | --- |
| `PROD_SSH_HOST` | present | SSH host for production deploy |
| `PROD_SSH_USER` | present | SSH user for production deploy |
| `PROD_SSH_PORT` | present | SSH port for production deploy |
| `PROD_DEPLOY_PATH` | present | remote production runtime path |

### Required secrets

| Name | Status | Purpose |
| --- | --- | --- |
| `PROD_SSH_KEY` | present | SSH private key for production deploy |
| `PROD_SSH_KNOWN_HOSTS` | present | pinned host key for production deploy |
| `PROD_ENV_FILE` | present | production runtime override layer merged into candidate `.env` |

### Production completeness result

- Active production deploy inputs are complete by name for the current workflow shape.
- `SHARED_ENV_FILE` is not stored in the `production` environment; it is consumed as a repo secret.
- `PROD_ENV_FILE` was refreshed from the working live production runtime after the successful rollout on 2026-07-02.

## Legacy Or Non-Active Stage Secrets Still Present

These names exist in GitHub Environment `stage`, but the current `stage-deploy.yml` does not read them directly.
Their values should now live inside `STAGE_ENV_FILE` or `SHARED_ENV_FILE`.

| Name | Status | Current role |
| --- | --- | --- |
| `STAGE_GHCR_TOKEN` | present | legacy / not consumed by active stage workflow |
| `STAGE_POSTGRES_PASSWORD` | present | legacy / not consumed directly by active stage workflow |
| `STAGE_SERVICES_SECRET_KEY` | present | legacy / not consumed directly by active stage workflow |

## Runtime Secret-Bearing Keys Inside Env Overlays

The deploy workflows do not pass every secret as a separate GitHub secret.
Instead, most runtime-sensitive keys are expected inside `STAGE_ENV_FILE`, `PROD_ENV_FILE`, and optionally `SHARED_ENV_FILE`.

This means:

- GitHub may show only a few top-level secret names
- but the actual runtime credential surface is much larger
- most business/integration credentials live inside the env overlay payloads

## Functional Priority

Not every key from local `.env` should be copied to stage or production.

There are three practical classes:

- Core runtime required:
  - missing or wrong values can break login, API, DB access, media, imports, password reset, or cross-service calls
- Feature/integration required:
  - needed only when that integration or marketplace flow is used
- Local-only or operator-only:
  - should not be mirrored blindly into stage/prod because they are dev-specific, build-only, or unrelated to runtime app behavior

For a stable environment, copy all keys from the first two classes into `SHARED_ENV_FILE`, `STAGE_ENV_FILE`, or `PROD_ENV_FILE` as appropriate, but do not dump the entire local `.env` into production unchanged.

### Stage runtime secret-bearing groups

Defined by `infra/deploy/stage/env.stage.sanitized.template` and validated before deploy.

- Postgres:
  - `STAGE_POSTGRES_PASSWORD`
- FTP media:
  - `BACKEND_UPLOAD_FTP_HOST`
  - `BACKEND_UPLOAD_FTP_USER`
  - `BACKEND_UPLOAD_FTP_PASS`
- SMTP:
  - `STAGE_SMTP_HOST`
  - `STAGE_SMTP_USERNAME`
  - `STAGE_SMTP_PASSWORD`
- Django/services:
  - `SERVICES_SECRET_KEY`
  - `STAGE_ORCHESTRATOR_SERVICE_AUTH_TOKEN`
- JV source databases:
  - `JV_SOURCE_DB_*`
  - `JV_SOURCE_JV_DE_DB_*`
  - `JV_SOURCE_JV_AT_DB_*`
  - `JV_SOURCE_JV_CH_DB_*`
  - `JV_SOURCE_JV_CO_UK_DB_*`
- Afterbuy:
  - `AFTERBUY_JV_LOGIN`
  - `AFTERBUY_JV_PASS`
  - `AFTERBUY_XL_LOGIN`
  - `AFTERBUY_XL_PASS`
  - `AFTERBUY_CH_LOGIN`
  - `AFTERBUY_CH_PASS`
- Optional observability/integration:
  - `BACKEND_STAGE_SENTRY_DSN`
  - `SERVICES_STAGE_SENTRY_DSN`
  - `ORCHESTRATOR_STAGE_SENTRY_DSN`
  - `OPENAI_API_KEY`
- Feature-specific integrations:
  - `HOOD_LOGIN`
  - `HOOD_PASSWORD`
  - `HOOD_FTP_HOST`
  - `HOOD_FTP_USER`
  - `HOOD_FTP_PASSWORD`
  - `HOOD_FTP_PUBLIC_BASE_URL`

### Stage runtime full key map

These are the actual stage runtime keys defined by `infra/deploy/stage/env.stage.sanitized.template`.

#### Stage image and release keys

- `BACKEND_IMAGE`
- `BACKEND_STAGE_TAG`
- `FRONTEND_IMAGE`
- `FRONTEND_STAGE_TAG`
- `GATEWAY_IMAGE`
- `GATEWAY_STAGE_TAG`
- `MOBILE_IMAGE`
- `MOBILE_STAGE_TAG`
- `SERVICES_IMAGE`
- `SERVICES_STAGE_TAG`
- `ORCHESTRATOR_IMAGE`
- `ORCHESTRATOR_STAGE_TAG`

#### Stage public routing keys

- `STAGE_DOMAIN`
- `STAGE_GATEWAY_PORT`
- `STAGE_PUBLIC_API_BASE_URL`
- `STAGE_PUBLIC_SERVICES_API_BASE_URL`
- `STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL`

#### Stage database keys

- `STAGE_POSTGRES_DB`
- `STAGE_POSTGRES_USER`
- `STAGE_POSTGRES_PASSWORD`

#### Stage backend upload and media keys

- `BACKEND_STAGE_SENTRY_DSN`
- `BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE`
- `BACKEND_UPLOAD_STORAGE_BACKEND`
- `BACKEND_UPLOAD_FTP_HOST`
- `BACKEND_UPLOAD_FTP_USER`
- `BACKEND_UPLOAD_FTP_PASS`
- `BACKEND_UPLOAD_FTP_PORT`
- `BACKEND_STAGE_UPLOAD_FTP_ROOT_DIR`
- `BACKEND_STAGE_UPLOAD_FTP_STORAGE_ROOT_DIR`
- `BACKEND_STAGE_UPLOAD_FTP_AVATAR_DIR`
- `BACKEND_STAGE_UPLOAD_FTP_IMAGE_DIR`
- `BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL`

#### Stage per-site FTP keys

- `FTP_DE_HOST`
- `FTP_DE_USER`
- `FTP_DE_PASS`
- `FTP_DE_PORT`
- `FTP_DE_URL`
- `FTP_DE_DOMIN`
- `FTP_AT_HOST`
- `FTP_AT_USER`
- `FTP_AT_PASS`
- `FTP_AT_PORT`
- `FTP_AT_URL`
- `FTP_AT_DOMIN`
- `FTP_CH_HOST`
- `FTP_CH_USER`
- `FTP_CH_PASS`
- `FTP_CH_PORT`
- `FTP_CH_URL`
- `FTP_CH_DOMIN`
- `FTP_CO_UK_HOST`
- `FTP_CO_UK_USER`
- `FTP_CO_UK_PASS`
- `FTP_CO_UK_PORT`
- `FTP_CO_UK_URL`
- `FTP_CO_UK_DOMIN`

The following additional per-site XL upload keys may live in `STAGE_ENV_FILE` or `SHARED_ENV_FILE` and now reach the `services` container through compose `env_file`:

- `<XL_SITE_KEY>_FTP_HOST`
- `<XL_SITE_KEY>_FTP_USER`
- `<XL_SITE_KEY>_FTP_PASSWORD`

Examples:

- `XLMOEBEL_DE_FTP_HOST`
- `XLMOEBEL_DE_FTP_USER`
- `XLMOEBEL_DE_FTP_PASSWORD`
- `XLFURNITURE_CO_UK_FTP_HOST`
- `XLFURNITURE_CO_UK_FTP_USER`
- `XLFURNITURE_CO_UK_FTP_PASSWORD`

#### Stage OpenAI keys

- `OPENAI_API_KEY`
- `OPENAI_TRANSLATION_MODEL`
- `OPENAI_TRANSLATION_CONNECT_TIMEOUT_SEC`
- `OPENAI_TRANSLATION_READ_TIMEOUT_SEC`

#### Stage feature-specific integration keys

These are not part of the minimal compose `environment:` block, but now reach containers through the approved runtime `.env` overlay via compose `env_file`.

- Hood:
  - `HOOD_LOGIN`
  - `HOOD_PASSWORD`
  - `HOOD_API_BASE_URL`
  - `HOOD_API_PATCH_ENDPOINT`
  - `HOOD_API_CONNECT_TIMEOUT`
  - `HOOD_API_READ_TIMEOUT`
  - `HOOD_FTP_HOST`
  - `HOOD_FTP_PORT`
  - `HOOD_FTP_USER`
  - `HOOD_FTP_PASSWORD`
  - `HOOD_FTP_BASE_DIR`
  - `HOOD_FTP_PUBLIC_BASE_URL`
  - `HOOD_FTP_USE_TLS`
  - `HOOD_FTP_PASSIVE`
  - `HOOD_FTP_CONNECT_TIMEOUT`
  - `HOOD_VALIDATE_UPLOADED_IMAGE_URLS`
- XL source DB families:
  - `XL_SOURCE_<SITE_KEY>_DB_HOST`
  - `XL_SOURCE_<SITE_KEY>_DB_USER`
  - `XL_SOURCE_<SITE_KEY>_DB_PASSWORD`
  - `XL_SOURCE_<SITE_KEY>_DB_NAME`
  - `XL_SOURCE_<SITE_KEY>_DB_PORT`
  - `XL_SOURCE_<SITE_KEY>_DB_PREFIX`
- XL per-site FTP families:
  - `<XL_SITE_KEY>_FTP_HOST`
  - `<XL_SITE_KEY>_FTP_USER`
  - `<XL_SITE_KEY>_FTP_PASSWORD`
  - `<XL_SITE_KEY>_FTP_PUBLIC_BASE_URL`
  - `<XL_SITE_KEY>_FTP_ROOT_DIR`
  - `<XL_SITE_KEY>_FTP_USE_TLS`
  - `<XL_SITE_KEY>_FTP_PASSIVE`
  - `<XL_SITE_KEY>_FTP_CONNECT_TIMEOUT`

#### Stage SMTP and password reset keys

- `STAGE_SMTP_HOST`
- `STAGE_SMTP_PORT`
- `STAGE_SMTP_USERNAME`
- `STAGE_SMTP_PASSWORD`
- `STAGE_SMTP_FROM`
- `STAGE_SMTP_INSECURE`
- `STAGE_PASSWORD_RESET_CODE_TTL_MINUTES`
- `STAGE_PASSWORD_RESET_LOG_CODES`

#### Stage mobile metadata keys

- `MOBILE_STAGE_APP_VERSION`
- `MOBILE_STAGE_APK_URL`

#### Stage frontend and Sentry keys

- `NEXT_PUBLIC_SENTRY_DSN`
- `FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE`
- `FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`
- `FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`

#### Stage services keys

- `SERVICES_SECRET_KEY`
- `SERVICES_SERVICE_NAME`
- `SERVICES_LOG_LEVEL`
- `SERVICES_STAGE_SENTRY_DSN`
- `SERVICES_STAGE_SENTRY_TRACES_SAMPLE_RATE`
- `STAGE_RUN_MIGRATIONS_ON_STARTUP`
- `STAGE_SERVICES_ALLOWED_HOSTS`
- `STAGE_BACKEND_AUTH_BASE_URL`
- `STAGE_BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS`
- `STAGE_ORCHESTRATOR_SERVICE_AUTH_TOKEN`
- `STAGE_ORCHESTRATOR_SERVICE_ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`

#### Stage JV source DB keys

- `JV_SOURCE_DB_HOST`
- `JV_SOURCE_DB_USER`
- `JV_SOURCE_DB_PASSWORD`
- `JV_SOURCE_DB_NAME`
- `JV_SOURCE_DB_PORT`
- `JV_SOURCE_DB_CONNECT_RETRIES`
- `JV_SOURCE_DB_PUSH_RETRIES`
- `JV_SOURCE_DB_CONNECT_TIMEOUT_SEC`
- `JV_SOURCE_DB_READ_TIMEOUT_SEC`
- `JV_SOURCE_DB_WRITE_TIMEOUT_SEC`
- `JV_SOURCE_DB_CONNECT_RETRY_SLEEP_SEC`
- `JV_SOURCE_DB_PUSH_RETRY_SLEEP_SEC`
- `JV_SOURCE_JV_DE_DB_HOST`
- `JV_SOURCE_JV_DE_DB_USER`
- `JV_SOURCE_JV_DE_DB_PASSWORD`
- `JV_SOURCE_JV_DE_DB_NAME`
- `JV_SOURCE_JV_DE_DB_PORT`
- `JV_SOURCE_JV_DE_DB_PREFIX`
- `JV_SOURCE_JV_AT_DB_HOST`
- `JV_SOURCE_JV_AT_DB_USER`
- `JV_SOURCE_JV_AT_DB_PASSWORD`
- `JV_SOURCE_JV_AT_DB_NAME`
- `JV_SOURCE_JV_AT_DB_PORT`
- `JV_SOURCE_JV_AT_DB_PREFIX`
- `JV_SOURCE_JV_CH_DB_HOST`
- `JV_SOURCE_JV_CH_DB_USER`
- `JV_SOURCE_JV_CH_DB_PASSWORD`
- `JV_SOURCE_JV_CH_DB_NAME`
- `JV_SOURCE_JV_CH_DB_PORT`
- `JV_SOURCE_JV_CH_DB_PREFIX`
- `JV_SOURCE_JV_CO_UK_DB_HOST`
- `JV_SOURCE_JV_CO_UK_DB_USER`
- `JV_SOURCE_JV_CO_UK_DB_PASSWORD`
- `JV_SOURCE_JV_CO_UK_DB_NAME`
- `JV_SOURCE_JV_CO_UK_DB_PORT`
- `JV_SOURCE_JV_CO_UK_DB_PREFIX`

#### Stage XL source keys

- `XL_SOURCE_DB_CONNECT_TIMEOUT`
- `XL_XL_SITE_KEYS`
- `XL_SOURCE_<SITE_KEY>_DB_HOST`
- `XL_SOURCE_<SITE_KEY>_DB_USER`
- `XL_SOURCE_<SITE_KEY>_DB_PASSWORD`
- `XL_SOURCE_<SITE_KEY>_DB_NAME`
- `XL_SOURCE_<SITE_KEY>_DB_PORT`
- `XL_SOURCE_<SITE_KEY>_DB_PREFIX`

#### Stage orchestrator keys

- `STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL`
- `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS`
- `ORCHESTRATOR_HTTP_RETRIES`
- `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS`
- `ORCHESTRATOR_MARKETPLACE_TOGGLE_TIMEOUT_SECONDS`
- `ORCHESTRATOR_ENABLE_JOB_WORKER`
- `ORCHESTRATOR_ENABLE_RECONCILIATION_SCHEDULER`
- `ORCHESTRATOR_RECONCILIATION_SCHEDULER_POLL_INTERVAL_SECONDS`
- `ORCHESTRATOR_RECONCILIATION_REPORTS_TTL_SECONDS`
- `ORCHESTRATOR_RECONCILIATION_REPORTS_MAX_PER_EAN`
- `ORCHESTRATOR_JOBS_BATCH_MAX_ITEMS`
- `ORCHESTRATOR_JOBS_STATUS_BATCH_MAX_ITEMS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_WINDOW_SECONDS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_JOBS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_URGENT_JOBS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_NORMAL_JOBS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_BACKGROUND_JOBS`
- `ORCHESTRATOR_JOB_WORKER_POLL_INTERVAL_SECONDS`
- `ORCHESTRATOR_ENABLE_CIRCUIT_BREAKER`
- `ORCHESTRATOR_CIRCUIT_BREAKER_FAILURE_THRESHOLD`
- `ORCHESTRATOR_CIRCUIT_BREAKER_OPEN_SECONDS`
- `ORCHESTRATOR_ENABLE_CHANNEL_LIMITER`
- `ORCHESTRATOR_CHANNEL_LIMITER_MAX_INFLIGHT_PER_KEY`
- `ORCHESTRATOR_SERVICE_NAME`
- `ORCHESTRATOR_LOG_LEVEL`
- `ORCHESTRATOR_STAGE_SENTRY_DSN`
- `ORCHESTRATOR_STAGE_SENTRY_TRACES_SAMPLE_RATE`

#### Stage Afterbuy keys

- `AFTERBUY_JV_LOGIN`
- `AFTERBUY_JV_PASS`
- `AFTERBUY_XL_LOGIN`
- `AFTERBUY_XL_PASS`
- `AFTERBUY_CH_LOGIN`
- `AFTERBUY_CH_PASS`
- `AFTERBUY_JV_LOGIN_URL`
- `AFTERBUY_XL_LOGIN_URL`
- `AFTERBUY_CH_LOGIN_URL`
- `AFTERBUY_JV_COOKIE_CACHE_FILE`
- `AFTERBUY_XL_COOKIE_CACHE_FILE`
- `AFTERBUY_CH_COOKIE_CACHE_FILE`

### Production runtime secret-bearing groups

Defined by `infra/deploy/prod/env.prod.sanitized.template` and validated before deploy.

- Postgres:
  - `PROD_POSTGRES_PASSWORD`
- FTP media:
  - `BACKEND_UPLOAD_FTP_HOST`
  - `BACKEND_UPLOAD_FTP_USER`
  - `BACKEND_UPLOAD_FTP_PASS`
- SMTP:
  - `PROD_SMTP_HOST`
  - `PROD_SMTP_USERNAME`
  - `PROD_SMTP_PASSWORD`
- Django/services:
  - `SERVICES_SECRET_KEY`
- Afterbuy:
  - `AFTERBUY_JV_PASS`
  - `AFTERBUY_XL_PASS`
  - `AFTERBUY_CH_PASS`
- Optional observability/integration:
  - `BACKEND_PROD_SENTRY_DSN`
  - `SERVICES_PROD_SENTRY_DSN`
  - `ORCHESTRATOR_PROD_SENTRY_DSN`
  - `OPENAI_API_KEY`
- Feature-specific integrations:
  - `HOOD_LOGIN`
  - `HOOD_PASSWORD`
  - `HOOD_FTP_HOST`
  - `HOOD_FTP_USER`
  - `HOOD_FTP_PASSWORD`
  - `HOOD_FTP_PUBLIC_BASE_URL`

### Production runtime full key map

These are the actual production runtime keys defined by `infra/deploy/prod/env.prod.sanitized.template`.

#### Production image and release keys

- `BACKEND_IMAGE`
- `BACKEND_APP_VERSION`
- `FRONTEND_IMAGE`
- `FRONTEND_APP_VERSION`
- `GATEWAY_IMAGE`
- `GATEWAY_PROD_TAG`
- `MOBILE_IMAGE`
- `MOBILE_APP_VERSION`
- `SERVICES_IMAGE`
- `SERVICES_APP_VERSION`
- `ORCHESTRATOR_IMAGE`
- `ORCHESTRATOR_APP_VERSION`

#### Production public routing keys

- `PROD_DOMAIN`
- `PROD_GATEWAY_PORT`
- `PROD_PUBLIC_API_BASE_URL`
- `PROD_PUBLIC_SERVICES_API_BASE_URL`
- `PROD_PUBLIC_ORCHESTRATOR_API_BASE_URL`

#### Production database keys

- `PROD_POSTGRES_DB`
- `PROD_POSTGRES_USER`
- `PROD_POSTGRES_PASSWORD`

#### Production backend upload and media keys

- `BACKEND_PROD_SENTRY_DSN`
- `BACKEND_PROD_SENTRY_TRACES_SAMPLE_RATE`
- `BACKEND_UPLOAD_STORAGE_BACKEND`
- `BACKEND_UPLOAD_FTP_HOST`
- `BACKEND_UPLOAD_FTP_USER`
- `BACKEND_UPLOAD_FTP_PASS`
- `BACKEND_UPLOAD_FTP_PORT`
- `BACKEND_PROD_UPLOAD_FTP_ROOT_DIR`
- `BACKEND_PROD_UPLOAD_FTP_STORAGE_ROOT_DIR`
- `BACKEND_PROD_UPLOAD_FTP_AVATAR_DIR`
- `BACKEND_PROD_UPLOAD_FTP_IMAGE_DIR`
- `BACKEND_PROD_UPLOAD_FTP_PUBLIC_BASE_URL`

#### Production per-site FTP keys

- `FTP_DE_HOST`
- `FTP_DE_USER`
- `FTP_DE_PASS`
- `FTP_DE_PORT`
- `FTP_DE_URL`
- `FTP_DE_DOMIN`
- `FTP_AT_HOST`
- `FTP_AT_USER`
- `FTP_AT_PASS`
- `FTP_AT_PORT`
- `FTP_AT_URL`
- `FTP_AT_DOMIN`
- `FTP_CH_HOST`
- `FTP_CH_USER`
- `FTP_CH_PASS`
- `FTP_CH_PORT`
- `FTP_CH_URL`
- `FTP_CH_DOMIN`
- `FTP_CO_UK_HOST`
- `FTP_CO_UK_USER`
- `FTP_CO_UK_PASS`
- `FTP_CO_UK_PORT`
- `FTP_CO_UK_URL`
- `FTP_CO_UK_DOMIN`

The following additional per-site XL upload keys may live in `PROD_ENV_FILE` or `SHARED_ENV_FILE` and now reach the `services` container through compose `env_file`:

- `<XL_SITE_KEY>_FTP_HOST`
- `<XL_SITE_KEY>_FTP_USER`
- `<XL_SITE_KEY>_FTP_PASSWORD`

#### Production OpenAI keys

- `OPENAI_API_KEY`
- `OPENAI_TRANSLATION_MODEL`
- `OPENAI_TRANSLATION_CONNECT_TIMEOUT_SEC`
- `OPENAI_TRANSLATION_READ_TIMEOUT_SEC`

#### Production feature-specific integration keys

These are not part of the minimal compose `environment:` block, but now reach containers through the approved runtime `.env` overlay via compose `env_file`.

- Hood:
  - `HOOD_LOGIN`
  - `HOOD_PASSWORD`
  - `HOOD_API_BASE_URL`
  - `HOOD_API_PATCH_ENDPOINT`
  - `HOOD_API_CONNECT_TIMEOUT`
  - `HOOD_API_READ_TIMEOUT`
  - `HOOD_FTP_HOST`
  - `HOOD_FTP_PORT`
  - `HOOD_FTP_USER`
  - `HOOD_FTP_PASSWORD`
  - `HOOD_FTP_BASE_DIR`
  - `HOOD_FTP_PUBLIC_BASE_URL`
  - `HOOD_FTP_USE_TLS`
  - `HOOD_FTP_PASSIVE`
  - `HOOD_FTP_CONNECT_TIMEOUT`
  - `HOOD_VALIDATE_UPLOADED_IMAGE_URLS`
- XL source DB families:
  - `XL_SOURCE_<SITE_KEY>_DB_HOST`
  - `XL_SOURCE_<SITE_KEY>_DB_USER`
  - `XL_SOURCE_<SITE_KEY>_DB_PASSWORD`
  - `XL_SOURCE_<SITE_KEY>_DB_NAME`
  - `XL_SOURCE_<SITE_KEY>_DB_PORT`
  - `XL_SOURCE_<SITE_KEY>_DB_PREFIX`
- XL per-site FTP families:
  - `<XL_SITE_KEY>_FTP_HOST`
  - `<XL_SITE_KEY>_FTP_USER`
  - `<XL_SITE_KEY>_FTP_PASSWORD`
  - `<XL_SITE_KEY>_FTP_PUBLIC_BASE_URL`
  - `<XL_SITE_KEY>_FTP_ROOT_DIR`
  - `<XL_SITE_KEY>_FTP_USE_TLS`
  - `<XL_SITE_KEY>_FTP_PASSIVE`
  - `<XL_SITE_KEY>_FTP_CONNECT_TIMEOUT`

#### Production SMTP and password reset keys

- `PROD_SMTP_HOST`
- `PROD_SMTP_PORT`
- `PROD_SMTP_USERNAME`
- `PROD_SMTP_PASSWORD`
- `PROD_SMTP_FROM`
- `PROD_SMTP_INSECURE`
- `PROD_PASSWORD_RESET_CODE_TTL_MINUTES`
- `PROD_PASSWORD_RESET_LOG_CODES`

#### Production mobile metadata keys

- `MOBILE_STAGE_APP_VERSION`
- `MOBILE_STAGE_APK_URL`
- `MOBILE_PROD_APP_VERSION`
- `MOBILE_PROD_APK_URL`

#### Production frontend and Sentry keys

- `NEXT_PUBLIC_SENTRY_DSN`
- `FRONTEND_PROD_SENTRY_TRACES_SAMPLE_RATE`
- `FRONTEND_PROD_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`
- `FRONTEND_PROD_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`

#### Production services keys

- `SERVICES_SECRET_KEY`
- `SERVICES_SERVICE_NAME`
- `SERVICES_LOG_LEVEL`
- `SERVICES_PROD_SENTRY_DSN`
- `SERVICES_PROD_SENTRY_TRACES_SAMPLE_RATE`
- `PROD_RUN_MIGRATIONS_ON_STARTUP`
- `PROD_SERVICES_ALLOWED_HOSTS`
- `PROD_BACKEND_AUTH_BASE_URL`
- `PROD_BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS`
- `PROD_ORCHESTRATOR_SERVICE_AUTH_TOKEN`
- `PROD_ORCHESTRATOR_SERVICE_ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`

#### Production orchestrator keys

- `PROD_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL`
- `ORCHESTRATOR_HTTP_TIMEOUT_SECONDS`
- `ORCHESTRATOR_HTTP_RETRIES`
- `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS`
- `ORCHESTRATOR_MARKETPLACE_TOGGLE_TIMEOUT_SECONDS`
- `ORCHESTRATOR_ENABLE_JOB_WORKER`
- `ORCHESTRATOR_ENABLE_RECONCILIATION_SCHEDULER`
- `ORCHESTRATOR_RECONCILIATION_SCHEDULER_POLL_INTERVAL_SECONDS`
- `ORCHESTRATOR_RECONCILIATION_REPORTS_TTL_SECONDS`
- `ORCHESTRATOR_RECONCILIATION_REPORTS_MAX_PER_EAN`
- `ORCHESTRATOR_JOBS_BATCH_MAX_ITEMS`
- `ORCHESTRATOR_JOBS_STATUS_BATCH_MAX_ITEMS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_WINDOW_SECONDS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_JOBS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_URGENT_JOBS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_NORMAL_JOBS`
- `ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_BACKGROUND_JOBS`
- `ORCHESTRATOR_JOB_WORKER_POLL_INTERVAL_SECONDS`
- `ORCHESTRATOR_ENABLE_CIRCUIT_BREAKER`
- `ORCHESTRATOR_CIRCUIT_BREAKER_FAILURE_THRESHOLD`
- `ORCHESTRATOR_CIRCUIT_BREAKER_OPEN_SECONDS`
- `ORCHESTRATOR_ENABLE_CHANNEL_LIMITER`
- `ORCHESTRATOR_CHANNEL_LIMITER_MAX_INFLIGHT_PER_KEY`
- `ORCHESTRATOR_SERVICE_NAME`
- `ORCHESTRATOR_LOG_LEVEL`
- `ORCHESTRATOR_PROD_SENTRY_DSN`
- `ORCHESTRATOR_PROD_SENTRY_TRACES_SAMPLE_RATE`

#### Production XL source keys

- `XL_SOURCE_DB_CONNECT_TIMEOUT`
- `XL_XL_SITE_KEYS`
- `XL_SOURCE_<SITE_KEY>_DB_HOST`
- `XL_SOURCE_<SITE_KEY>_DB_USER`
- `XL_SOURCE_<SITE_KEY>_DB_PASSWORD`
- `XL_SOURCE_<SITE_KEY>_DB_NAME`
- `XL_SOURCE_<SITE_KEY>_DB_PORT`
- `XL_SOURCE_<SITE_KEY>_DB_PREFIX`

#### Production Afterbuy keys

- `AFTERBUY_JV_LOGIN`
- `AFTERBUY_JV_PASS`
- `AFTERBUY_XL_LOGIN`
- `AFTERBUY_XL_PASS`
- `AFTERBUY_CH_LOGIN`
- `AFTERBUY_CH_PASS`
- `AFTERBUY_JV_LOGIN_URL`
- `AFTERBUY_XL_LOGIN_URL`
- `AFTERBUY_CH_LOGIN_URL`
- `AFTERBUY_JV_COOKIE_CACHE_FILE`
- `AFTERBUY_XL_COOKIE_CACHE_FILE`
- `AFTERBUY_CH_COOKIE_CACHE_FILE`

## Operational Notes

- Current active deploy contract is bundle-based, not many-small-secrets based.
- For `stage`, the authoritative runtime overlay is `STAGE_ENV_FILE`.
- For `production`, the authoritative runtime overlay is `PROD_ENV_FILE`.
- `SHARED_ENV_FILE` is available for cross-environment shared values, but production is currently configured so the effective live values are already contained in `PROD_ENV_FILE`.
- If you want stricter auditability later, the next improvement is to split large env overlay files into smaller named secrets by domain:
  - SMTP
  - FTP/media
  - Afterbuy
  - JV source DB
  - observability

## Summary

- `stage`: active deploy inputs complete
- `production`: active deploy inputs complete
- `SHARED_ENV_FILE`: present at repo level
- `stage` still contains 3 legacy secrets not used directly by the current workflow
- runtime secret values remain hidden and were not printed into this file
