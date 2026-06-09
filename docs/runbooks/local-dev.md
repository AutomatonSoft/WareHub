# Local Dev

## 1. Purpose

This runbook describes the root-level local development startup flow for the WareHub monorepo.

- Scope: local developer setup only
- Not for stage
- Not for production
- Not for deploy automation
- Not for migration execution

The recommended mode is root-driven local development:

- `start-dev.ps1` starts local Docker dependencies from `infra/local/docker-compose.dev.yml`
- `start-dev.ps1` prepares local untracked env files from examples if they do not exist
- `start-dev.ps1` can launch frontend, backend, database-service, and orchestrator
- `stop-dev.ps1` stops only the local Docker dependencies from the same compose file

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

## 5. Root Startup Flow

Validate compose:

```powershell
docker compose -f infra/local/docker-compose.dev.yml config
```

Default local startup from repo root:

```powershell
Set-Location I:\WareHub
.\start-dev.ps1
```

This now does all of the following:

- verifies you are running from repo root
- verifies Docker and `docker compose`
- validates `infra/local/docker-compose.dev.yml`
- starts only local dependencies from `infra/local/docker-compose.dev.yml`
- waits for local Postgres to become healthy
- creates local env files only if they do not already exist:
  - `apps/backend/.env`
  - `apps/frontend/.env.local`
  - `services/database-service/.env`
  - `services/orchestrator/.env`
- does not overwrite existing local env files
- prefers PowerShell 7 `pwsh` for app windows and printed helper commands, but falls back to Windows PowerShell `powershell` when `pwsh` is not installed
- launches app processes in separate PowerShell windows by default
- prints local URLs and manual smoke commands

Dependency-only mode:

```powershell
Set-Location I:\WareHub
.\start-dev.ps1 -DepsOnly
```

`-NoApps` is an alias-equivalent mode for dependency-only startup.

Print-only mode for app commands:

```powershell
Set-Location I:\WareHub
.\start-dev.ps1 -NoNewWindows
```

This mode still starts local Docker dependencies, but prints the exact app commands instead of opening new PowerShell windows.
The printed commands use the resolved local PowerShell executable instead of assuming `pwsh`.

Selective app skipping:

```powershell
.\start-dev.ps1 -SkipFrontend
.\start-dev.ps1 -SkipBackend
.\start-dev.ps1 -SkipServices
.\start-dev.ps1 -SkipOrchestrator
```

Optional explicit Django migrations:

```powershell
.\start-dev.ps1 -WithMigrations
```

Important:

- Django migrations are not run automatically by default
- backend keeps `SKIP_DB_MIGRATIONS=true` by default in local env bootstrap
- stage and production are not touched by this flow

Stop local dependencies:

```powershell
Set-Location I:\WareHub
.\stop-dev.ps1
```

`stop-dev.ps1` runs only:

- `docker compose -f infra/local/docker-compose.dev.yml down`

It does not:

- stop stage or prod containers
- run unscoped Docker cleanup
- stop manually launched app windows

## 6. Backend Local Run

`start-dev.ps1` creates `apps/backend/.env` automatically from `apps/backend/.env.example` if it is missing.

Seeded local defaults:

- `DATABASE_URL=postgres://warehub:warehub@localhost:8933/warehub`
- `APP_ENV=dev`
- `APP_PORT=8932`
- `SKIP_DB_MIGRATIONS=true`
- `CORS_ALLOW_ORIGINS=http://localhost:8931`

The helper launches the backend from `apps/backend` with:

```powershell
Set-Location I:\WareHub\apps\backend
cargo run
```

Notes:

- current backend source still contains a legacy shared-env lookup
- fallback local `.env` loading still allows manual local startup
- do not run this against stage or production databases

## 7. Frontend Local Run

`start-dev.ps1` creates `apps/frontend/.env.local` automatically from `apps/frontend/.env.example` if it is missing.

Seeded local defaults:

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8932/api/v1`
- `BACKEND_INTERNAL_API_BASE_URL=http://127.0.0.1:8932/api/v1`
- `NEXT_PUBLIC_SERVICES_API_BASE_URL=http://localhost:8934`
- `NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL=http://localhost:8935`
- `BACKEND_ORIGIN=http://localhost:8932`
- `SERVICES_ORIGIN=http://localhost:8934`
- `PORT=8931`

The helper launches the frontend from `apps/frontend` with:

```powershell
Set-Location I:\WareHub\apps\frontend
npm run dev
```

Notes:

- current `next.config.mjs` still contains a legacy shared-env lookup
- Next local env files remain the monorepo-safe workaround for Slice 3B

