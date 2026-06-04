# Local Dev

## 1. Purpose

This runbook describes the Slice 3B local development recovery path for the WareHub monorepo.

- Scope: local developer setup only
- Not for stage
- Not for production
- Not for deploy automation
- Not for migration execution

The recommended mode is hybrid local development:

- Docker Compose starts local dependencies
- backend runs manually from `apps/backend`
- frontend runs manually from `apps/frontend`
- database-service runs manually from `services/database-service`
- orchestrator runs manually from `services/orchestrator`

## 2. Prerequisites

- Windows PowerShell
- Docker Desktop with `docker compose`
- Rust toolchain for backend work
- Node.js and npm for frontend work
- Python 3 plus service dependencies for Django/orchestrator work
- Flutter SDK for mobile work

Do not reuse old tracked env files. Create only local untracked env files from the provided `.env.example` files.

## 3. Local Architecture

Default local dependency topology:

- `warehub-postgres` on `localhost:8933`
- `warehub-redis` on `localhost:8936`
- `warehub-minio` on `localhost:9000` and `localhost:9001`
- `warehub-rabbitmq` on `localhost:8937` and `localhost:15672`

Recommended host-run application topology:

- frontend -> `http://localhost:8931`
- backend -> `http://localhost:8932`
- database-service -> `http://localhost:8934`
- orchestrator -> `http://localhost:8935`

## 4. Environment Files

Use only example files as templates:

- root: `.env.example`
- infra: `infra/.env.example`
- backend: `apps/backend/.env.example`
- frontend: `apps/frontend/.env.example`
- database-service: `services/database-service/.env.example`
- orchestrator: `services/orchestrator/.env.example`
- mobile: `apps/mobile/.env.example`

Create local untracked files only when needed:

- `apps/backend/.env`
- `apps/frontend/.env.local`
- `services/database-service/.env`
- `services/orchestrator/.env`
- `apps/mobile/.env` if your local Flutter workflow needs it

Important:

- do not commit any real `.env`
- do not use production credentials
- keep local defaults on `localhost` or `127.0.0.1`

## 5. Start Local Dependencies

Validate compose:

```powershell
docker compose -f infra/local/docker-compose.dev.yml config
```

Start local dependencies:

```powershell
Set-Location I:\WareHub
.\start-dev.ps1
```

Stop local dependencies:

```powershell
Set-Location I:\WareHub
.\stop-dev.ps1
```

The current Slice 3B compose file starts only safe local dependencies. Application services are started manually.

## 6. Backend Local Run

1. Copy `apps/backend/.env.example` to `apps/backend/.env` and adjust only local placeholder values.
2. Keep `SKIP_DB_MIGRATIONS=true` unless you intentionally handle migrations outside this slice.
3. Start manually from `apps/backend`:

```powershell
Set-Location I:\WareHub\apps\backend
cargo run
```

Notes:

- current backend source still contains a legacy shared-env lookup
- fallback local `.env` loading still allows manual local startup
- do not run this against stage or production databases

## 7. Frontend Local Run

1. Copy `apps/frontend/.env.example` to `apps/frontend/.env.local`.
2. Keep local URLs pointed at `localhost`.
3. Start manually from `apps/frontend`:

```powershell
Set-Location I:\WareHub\apps\frontend
npm run dev
```

Notes:

- current `next.config.mjs` still contains a legacy shared-env lookup
- Next local env files remain the monorepo-safe workaround for Slice 3B

## 8. Database-Service Local Run

1. Copy `services/database-service/.env.example` to `services/database-service/.env`.
2. For host-local dependency ownership, use `services/requirements.txt` as the current source of truth.
3. If you run the service directly on the host, keep startup and migrations explicit and separate.
4. Do not invent an unverified install command sequence beyond the confirmed dependency manifest ownership.
5. If you use the service-local Docker flow, validate it from repo root:

```powershell
Set-Location I:\WareHub
docker compose -f services/database-service/docker-compose.yml config
```

6. The normalized service-local Docker flow uses:
   - build context `services`
   - Dockerfile `database-service/Dockerfile`
   - Django API on `localhost:8934`
   - service-local Postgres on `localhost:8543`
7. The service-local compose command does not auto-run migrations.
8. If you inspect or repair this later, use [slice-3i-database-service-bootstrap-contract-report.md](/I:/WareHub/docs/runbooks/slice-3i-database-service-bootstrap-contract-report.md) as the source of truth for the current state.

Do not enable implicit migrations as part of automated startup in this slice.

Current limitation:

- host-local manual install/start commands still remain partially undocumented by design
- the service-local Docker flow is local/dev only and must not be treated as stage/prod deployment guidance

## 9. Orchestrator Local Run

1. Copy `services/orchestrator/.env.example` to `services/orchestrator/.env`.
2. Keep `DATABASE_SERVICE_BASE_URL=http://localhost:8934`.
3. Start manually from `services/orchestrator`:

```powershell
Set-Location I:\WareHub\services\orchestrator
uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8011 --reload
```

Optional containerized orchestrator mode is deferred because the current local recovery slice avoids Dockerfile-path changes.

## 10. Mobile Local Run

1. Copy `apps/mobile/.env.example` to your local mobile env workflow if needed.
2. If you run on a physical device, replace `127.0.0.1` with your LAN-accessible backend host.
3. Use the app's existing local Flutter workflow from `apps/mobile`.

## 11. Optional Legacy Tunnel Mode

Legacy shared DB tunnel mode is still documented only as an optional fallback.

Rules:

- it is not the default
- it must never point to stage or production by accident
- it must be configured through untracked local env only

If you absolutely need it, document the local override in your shell session or local private env file. Do not commit it.

## 12. Validation Commands

Run from `I:\WareHub`:

```powershell
git status --short
docker compose -f infra/local/docker-compose.dev.yml config
Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName
Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','.venv','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName
Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.FullName -match '\\\.gitea$|\\\.github$' } | Select-Object FullName
Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '(\.pem$|\.key$|\.crt$|\.p12$|\.jks$|\.keystore$|id_rsa|id_ed25519|secret|password|credential|token)' } | Select-Object FullName
```

## 13. Troubleshooting

- If backend fails to start, verify `apps/backend/.env` exists and `DATABASE_URL` points to local Postgres.
- If frontend proxy requests fail, verify `apps/frontend/.env.local` and local backend/services ports.
- If database-service fails to connect, verify `services/database-service/.env` and local Postgres port `8933`.
- If orchestrator fails, verify `services/orchestrator/.env` and that database-service is already running on `8934`.
- If mobile on device cannot reach backend, replace `127.0.0.1` with a LAN-reachable host IP in your local mobile config.

## 14. Do Not Use In Stage/Prod

This runbook is for local developer recovery only.

- Do not use these local defaults in stage
- Do not use these local defaults in production
- Do not run deploy from this flow
- Do not run migrations automatically from this flow
