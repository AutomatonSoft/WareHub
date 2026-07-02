# Sentry Setup

## Purpose

This runbook defines the recommended Sentry project layout, environment naming, env keys, rollout order, and verification flow for WareHub.

- Do not paste real DSNs or auth tokens into git-tracked files.
- Store real values only in ignored local env files, deployment runtime env files, or secret stores.
- Use one Sentry project per application/service and separate environments inside each project.

## Recommended Sentry Project Layout

Create these projects inside one Sentry organization and one WareHub team:

1. `warehub-frontend`
2. `warehub-backend`
3. `warehub-services`
4. `warehub-orchestrator`

Recommended platform when creating the project:

- `warehub-frontend`: Next.js
- `warehub-backend`: Rust
- `warehub-services`: Django
- `warehub-orchestrator`: FastAPI

This repository already contains the runtime wiring for those four applications.

## Environment Naming Policy

Use the same environment names across every runtime:

- `dev`
- `stage`
- `prod`

Do not mix `prod` and `production` for different services. Sentry treats them as different environments.

## Sentry Keys To Prepare

### Local Dev

Use local `.env` at repo root for development. Recommended keys:

```env
# frontend project
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1.0
NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1.0
NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0.0

# frontend server-side local runtime
FRONTEND_SENTRY_DSN=
FRONTEND_SENTRY_TRACES_SAMPLE_RATE=1.0

# backend local runtime
BACKEND_SENTRY_DSN=
BACKEND_SENTRY_TRACES_SAMPLE_RATE=1.0

# database-service local runtime
SERVICES_SENTRY_DSN=
SERVICES_SENTRY_TRACES_SAMPLE_RATE=1.0

# orchestrator local runtime
ORCHESTRATOR_SENTRY_DSN=
ORCHESTRATOR_SENTRY_TRACES_SAMPLE_RATE=1.0

# generic fallback
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=1.0

# source maps for frontend builds
SENTRY_ORG=
SENTRY_PROJECT=warehub-frontend
SENTRY_AUTH_TOKEN=
```

Notes:

- `NEXT_PUBLIC_SENTRY_DSN` should point to the `warehub-frontend` project.
- `FRONTEND_SENTRY_DSN` should point to the `warehub-frontend` project.
- `BACKEND_SENTRY_DSN` should point to the `warehub-backend` project.
- `SERVICES_SENTRY_DSN` should point to the `warehub-services` project.
- `ORCHESTRATOR_SENTRY_DSN` should point to the `warehub-orchestrator` project.
- `SENTRY_DSN` remains only a generic fallback and should not be the main local routing mechanism.

### Stage Runtime

Fill these in the stage runtime env:

```env
BACKEND_STAGE_SENTRY_DSN=
BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1

SERVICES_STAGE_SENTRY_DSN=
SERVICES_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1

ORCHESTRATOR_STAGE_SENTRY_DSN=
ORCHESTRATOR_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1

NEXT_PUBLIC_SENTRY_DSN=
FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1
FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1.0
FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0.0

SERVICES_LOG_LEVEL=INFO
SERVICES_SERVICE_NAME=warehub-database-service

SENTRY_ORG=
SENTRY_PROJECT=warehub-frontend
SENTRY_AUTH_TOKEN=
```

Mapping:

- `BACKEND_STAGE_SENTRY_DSN` -> `warehub-backend`
- `SERVICES_STAGE_SENTRY_DSN` -> `warehub-services`
- `ORCHESTRATOR_STAGE_SENTRY_DSN` -> `warehub-orchestrator`
- `NEXT_PUBLIC_SENTRY_DSN` -> `warehub-frontend`

### Production Runtime

Fill these in the production runtime env:

