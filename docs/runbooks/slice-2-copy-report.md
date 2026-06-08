# Slice 2 Copy Report

## 1. Summary

- Перенесен исходный код и связанный config/docs из старого polyrepo workspace `F:\SofortBOT` в новый monorepo `I:\WareHub`.
- Источники:
  - `F:\SofortBOT\sofortbot-backend` -> `apps/backend`
  - `F:\SofortBOT\sofortbot-frontend` -> `apps/frontend`
  - `F:\SofortBOT\sofortbot-mobile` -> `apps/mobile`
  - `F:\SofortBOT\sofortbot-services\services\database_service` -> `services/database-service`
  - `F:\SofortBOT\sofortbot-services\services\sb-sofort-orchestrator-service` -> `services/orchestrator`
  - selected shared files from `F:\SofortBOT\sofortbot-services` -> `services/`
  - selected infra source/config/docs from `F:\SofortBOT\sofortbot-infra` -> `infra/`
- Не переносились:
  - `.git`, `.gitea`, `.github`
  - реальные `.env*`
  - build/cache/artifact directories
  - logs, dumps, generated reports
  - suspicious runtime files and local IDE/build state
- Код после копирования не редактировался.
- Runtime paths, imports, docker-compose paths, CI/CD workflows, deploy, stage/prod и migrations не трогались.

## 2. Preconditions

| Path | Branch | Status clean | Latest commit |
| --- | --- | --- | --- |
| `F:\SofortBOT\sofortbot-backend` | `main` | yes | `08cf844 feat(backend): tighten routing and profile handler updates` |
| `F:\SofortBOT\sofortbot-frontend` | `main` | yes | `8a4817b merge` |
| `F:\SofortBOT\sofortbot-mobile` | `main` | yes | `c56e6b2 asdasd` |
| `F:\SofortBOT\sofortbot-services` | `main` | yes | `d512615 fsdfsdaf` |
| `F:\SofortBOT\sofortbot-infra` | `main` | yes | `85b8bf9 chore: sync workspace changes` |

## 3. Source paths checked

- `F:\SofortBOT\sofortbot-backend`
- `F:\SofortBOT\sofortbot-frontend`
- `F:\SofortBOT\sofortbot-mobile`
- `F:\SofortBOT\sofortbot-services`
- `F:\SofortBOT\sofortbot-services\services\database_service`
- `F:\SofortBOT\sofortbot-services\services\sb-sofort-orchestrator-service`
- `F:\SofortBOT\sofortbot-infra`
- `F:\SofortBOT\sofortbot-infra\deploy`
- `F:\SofortBOT\sofortbot-infra\local`
- `F:\SofortBOT\sofortbot-infra\scripts`
- `F:\SofortBOT\sofortbot-infra\docs`

## 4. Files/directories copied

### `apps/backend`

- Root source/config files copied: `.dockerignore`, `.env.example`, `.gitignore`, `Cargo.lock`, `Cargo.toml`, `Dockerfile`, `README.md`
- Source tree copied: `src/`
- Final copied file count: `75`

### `apps/frontend`

- Root source/config files copied: `.dockerignore`, `.env.example`, `.gitignore`, `components.json`, `Dockerfile`, `eslint.config.mjs`, `instrumentation-client.ts`, `instrumentation.ts`, `next-env.d.ts`, `next.config.mjs`, `package-lock.json`, `package.json`, `playwright.config.ts`, `postcss.config.js`, `proxy.ts`, `README.md`, `sentry.edge.config.ts`, `sentry.server.config.ts`, `tailwind.config.js`, `tsconfig.json`
- Directories copied: `.storybook/`, `app/`, `components/`, `docs/`, `e2e/`, `lib/`, `openapi/`, `public/`, `stories/`, `tests/`, `tools/`
- Final copied file count: `469`

### `apps/mobile`

- Root source/config files copied: `.dockerignore`, `.env.example`, `.gitignore`, `.metadata`, `analysis_options.yaml`, `Dockerfile`, `pubspec.lock`, `pubspec.yaml`, `README.md`
- Directories copied: `android/`, `assets/`, `lib/`, `test/`, `vendor/`, `web/`, `windows/`
- Final copied file count: `329`

### `services/database-service`

- Service tree copied from `services/database_service`
- Root files copied: `.dockerignore`, `.env.example`, `docker-compose.yml`, `Dockerfile`, `manage.py`, `README.md`
- Directories copied: `catalog_core/`, `database/`, `database_service/`, `docs/`, `hood_service/`, `jv_services/`, `kaufland/`, `orders_pars/`, `otto_service/`, `tools/`, `xl_services/`
- Final copied file count: `206`

### `services/orchestrator`

- Service tree copied from `services/sb-sofort-orchestrator-service`
- Root files copied: `.env.example`, `.gitignore`, `Dockerfile`, `README.md`, `requirements.txt`
- Directories copied: `docs/`, `image/`, `openapi/`, `src/`, `tests/`, `tools/`
- Final copied file count: `54`

### `infra`

- Root files copied: `.dockerignore`, `.env.example`, `.gitignore`, `Dockerfile`, `OPS_HEALTH_VERIFICATION.md`, `README.md`, `REQUEST_ID_PROPAGATION_CHECKLIST.md`, `SECRET_ROTATION_PLAN.md`, `SECURITY_BASELINE.md`, `up-prod.sh`, `up-stage.sh`, `versions.env`
- Directories copied: `deploy/`, `local/`, `scripts/`
- Selected docs copied into `infra/docs/` after generated report filtering
- `infra/nginx/` remained untouched and still contains `.gitkeep`
- Final copied file count: `54`

