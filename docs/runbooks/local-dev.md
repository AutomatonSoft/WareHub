# Local Dev

## 1. Purpose

This runbook describes the root-level local development startup flow for the WareHub monorepo.

- Scope: local developer setup only
- Not for stage
- Not for production
- Not for deploy automation
- Not for migration execution

The recommended mode is root-driven local development:

- `start-dev.ps1` performs a cache-aware local dev startup from `infra/local/docker-compose.dev.yml`
- `start-dev.ps1` loads repo-root `.env` as the local source of truth
- `start-dev.ps1` can launch frontend, backend, database-service, and orchestrator
- `start-dev.ps1 -NoNewWindows` runs local apps as hidden background processes and writes logs to `logs/local-dev/`
- `start-dev.ps1` is the single command for local dev: each run does a full down + kill -> build -> up cycle (no separate stop/restart script)

## 2. Prerequisites

- Windows PowerShell
- Docker Desktop with `docker compose`
- Rust toolchain for backend work
- Node.js and npm for frontend work
- Python 3 plus service dependencies for Django/orchestrator work
- Flutter SDK for mobile work

Do not commit any real `.env` file. Maintain only repo-root `.env` for normal local startup.

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

Use only the repo-root env contract:

- root runtime: `.env`
- root schema: `.env.example`

Important:

- repo-root `.env` is the only manually maintained local env file
- do not commit any real `.env`
- do not manually maintain per-service `.env` files as parallel truth
- do not use production credentials
- keep local defaults on `localhost` or `127.0.0.1`
- see [env-contract.md](/I:/WareHub/docs/runbooks/env-contract.md) for the unified env contract

## 5. Root Startup Flow

Validate compose:

```powershell
docker compose -f infra/local/docker-compose.dev.yml config
```

Recommended local startup from repo root:

```powershell
Set-Location I:\WareHub
.\start-dev.ps1 -NoNewWindows
```

This now does all of the following:

- verifies you are running from repo root
- verifies Docker and `docker compose`
- validates `infra/local/docker-compose.dev.yml`
- loads repo-root `.env` into the startup process and child app processes
- derives a safe local Postgres target from `DEV_POSTGRES_*` for backend and database-service child processes
- normalizes local Postgres credentials to the dedicated local dev contract before compose/app startup
- stops previous WareHub local app listeners on `8931`, `8932`, `8934`, and `8935`
- reuses healthy local Docker dependencies by default
- starts only missing or unhealthy local Docker dependencies with `docker compose -f infra/local/docker-compose.dev.yml up -d`
- recreates local Docker dependencies only when `-ResetDeps` is passed
- reuses frontend dependencies when `package-lock.json` is unchanged
- reuses Python virtual environments for `database-service` and `orchestrator`
- skips Python dependency installs when `requirements.txt` hashes are unchanged
- stores local dependency hash markers under repo-local `.venv\local-dev\`
- waits for local Docker dependency readiness after startup
- prefers PowerShell 7 `pwsh` for app windows and printed helper commands, but falls back to Windows PowerShell `powershell` when `pwsh` is not installed
- launches app processes in separate PowerShell windows by default
- when `-NoNewWindows` is used, launches hidden background app processes and writes logs to:
  - `logs/local-dev/frontend.log`
  - `logs/local-dev/backend.log`
  - `logs/local-dev/database-service.log`
  - `logs/local-dev/orchestrator.log`
- prints local URLs and manual smoke commands

`.\start-dev.ps1` already tears everything down (processes + `docker compose down`), rebuilds, and brings it back up on every run — there is no separate stop step.

Dependency-only mode:

```powershell
Set-Location I:\WareHub
.\start-dev.ps1 -DepsOnly
```

`-NoApps` is an alias-equivalent mode for dependency-only startup.

Default visible-window mode:

```powershell
Set-Location I:\WareHub
.\start-dev.ps1
```

This mode still performs the same cache-aware startup, but launches app processes in separate PowerShell windows.

Background mode:

```powershell
Set-Location I:\WareHub
.\start-dev.ps1 -NoNewWindows
```

This mode performs the same cache-aware startup and launches the app processes in hidden background windows.
Each `.\start-dev.ps1` run shuts the previous local environment down first, so you do not need a separate stop command.

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

Explicit dependency/cache flags:

```powershell
.\start-dev.ps1 -ResetDeps
.\start-dev.ps1 -ReinstallDeps
.\start-dev.ps1 -SkipDependencyInstall
```

- `-ResetDeps` is the destructive local dependency reset path. It runs `docker compose -f infra/local/docker-compose.dev.yml down` and recreates only the local dev dependency containers.
- `-ReinstallDeps` forces frontend and Python dependency reinstalls without resetting Docker dependencies.
- `-SkipDependencyInstall` skips dependency install checks entirely and expects existing `node_modules` and Python virtual environments to already exist.

`start-dev.ps1` is now the single entry point. Every run performs a full
**down + kill -> build -> up** cycle (with a progress bar):

- safe stop of WareHub local app listeners + kill by PID files (frontend, backend, database-service, JV worker, orchestrator)
- `docker compose -f infra/local/docker-compose.dev.yml down`
- `docker compose -f infra/local/docker-compose.dev.yml build` (skip with `-SkipBuild`)
- bring dependencies + apps back up

There is no separate `stop-dev.ps1` / `restart-dev.ps1` anymore — their logic is folded into `start-dev.ps1`.

It does not:

- stop stage or prod containers
- run unscoped Docker cleanup
- stop stage or prod infrastructure

Primary local URLs:

- frontend: `http://localhost:8931`
- backend health: `http://localhost:8932/api/v1/healthz`
- database-service health: `http://localhost:8934/api/v1/healthz`
- orchestrator health: `http://localhost:8935/api/v1/healthz`

