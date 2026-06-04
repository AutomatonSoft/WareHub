# Slice 2B - Latest Legacy Source Sync Report

## 1. Summary

Синхронизированы последние изменения из legacy repos в clean monorepo `I:\WareHub` перед Slice 3. Это был только sync/import slice:

- обновлены актуальные source/config/docs files из:
  - `F:\SofortBOT\sofortbot-backend`
  - `F:\SofortBOT\sofortbot-frontend`
  - `F:\SofortBOT\sofortbot-mobile`
  - `F:\SofortBOT\sofortbot-services`
  - `F:\SofortBOT\sofortbot-infra`
- синхронизированы backend SQLx migrations из `apps/backend/migrations/*.sql`
- не выполнялись path rewrites, local dev recovery, deploy, migrations, build/test
- опасные и runtime artifacts не переносились

Наиболее заметные свежие upstream changes пришли из:

- `sofortbot-frontend` latest commit `2cde694 JV uploads`
- `sofortbot-services` latest commit `1c3ba96 JV upload`

## 2. Preconditions

| Repo | Branch | Clean | Latest commit |
| --- | --- | --- | --- |
| `F:\SofortBOT\sofortbot-backend` | `main` | yes | `08cf844 feat(backend): tighten routing and profile handler updates` |
| `F:\SofortBOT\sofortbot-frontend` | `main` | yes | `2cde694 JV uploads` |
| `F:\SofortBOT\sofortbot-mobile` | `main` | yes | `c56e6b2 asdasd` |
| `F:\SofortBOT\sofortbot-services` | `main` | yes | `1c3ba96 JV upload` |
| `F:\SofortBOT\sofortbot-infra` | `main` | yes | `85b8bf9 chore: sync workspace changes` |

## 3. Source paths checked

- `F:\SofortBOT\sofortbot-backend`
- `F:\SofortBOT\sofortbot-frontend`
- `F:\SofortBOT\sofortbot-mobile`
- `F:\SofortBOT\sofortbot-services`
- `F:\SofortBOT\sofortbot-services\services\database_service`
- `F:\SofortBOT\sofortbot-services\services\sb-sofort-orchestrator-service`
- `F:\SofortBOT\sofortbot-services\README.md`
- `F:\SofortBOT\sofortbot-services\requirements.txt`
- `F:\SofortBOT\sofortbot-infra`

## 4. Targets updated

- `apps/backend`
- `apps/frontend`
- `apps/mobile`
- `services/database-service`
- `services/orchestrator`
- `services/README.md`
- `services/requirements.txt`
- `infra`

## 5. Files changed

### Modified

- `apps/backend`
  - source files
  - config files
  - all tracked SQLx migration files under `migrations/`
- `apps/frontend`
  - dashboard/inventory/profile/product-editor/channel UI
  - tests
  - docs
  - generated OpenAPI type files already tracked in source
- `apps/mobile`
  - Flutter app sources
  - tests
  - Android/plugin vendor source files
- `services/database-service`
  - JV upload/batch/category related logic
  - Django endpoints/tests/migrations
  - HOOD core/views/tests
- `services/orchestrator`
  - product editor and JV orchestration flow
  - gateway/store/http/job handling
  - tests
- `infra`
  - deploy configs
  - runner configs
  - docs
  - scripts

### Added

Новые source files, появившиеся в monorepo после sync:

- `services/database-service/jv_services/category_main_overrides.json`
- `services/database-service/jv_services/category_mapping_overrides.json`
- `services/database-service/jv_services/delivery_mapping_overrides.json`
- `services/database-service/jv_services/management/commands/generate_jv_category_ai_mapping_report.py`

### Deleted

- Массовых удалений не выполнялось.
- Единственный target-only path, обнаруженный после сравнения filtered source vs target:
  - `infra/nginx/.gitkeep`
- Это осознанно сохраненный placeholder пустой папки, удаление не требовалось.

### Skipped

- real `.env` files
- cookies
- runtime DB/sqlite files
- frontend test-result artifacts
- frontend visual screenshots
- orchestrator runtime sqlite data
- generated reports in infra docs security/verification areas
- `services/database-service/.env.example` из source из-за наличия значений, похожих на реальные credentials