```env
BACKEND_PROD_SENTRY_DSN=
BACKEND_PROD_SENTRY_TRACES_SAMPLE_RATE=0.1

SERVICES_PROD_SENTRY_DSN=
SERVICES_PROD_SENTRY_TRACES_SAMPLE_RATE=0.1

ORCHESTRATOR_PROD_SENTRY_DSN=
ORCHESTRATOR_PROD_SENTRY_TRACES_SAMPLE_RATE=0.1

NEXT_PUBLIC_SENTRY_DSN=
FRONTEND_PROD_SENTRY_TRACES_SAMPLE_RATE=0.1
FRONTEND_PROD_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1.0
FRONTEND_PROD_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0.0

SERVICES_LOG_LEVEL=INFO
SERVICES_SERVICE_NAME=warehub-database-service

SENTRY_ORG=
SENTRY_PROJECT=warehub-frontend
SENTRY_AUTH_TOKEN=
```

Mapping:

- `BACKEND_PROD_SENTRY_DSN` -> `warehub-backend`
- `SERVICES_PROD_SENTRY_DSN` -> `warehub-services`
- `ORCHESTRATOR_PROD_SENTRY_DSN` -> `warehub-orchestrator`
- `NEXT_PUBLIC_SENTRY_DSN` -> `warehub-frontend`

## Where The Repository Reads These Keys

- frontend browser: `apps/frontend/instrumentation-client.ts`
- frontend server/edge: `apps/frontend/sentry.server.config.ts`, `apps/frontend/sentry.edge.config.ts`
- frontend build/source maps: `apps/frontend/next.config.mjs`
- backend: `apps/backend/src/sentry_support.rs`
- database-service: `services/database-service/database_service/observability.py`
- orchestrator: `services/orchestrator/src/sofort_orchestrator/observability.py`
- stage compose wiring: `infra/deploy/stage/docker-compose.yml`
- prod compose wiring: `infra/deploy/prod/docker-compose.yml`

## Source Maps

Frontend source maps require:

- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

Recommended value:

- `SENTRY_PROJECT=warehub-frontend`

If you later split frontend source-map uploads by environment, add separate build-time project keys explicitly. Until then, keep one frontend Sentry project and separate by `environment`.

## Rollout Order

1. Create the four Sentry projects.
2. Copy each DSN into the correct runtime secret key.
3. Create `SENTRY_AUTH_TOKEN` for frontend source map upload.
4. Set `SENTRY_ORG` and `SENTRY_PROJECT=warehub-frontend`.
5. Redeploy stage.
6. Trigger test errors in stage and verify they appear under environment `stage`.
7. Redeploy production only after approval.
8. Trigger a safe production verification event and verify it appears under environment `prod`.

## Verification Checklist

### Frontend

Verify in `warehub-frontend`:

- browser exception appears in Issues
- stage event is tagged with environment `stage`
- prod event is tagged with environment `prod`
- traces appear in Traces
- replay appears when an error happens

### Backend

Verify in `warehub-backend`:

- API exception appears in Issues
- request is tagged with the expected environment

### Database-Service

Verify in `warehub-services`:

- API exception appears in Issues
- request logs include `request_id`
- worker exceptions appear as Sentry issues

### Orchestrator

Verify in `warehub-orchestrator`:

- API exception appears in Issues
- background worker crash appears in Issues
- request logs include `request_id`

## Troubleshooting

### Events are missing from one service

- confirm that the correct DSN is set for that service
- confirm the service was restarted after env update
- confirm the event is being emitted in the expected code path
- confirm the runtime environment tag is `dev`, `stage`, or `prod`

### Frontend stack traces are unreadable

- confirm `SENTRY_AUTH_TOKEN` is present in the build environment
- confirm `SENTRY_ORG` is correct
- confirm `SENTRY_PROJECT=warehub-frontend`
- confirm the frontend image was rebuilt after the token was added

### Stage and prod appear under different names

- confirm no runtime still uses `production`
- standardize every runtime on `prod`

## Validation

Before deploy, validate the env contract from repo root:

```powershell
./infra/scripts/verify-required-env.ps1 -EnvFile .env.example -Environment stage -InputKind Template
./infra/scripts/verify-required-env.ps1 -EnvFile .env.example -Environment prod -InputKind Template
```

Note:

- the current repository template still has unrelated historical missing keys outside the Sentry scope
- those template gaps should be fixed separately if you want the template validator to pass cleanly end-to-end
