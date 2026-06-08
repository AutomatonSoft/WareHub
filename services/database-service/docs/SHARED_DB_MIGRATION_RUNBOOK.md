# Shared DB Migration Runbook (Dev Tunnel Mode)

Date: 2026-05-19
Scope: `sofortbot-services/services/database_service`

## Purpose

Safe procedure for applying Django migrations to the shared development database when local host Python cannot reliably use the DB tunnel, but the `sofortbot-services-dev` container can.

## Non-negotiable rules

- Do not run blind `migrate` on shared DB.
- Always run plan first.
- Always have a rollback strategy before apply.
- Apply only explicitly reviewed migration targets.

## Preconditions

1. Dev stack is running (`start-dev.ps1 -Flag 2` or equivalent).
2. `sofortbot-services-dev` container is healthy.
3. Shared DB tunnel is active (`localhost:15434`).
4. Migration files are committed/reviewed locally (or at minimum frozen and agreed for apply window).

## Canonical commands (container runtime)

Run from project root (`F:\SofortBOT`):

```powershell
docker exec sofortbot-services-dev python manage.py check
docker exec sofortbot-services-dev python manage.py makemigrations --check --dry-run --noinput
docker exec sofortbot-services-dev python manage.py showmigrations
docker exec sofortbot-services-dev python manage.py migrate --plan
```

Automation helper:

```powershell
powershell -ExecutionPolicy Bypass -File tools/shared-db-migration-precheck.ps1
```

## Shared DB apply flow

1. Capture baseline:

```powershell
docker exec sofortbot-services-dev python manage.py showmigrations > /tmp/showmigrations_before.txt
docker exec sofortbot-services-dev python manage.py migrate --plan > /tmp/migrate_plan_before.txt
```

2. Confirm only intended migrations are pending.

For current state (2026-05-19) expected pending:
- `jv_services.0009_state_rename_xljv_models_to_jv`
- `jv_services.0010_alter_jvbatchjob_site_family`

3. Confirm backup point with DB owner/operator.

4. Apply in controlled window:

```powershell
docker exec sofortbot-services-dev python manage.py migrate jv_services 0010
```

Guarded apply helper (requires explicit confirmation switch):

```powershell
powershell -ExecutionPolicy Bypass -File tools/shared-db-migration-apply-jv-0009-0010.ps1 -ConfirmApply
```

The helper enforces:
- container is running;
- `makemigrations --check` is clean;
- expected pending migrations are present in plan;
- post-apply verification that `0009/0010` are no longer pending.

5. Re-verify after apply:

```powershell
docker exec sofortbot-services-dev python manage.py showmigrations
docker exec sofortbot-services-dev python manage.py migrate --plan
docker exec sofortbot-services-dev python manage.py makemigrations --check --dry-run --noinput
```

## Rollback notes

- Migration `0009` contains model/table rename operations; rollback must be evaluated against live usage.
- Migration `0010` alters field metadata (`site_family`) and should be rolled back only via explicit reverse migration command after impact check.
- If rollback is required, coordinate with DB owner and run targeted reverse migration (do not reset whole DB).

## Evidence to attach in PR/task

- `showmigrations` before/after
- `migrate --plan` before/after
- exact migration command used
- confirmation that no extra migrations were generated
