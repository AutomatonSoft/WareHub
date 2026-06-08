# API_CONTRACT_DRIFT_REPORT_2026-05-19

Cross-repo API contract verification snapshot.

## Verified

### Frontend (`sofortbot-frontend`)

- `npm run openapi:check` -> `OpenAPI types are in sync.`
- `npm run openapi:orchestrator:check` -> `OpenAPI types are in sync.`

### Orchestrator (`sb-sofort-orchestrator-service`)

- `python tools/export_openapi.py` completed.
- No local diff in `openapi/orchestrator-openapi.json` after export.
- `pytest -q` -> `51 passed`.

## Verification notes

### Django `database_service` migration-plan checks from host Python

Commands:

- `python manage.py showmigrations`
- `python manage.py migrate --plan --verbosity 2`

Both fail from host Python due to DB connection timeout (`django.db.utils.OperationalError: connection timeout expired`), because this local mode relies on shared DB tunnel/container runtime wiring.

### Django `database_service` migration-plan checks from dev container (`sofortbot-services-dev`)

Commands:

- `docker exec sofortbot-services-dev python manage.py showmigrations`
- `docker exec sofortbot-services-dev python manage.py migrate --plan`

Result (updated):

- commands execute successfully;
- pending migrations `jv_services.0009/0010` were applied in controlled window;
- post-apply verification:
  - `showmigrations`: `0009` and `0010` are `[X]`;
  - `migrate --plan`: `No planned migration operations`;
  - `makemigrations --check --dry-run --noinput`: `No changes detected`.

## Drift finding captured without DB connectivity (resolved locally)

Command:

- `python manage.py makemigrations --check --dry-run --noinput --verbosity 2`

Output indicates migration drift in `jv_services`:

- initial proposed file (before fix):
  - `jv_services/migrations/0009_jvbatchjob_remove_xljvbatchjobitem_job_and_more.py`
- local fix applied:
  - `jv_services/migrations/0009_state_rename_xljv_models_to_jv.py`
  - `jv_services/migrations/0010_alter_jvbatchjob_site_family.py`
- current `makemigrations` result:
  - `No changes detected`
  - with warning only about DB connectivity timeout for migration-history check.

## Required next actions

1. Keep using container runtime commands for DB-connected checks in this dev mode.
2. Before release, run one more migration verification pass in stage environment.
3. Keep rollout/rollback notes for `0009/0010` in migration runbook.