## 6. Excluded / skipped files

Исключались по policy:

- `.git`
- `.gitea`
- `.github`
- `.env`
- `.env.*` except `*.example`
- `*.local`
- `*.pem`
- `*.key`
- `*.crt`
- `*.p12`
- `*.jks`
- `*.keystore`
- `id_rsa`
- `id_ed25519`
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
- `.flutter-plugins`
- `.flutter-plugins-dependencies`
- `.pub-cache`
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
- `*.gz`
- `*.zip`
- `*.7z`
- `*.tar`

Дополнительно skipped как public-repo risk:

- `F:\SofortBOT\sofortbot-backend\.afterbuy_jv.cookie`
- `F:\SofortBOT\sofortbot-backend\.afterbuy_xl.cookie`
- `F:\SofortBOT\sofortbot-backend\.env`
- `F:\SofortBOT\sofortbot-frontend\.env.local`
- `F:\SofortBOT\sofortbot-services\services\database_service\db.sqlite3`
- `F:\SofortBOT\sofortbot-infra\.env`
- `F:\SofortBOT\sofortbot-services\services\database_service\.env.example`
  - skipped because it contains values that look like real DB/FTP/login credentials
- `F:\SofortBOT\sofortbot-frontend\test-results\.last-run.json`
- `F:\SofortBOT\sofortbot-frontend\e2e\__screenshots__\...`
- `F:\SofortBOT\sofortbot-services\services\database_service\jv_services\reports\*.json`
- `F:\SofortBOT\sofortbot-services\services\sb-sofort-orchestrator-service\data\*.sqlite3*`
- generated secret/preflight/verification `.txt` reports under `F:\SofortBOT\sofortbot-infra\docs\...`

## 7. Suspicious findings

- `F:\SofortBOT\sofortbot-services\services\database_service\.env.example`
  - contains values resembling real credentials:
    - `POSTGRES_USER=Ravil`
    - `POSTGRES_PASSWORD=Ravilka112`
    - public IP/host values
    - FTP and login/password values
  - not synchronized into monorepo during Slice 2B
- `F:\SofortBOT\sofortbot-backend\.afterbuy_jv.cookie`
  - skipped as sensitive runtime auth material
- `F:\SofortBOT\sofortbot-backend\.afterbuy_xl.cookie`
  - skipped as sensitive runtime auth material
- `F:\SofortBOT\sofortbot-infra\.env`
  - skipped as real env file

## 8. Backend SQLx migrations status

- checked path:
  - `F:\SofortBOT\sofortbot-backend\migrations`
  - `I:\WareHub\apps\backend\migrations`
- target migration count after sync:
  - `24`
- new migration filenames synced:
  - no new filenames detected relative to current target set
- migration contents synchronized:
  - yes, tracked SQLx migration files were updated from legacy source

## 9. Validation commands and results

### Preconditions

- `Get-Location`
  - result: `I:\WareHub`
- `git branch --show-current`
  - result: `feature/slice-2b-sync-latest-source`
- `git status --short`
  - result before sync: clean

### Source repo checks

- `git -C <repo> branch --show-current`
  - result: all source repos on `main`
- `git -C <repo> status --short`
  - result: all source repos clean
- `git -C <repo> log --oneline -1`
  - result: latest commits recorded in Preconditions

### Post-sync validation

- `git status --short`
  - result: only source sync changes plus new report file
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
  - result: only `.env.example` / `.env.*.example`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','.venv','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
  - result: none
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.FullName -match '\\\.gitea$|\\\.github$' } | Select-Object FullName`
  - result: only root `I:\WareHub\.github`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '(\.pem$|\.key$|\.crt$|\.p12$|\.jks$|\.keystore$|id_rsa|id_ed25519|secret|password|credential|token)' } | Select-Object FullName`
  - result: matches only in safe code/docs/script names such as password-reset handlers, `secret-policy.md`, `SECRET_ROTATION_PLAN.md`, `scan-secrets.ps1`
- `Get-ChildItem -Recurse -Force I:\WareHub\apps\backend\migrations | Select-Object FullName`
  - result: 24 SQLx migration files present
- `git diff --stat`
  - result: large sync across backend/frontend/mobile/services/infra; no commit performed

