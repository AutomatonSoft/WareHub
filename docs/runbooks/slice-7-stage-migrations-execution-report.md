# Slice 7 - Stage Django migrations execution report

## Context

Slice 7 documents the controlled execution of Django migrations on the WareHub stage environment.

Before this slice, stage was deployed and running, but Django services reported unapplied migrations.

## Scope

- Stage server SSH alias: warehub-stage
- Stage path: /opt/warehub/stage
- Compose project: warehub-stage
- Stage domain: stagewarehub.automatonsoft.de
- Deployed image tag: stage-a1c2946
- Django runtime service: services
- Database service: postgres

## Preflight discovery

The backend container was checked first, but backend is not the Django runtime.

Backend command:

    Cmd=["/usr/local/bin/sofortbot-backend"]

The Django runtime was confirmed to be the services container.

The services command includes:

    python manage.py migrate
    python manage.py runserver 0.0.0.0:8000

## Initial migration audit

Before applying migrations:

- python manage.py check returned no issues.
- python manage.py showmigrations --plan showed unapplied migrations.
- python manage.py migrate --plan produced a valid plan without traceback.

Pending migration apps included admin, auth, catalog_core, contenttypes, database, hood_service, jv_services, kaufland, otto_service, sessions, and xl_services.

## Backup

A scoped PostgreSQL backup was created before changing the database schema.

Backup file:

    /opt/warehub/backups/stage/warehub-stage-before-migrate-20260609-123359.dump

Backup validation:

- pg_restore --list successfully read the dump.
- The restore list contained 60 lines.
- The dump database name was warehub_stage.

## First migrate attempt

The first controlled migration attempt was executed through the Django services container:

    python manage.py migrate

The migration began applying successfully and then failed on:

    catalog_core.0002_initial

Failure:

    relation "imported_products" already exists

At this point, the database was partially migrated. Containers remained running and python manage.py check continued to report no issues.

## Conflict audit

The failure was audited before corrective action.

catalog_core.0002_initial was found to create these legacy tables:

- imported_products
- imported_product_images
- imported_product_specials
- imported_product_categories
- imported_product_descriptions
- imported_product_stores

Read-only PostgreSQL audit confirmed that all six tables already existed in the public schema.

imported_products already had expected columns and constraints, including:

- primary key on id
- unique constraint uniq_imported_product_site_site_key_source_product_id
- unique constraint uniq_imported_product_site_site_key_ean

django_migrations contained catalog_core.0001_imported_product_open_cart_fields, but did not yet contain catalog_core.0002_initial.

Conclusion: catalog_core.0002_initial represented an already-existing legacy schema and needed to be marked as applied rather than physically executed.

## Targeted fake migration

The following targeted fake migration was executed:

    python manage.py migrate catalog_core 0002 --fake

Observed result:

    Applying catalog_core.0002_initial... FAKED

After this step, catalog_core showed both migrations as applied:

    [X] 0001_imported_product_open_cart_fields
    [X] 0002_initial

## Continue with fake-initial

After the targeted fake, the remaining migration plan began with database.0001_initial.

The remaining migrations were applied with:

    python manage.py migrate --fake-initial

Observed result:

- database migrations applied successfully through database.0021_kid_in_transit.
- hood_service migrations applied successfully.
- jv_services follow-up migrations applied successfully.
- kaufland migration applied successfully.
- otto_service migrations applied successfully.
- sessions migration applied successfully.
- xl_services migrations applied successfully.

Afterwards, python manage.py showmigrations --plan showed all migrations as applied.

## Post-migration checks

- python manage.py check returned no issues.
- No pending migrations remained.
- All containers stayed up.

## Targeted services recreate

The services container was recreated after migrations so the Django process would start cleanly with the migrated schema.

Command used:

    docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml up -d --no-deps --force-recreate services

Only services was recreated.

Post-recreate startup logs showed:

- RUN_MIGRATIONS_ON_STARTUP=false; skipping migrate on startup
- System check identified no issues
- No warning about 61 unapplied migrations
- Django started on 0.0.0.0:8000

## Final smoke results

Internal smoke:

- services /healthz returned 200 OK with status ok and service database_service.
- backend /healthz returned 200 OK with status ok, service sofortbot-backend, and environment stage.
- orchestrator /healthz returned 200 OK with status ok.
- frontend / redirected to /login.
- frontend /login returned 200 OK.

External smoke through nginx/domain:

- https://stagewarehub.automatonsoft.de/ returned 307 /login.
- https://stagewarehub.automatonsoft.de/login returned 200 OK.
- https://stagewarehub.automatonsoft.de/services returned 307 /login.
- https://stagewarehub.automatonsoft.de/orchestrator returned 307 /login.
- https://stagewarehub.automatonsoft.de/api returned 404, but not 502.

Container state after Slice 7:

- backend: Up
- frontend: Up
- mobile: Up
- orchestrator: Up and healthy
- postgres: Up and healthy
- services: Up after targeted recreate

## Explicit non-goals

Slice 7 intentionally did not perform:

- No full stack redeploy
- No docker compose pull
- No image tag change
- No nginx reload
- No certbot changes
- No secrets or variables changes
- No .env printing
- No postgres recreate
- No backend recreate
- No frontend recreate
- No mobile recreate
- No orchestrator recreate
- No unscoped Docker stop/remove/down operations
- No docker system prune

## Result

Slice 7 successfully closed the stage Django migration gap.

The stage environment now has:

- zero pending Django migrations
- clean Django system checks
- migrated services runtime
- healthy PostgreSQL
- healthy orchestrator
- working backend health endpoint
- working services health endpoint
- working frontend login page through nginx
- no nginx 502 responses observed during final smoke

Backup before migration remains available at:

    /opt/warehub/backups/stage/warehub-stage-before-migrate-20260609-123359.dump