## 6. Backend Local Run

`start-dev.ps1` provides backend env from repo-root `.env`.

The helper launches the backend from `apps/backend` with:

```powershell
Set-Location I:\WareHub\apps\backend
cargo run
```

Notes:

- backend loads repo-root `.env` before service-local fallback files
- do not run this against stage or production databases
- backend dependency reuse is handled by Cargo's normal local cache; this startup slice does not add a separate Rust install layer

## 7. Frontend Local Run

`start-dev.ps1` provides frontend env from repo-root `.env`.

The helper launches the frontend from `apps/frontend` with:

```powershell
Set-Location I:\WareHub\apps\frontend
npm run dev
```

Notes:

- Next resolves repo-root `.env` before service-local fallback files
- browser-visible variables must still use `NEXT_PUBLIC_*`
- `start-dev.ps1` treats `apps/frontend/package-lock.json` as the dependency hash source of truth for startup installs
- if `node_modules` already exists and the lock hash is unchanged, startup logs `frontend dependencies unchanged; skipping install.`

## 8. Database-Service Local Run

`start-dev.ps1` provides database-service env from repo-root `.env`.
It also reuses a repo-local virtual environment at `I:\WareHub\.venv\database-service`.

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

Dependency cache notes:

1. `start-dev.ps1` hashes `services/database-service/requirements.txt`.
2. Hash markers are stored under `.venv\local-dev\`.
3. If the hash is unchanged, startup logs `database-service dependencies unchanged; skipping install.`
4. If the hash changes or `-ReinstallDeps` is passed, startup reinstalls into the existing venv.

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

`start-dev.ps1` provides orchestrator env from repo-root `.env`.
It also reuses a repo-local virtual environment at `I:\WareHub\.venv\orchestrator`.

Dependency manifest source of truth is `services/orchestrator/requirements.txt`.

Default helper command:

```powershell
Set-Location I:\WareHub\services\orchestrator
uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8935 --reload
```

Optional containerized orchestrator mode is deferred because the current local recovery slice avoids Dockerfile-path changes.

Dependency cache notes:

- `start-dev.ps1` hashes `services/orchestrator/requirements.txt`.
- Hash markers are stored under `.venv\local-dev\`.
- If the hash is unchanged, startup logs `orchestrator dependencies unchanged; skipping install.`

## 10. Mobile Local Run

1. Copy the required mobile keys from repo-root `.env.example` into your local mobile env workflow if needed.
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
[void][System.Management.Automation.Language.Parser]::ParseFile('I:\WareHub\tools\local\start-local-apps.ps1',[ref]$null,[ref]$null)
'@ | powershell -NoProfile -
Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName
Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','.venv','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName
Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.FullName -match '\\\.gitea$|\\\.github$' } | Select-Object FullName
Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '(\.pem$|\.key$|\.crt$|\.p12$|\.jks$|\.keystore$|id_rsa|id_ed25519|secret|password|credential|token)' } | Select-Object FullName
```

## 13. Troubleshooting

- If backend fails to start, verify repo-root `.env` and the derived local Postgres settings.
- If frontend proxy requests fail, verify repo-root `.env` and local backend/services ports.
- If database-service fails to connect, verify repo-root `.env` and local Postgres port `8933`.
- If orchestrator fails, verify repo-root `.env` and that database-service is already running on `8934`.
- If `-SkipDependencyInstall` is used and a venv or `node_modules` is missing, rerun without that flag.
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