## 10. Risks

- runtime paths are still not fixed
- local dev is still not recovered
- CI/CD is still not configured in this monorepo
- old repo naming still exists in code/docs/configs
- source sync may update generated/tracked files like `next-env.d.ts` and OpenAPI generated types; these were kept because they are tracked upstream source
- `services/database-service/.env.example` remains a known security cleanup item for a later safe slice

## 11. Next step

Slice 3 - local dev path rewrites / recovery.

## 12. Final Resync Before Commit

This resync was executed on top of the existing uncommitted Slice 2B worktree in `I:\WareHub` before any commit.

### Latest legacy commits after final pull

- `F:\SofortBOT\sofortbot-backend`
  - branch: `main`
  - status: clean
  - latest: `08cf844 feat(backend): tighten routing and profile handler updates`
- `F:\SofortBOT\sofortbot-frontend`
  - branch: `main`
  - status: clean
  - latest: `2cde694 JV uploads`
- `F:\SofortBOT\sofortbot-mobile`
  - branch: `main`
  - status: clean
  - latest: `c56e6b2 asdasd`
- `F:\SofortBOT\sofortbot-services`
  - branch: `main`
  - status: clean
  - latest: `9ffb7b0 image update`
  - note: this repo changed after the first Slice 2B sync and was explicitly resynchronized
- `F:\SofortBOT\sofortbot-infra`
  - branch: `main`
  - status: clean
  - latest: `85b8bf9 chore: sync workspace changes`

### Additional files changed by the final resync

The final legacy delta between the previously recorded services commit `1c3ba96` and the new services commit `9ffb7b0` was:

- `services/database_service/jv_services/source_media.py`
- `services/database_service/jv_services/source_metadata.py`
- `services/sb-sofort-orchestrator-service/data/orchestrator_jobs.sqlite3-shm`
- `services/sb-sofort-orchestrator-service/data/orchestrator_jobs.sqlite3-wal`

Only the following files were additionally synchronized into `I:\WareHub`:

- `I:\WareHub\services\database-service\jv_services\source_media.py`
- `I:\WareHub\services\database-service\jv_services\source_metadata.py`

The SQLite runtime artifacts under orchestrator `data\` were detected and skipped.

### New suspicious skipped files during final resync

No new secret files were copied.

New runtime/suspicious files detected in the final services delta and skipped:

- `F:\SofortBOT\sofortbot-services\services\sb-sofort-orchestrator-service\data\orchestrator_jobs.sqlite3-shm`
- `F:\SofortBOT\sofortbot-services\services\sb-sofort-orchestrator-service\data\orchestrator_jobs.sqlite3-wal`

Previously known suspicious/skipped items remained excluded, including:

- real `.env` files
- backend cookie auth artifacts
- SQLite/runtime DB files
- generated verification/preflight `.txt` reports

### Backend SQLx migrations count after final resync

- target path: `I:\WareHub\apps\backend\migrations`
- total SQLx migration files present: `24`
- no additional migration filenames appeared during the final resync

### Validation results after final resync

- `git status --short`
  - result: expected non-clean Slice 2B worktree remains; report file still untracked; additional synced sources are reflected in the existing modified set
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
  - result: only `.env.example` files:
    - `I:\WareHub\.env.example`
    - `I:\WareHub\apps\backend\.env.example`
    - `I:\WareHub\apps\frontend\.env.example`
    - `I:\WareHub\apps\mobile\.env.example`
    - `I:\WareHub\infra\.env.example`
    - `I:\WareHub\infra\deploy\runners\.env.example`
    - `I:\WareHub\services\database-service\.env.example`
    - `I:\WareHub\services\orchestrator\.env.example`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','.venv','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
  - result: none
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.FullName -match '\\\.gitea$|\\\.github$' } | Select-Object FullName`
  - result: only root `I:\WareHub\.github`
- `Get-ChildItem -Recurse -Force I:\WareHub\apps\backend\migrations | Select-Object FullName`
  - result: `24` migration files present
- `git diff --stat`
  - result: aggregate uncommitted Slice 2B diff now shows `35 files changed, 2692 insertions(+), 630 deletions(-)` on tracked files