## 5. Files/directories excluded

- Git metadata and old workflows:
  - `.git`
  - `.gitea`
  - `.github`
- Env and local config:
  - `.env`
  - `.env.local`
  - `.env.*` except `*.example`
  - `*.local`
- Secrets and credentials by name/extension:
  - `*.pem`
  - `*.key`
  - `*.crt`
  - `*.p12`
  - `*.jks`
  - `*.keystore`
  - `id_rsa`
  - `id_ed25519`
- Build/cache/artifact directories:
  - `node_modules`
  - `.next`
  - `dist`
  - `build`
  - `target`
  - `coverage`
  - `.venv`
  - `venv`
  - `env`
  - `__pycache__`
  - `.pytest_cache`
  - `.ruff_cache`
  - `.mypy_cache`
  - `.dart_tool`
- Temporary/runtime/generated material:
  - `_audit`
  - `_release_reports`
  - `tmp`
  - `temp`
  - `logs`
  - `*.log`
  - `*.sqlite`
  - `*.sqlite3`
  - `*.db`
  - `*.dump`
  - `*.sql`
  - `*.gz`
  - `*.zip`
  - `*.7z`
  - `*.tar`
- Additional cleanup after initial copy:
  - `apps/backend/uploads/`
  - `apps/frontend/test-results/`
  - `apps/frontend/e2e/__screenshots__/`
  - mobile IDE and Gradle local state directories

## 6. Suspicious files found and skipped

- `F:\SofortBOT\sofortbot-backend\.afterbuy_jv.cookie` - runtime cookie file, skipped as sensitive local credential material
- `F:\SofortBOT\sofortbot-backend\.afterbuy_xl.cookie` - runtime cookie file, skipped as sensitive local credential material
- `F:\SofortBOT\sofortbot-infra\.env` - real env file, skipped by policy
- `F:\SofortBOT\sofortbot-services\services\database_service\db.sqlite3` - runtime database file, skipped as artifact
- Generated verification and preflight `.txt` reports under `F:\SofortBOT\sofortbot-infra\docs\...` - skipped as generated operational output

## 7. Services root-level files decision

- Found at `F:\SofortBOT\sofortbot-services` root:
  - `.dockerignore`
  - `.gitignore`
  - `README.md`
  - `requirements.txt`
- Transferred:
  - `README.md` -> `I:\WareHub\services\README.md`
  - `requirements.txt` -> `I:\WareHub\services\requirements.txt`
- Reason:
  - these files are shared repository-level guidance and Python dependency baseline relevant to service development context
- Skipped:
  - `.dockerignore` - not enough evidence that a monorepo-level `services/.dockerignore` is required in Slice 2
  - `.gitignore` - monorepo already has root ignore policy
  - `services/README.md` from old repo - skipped to avoid conflicting duplicate README placement without path rewrite work
  - `tools/new-service.ps1` - not required for database-service or orchestrator import itself
  - old repo `docs/` - not required for raw service import in this slice
- Needs confirmation:
  - whether old `services/README.md` should be migrated later into `docs/architecture/` or a dedicated `services/CONVENTIONS.md`

## 8. Infra files decision

- Transferred:
  - root infra source/config/docs files listed above
  - `deploy/`
  - `local/`
  - `scripts/`
  - selected authored Markdown docs from `docs/`
- Skipped:
  - `F:\SofortBOT\sofortbot-infra\.env`
  - old `.gitea/`
  - old `.github/`
  - generated verification/preflight/signoff text outputs
  - runtime or local secret material
- Requires path rewrite in Slice 3:
  - docker-compose paths
  - deploy script relative paths
  - nginx template references
  - any repo-root assumptions inside infra scripts and docs

## 9. Validation commands and results

### Preconditions

- `Get-Location`
  - result: `I:\WareHub`
- `git branch --show-current`
  - result: `feature/slice-2-copy-code`
- `git status --short`
  - result before copy: clean

### Source repo checks

- `git -C <repo> branch --show-current`
  - result: all source repos on `main`
- `git -C <repo> status --short`
  - result: all source repos clean
- `git -C <repo> log --oneline -1`
  - result: latest commits recorded in Preconditions

### Post-copy validation

- `git status --short`
  - result: new imported files and expected `.gitkeep` removals are visible; no commit performed
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
  - result: only `.env.example` and `.env.*.example` files found
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','.venv','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
  - result: none
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.FullName -match '\\\.gitea$|\\\.github$' } | Select-Object FullName`
  - result: only root `I:\WareHub\.github`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '(\.pem$|\.key$|\.crt$|\.p12$|\.jks$|\.keystore$|id_rsa|id_ed25519|secret|password|credential|token)' } | Select-Object FullName`
  - result: matches are limited to source code/docs names such as password-reset handlers, `docs/ci-cd/secret-policy.md`, `infra/SECRET_ROTATION_PLAN.md`, `infra/scripts/scan-secrets.ps1`; no key/cert/env secret files copied
- `git diff --stat`
  - result: shows tracked `.gitkeep` removals; imported files are new untracked content

## 10. Risks

- Paths may still be broken because Slice 2 did not rewrite imports or runtime paths.
- Docker Compose paths were copied as-is and have not been adapted for monorepo layout.
- Imports, configs and build entrypoints were not validated by runtime execution.
- CI/CD is not added in this slice.
- Deploy behavior was not checked.
- SQLx backend migration `.sql` files were not copied because the global exclude list explicitly forbids `*.sql`; this may require explicit confirmation or a policy adjustment in a later slice.
- Some copied docs may still reference old polyrepo paths.

## 11. Next step

Slice 3 - path rewrites / local dev recovery.