## 8. Database-Service Local Run

`start-dev.ps1` creates `services/database-service/.env` automatically from `services/database-service/.env.example` if it is missing.

Seeded local defaults:

- `POSTGRES_DB=warehub`
- `POSTGRES_USER=warehub`
- `POSTGRES_PASSWORD=warehub`
- `POSTGRES_HOST=localhost`
- `POSTGRES_PORT=8933`
- `DATABASE_URL=postgresql://warehub:warehub@localhost:8933/warehub`
- `DEBUG=true`
- `ALLOWED_HOSTS=127.0.0.1,localhost`

Default helper command:

```powershell
Set-Location I:\WareHub\services\database-service
python manage.py runserver 0.0.0.0:8934
```

Optional explicit migration mode:

```powershell
Set-Location I:\WareHub\services\database-service
python manage.py migrate
python manage.py runserver 0.0.0.0:8934
```

The root script uses the migration variant only when `-WithMigrations` is passed.

Legacy notes retained:

2. Dependency manifest source of truth is `services/database-service/requirements.txt`.
3. `services/requirements.txt` is deprecated and must not be used as the source of truth for active Python service bootstrap.
4. Django entrypoint remains `services/database-service/manage.py`.
5. Preferred future host-local installer is `uv`.
6. Documentation-only target bootstrap sequence:

```powershell
Set-Location I:\WareHub\services\database-service
uv venv
uv pip install -r requirements.txt
```

7. `uv` install validation was not executed in this slice.
8. If you run the service directly on the host, keep startup and migrations explicit and separate.
9. If you use the service-local Docker flow, validate it from repo root:

```powershell
Set-Location I:\WareHub
docker compose -f services/database-service/docker-compose.yml config
```

10. The normalized service-local Docker flow uses:
   - build context `services`
   - Dockerfile `database-service/Dockerfile`
   - dependency manifest `database-service/requirements.txt`
   - Django API on `localhost:8934`
   - service-local Postgres on `localhost:8543`
11. The service-local compose file is `services/database-service/docker-compose.yml`.
12. The service-local compose command does not auto-run migrations.
13. If you inspect or repair this later, use [slice-3k-database-service-requirements-audit-report.md](/I:/WareHub/docs/runbooks/slice-3k-database-service-requirements-audit-report.md) as the source of truth for the current state.

Do not enable implicit migrations as part of automated startup in this slice.

Current limitation:

- `uv` target policy is documented, but not runtime-validated in this slice
- the service-local Docker flow is local/dev only and must not be treated as stage/prod deployment guidance

## 9. Orchestrator Local Run

`start-dev.ps1` creates `services/orchestrator/.env` automatically from `services/orchestrator/.env.example` if it is missing.

Seeded local defaults:

- `DATABASE_SERVICE_BASE_URL=http://localhost:8934`
- `ORCHESTRATOR_HOST=0.0.0.0`
- `ORCHESTRATOR_PORT=8935`

Dependency manifest source of truth is `services/orchestrator/requirements.txt`.

Default helper command:

```powershell
Set-Location I:\WareHub\services\orchestrator
uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8935 --reload
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
.\start-dev.ps1 -DepsOnly
.\start-dev.ps1 -NoNewWindows
@'
[void][System.Management.Automation.Language.Parser]::ParseFile('I:\WareHub\start-dev.ps1',[ref]$null,[ref]$null)
[void][System.Management.Automation.Language.Parser]::ParseFile('I:\WareHub\stop-dev.ps1',[ref]$null,[ref]$null)
[void][System.Management.Automation.Language.Parser]::ParseFile('I:\WareHub\tools\local\start-local-apps.ps1',[ref]$null,[ref]$null)
'@ | powershell -NoProfile -
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
- If `-NoNewWindows` is used, remember that `start-dev.ps1` prints commands but does not launch app processes.
- If mobile on device cannot reach backend, replace `127.0.0.1` with a LAN-reachable host IP in your local mobile config.

## 14. Do Not Use In Stage/Prod

This runbook is for local developer recovery only.

- Do not use these local defaults in stage
- Do not use these local defaults in production
- Do not run deploy from this flow
- Do not run migrations automatically from this flow

## 15. Python Services Dependency Policy

- Service-local manifests are the source of truth for active Python services.
- `services/database-service` owns `services/database-service/requirements.txt`.
- `services/orchestrator` owns `services/orchestrator/requirements.txt`.
- `services/requirements.txt` is deprecated legacy/shared manifest only.
- Do not add new dependencies to `services/requirements.txt`.
- No local bootstrap flow in this runbook auto-runs migrations.
