# OPS_HEALTH_VERIFICATION

Local verification checklist for infra/ops health wiring.

Scope:
- No deploy actions.
- Validate current compose/env wiring and health endpoints contract.
- Capture reproducible checks for stage/prod operators.

## 1. Preconditions

1. Use `sofortbot-infra/.env` as runtime source.
2. Validate required env keys before compose checks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-required-env.ps1
```

3. Ensure compose files are syntactically valid:

```bash
docker compose -f deploy/stage/docker-compose.yml --env-file .env config
docker compose -f deploy/prod/docker-compose.yml --env-file .env config
```

## 2. Service-level health contract

Expected endpoints:

- Rust backend:
  - `GET /api/v1/healthz`
  - `GET /api/v1/readyz`
- Django services (`database_service`):
  - `GET /api/v1/healthz`
  - `GET /api/v1/readyz`
  - API probe through known read endpoint (`/api/v1/openapi.json` or `/api/v1/inventory/rows/` with auth where required)
- Orchestrator:
  - `GET /api/v1/healthz`
  - `GET /api/v1/readyz`
  - `GET /api/v1/metrics`

## 3. Stage checks

First run migration-plan dry verification (no apply):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-all-migration-plans.ps1
```

Behavior:
- runs both stage and prod dry migration verification helpers;
- validates compose config for each environment;
- if `services` container is running for an environment, executes `showmigrations`, `migrate --plan`, `makemigrations --check --dry-run --noinput` inside container and stores reports;
- if container is not running, exits that environment with `SKIP` and does not fail the overall local flow.
- writes combined summary into `docs/migration-verification/`.

```bash
docker compose -f deploy/stage/docker-compose.yml --env-file .env ps
curl -fsS "http://127.0.0.1:${STAGE_GATEWAY_PORT:-8940}/api/v1/backend/healthz"
curl -fsS "http://127.0.0.1:${STAGE_GATEWAY_PORT:-8940}/api/v1/backend/readyz"
curl -fsS "http://127.0.0.1:${STAGE_GATEWAY_PORT:-8940}/api/v1/services/healthz"
curl -fsS "http://127.0.0.1:${STAGE_GATEWAY_PORT:-8940}/api/v1/services/readyz"
curl -fsS "http://127.0.0.1:${STAGE_GATEWAY_PORT:-8940}/api/v1/orchestrator/healthz"
curl -fsS "http://127.0.0.1:${STAGE_GATEWAY_PORT:-8940}/api/v1/orchestrator/readyz"
curl -fsS "http://127.0.0.1:${STAGE_GATEWAY_PORT:-8940}/api/v1/orchestrator/metrics" | head
```

## 4. Prod checks

```bash
docker compose -f deploy/prod/docker-compose.yml --env-file .env ps
curl -fsS "http://127.0.0.1:${PROD_GATEWAY_PORT:-8950}/api/v1/backend/healthz"
curl -fsS "http://127.0.0.1:${PROD_GATEWAY_PORT:-8950}/api/v1/backend/readyz"
curl -fsS "http://127.0.0.1:${PROD_GATEWAY_PORT:-8950}/api/v1/services/healthz"
curl -fsS "http://127.0.0.1:${PROD_GATEWAY_PORT:-8950}/api/v1/services/readyz"
curl -fsS "http://127.0.0.1:${PROD_GATEWAY_PORT:-8950}/api/v1/orchestrator/healthz"
curl -fsS "http://127.0.0.1:${PROD_GATEWAY_PORT:-8950}/api/v1/orchestrator/readyz"
curl -fsS "http://127.0.0.1:${PROD_GATEWAY_PORT:-8950}/api/v1/orchestrator/metrics" | head
```

## 5. Pass criteria

- Compose config renders without errors.
- Backend health/ready endpoints respond `2xx`.
- Orchestrator health/ready/metrics endpoints respond `2xx`.
- No secret values are printed in logs/output during checks.

## 6. Known gaps to track

- Request-id propagation verification is tracked in:
  - `REQUEST_ID_PROPAGATION_CHECKLIST.md`
- Alerting rules are documented but require environment-specific activation wiring.
