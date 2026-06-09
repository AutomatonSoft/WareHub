# Slice 6Y — Stage orchestrator healthcheck recreate report

## Context

Slice 6Y documents the controlled stage-side application of the already-merged Slice 6X orchestrator healthcheck fix.

Slice 6X replaced the orchestrator Docker healthcheck from a wget-based command to a Python urllib.request command because the orchestrator image is based on python:3.12-slim and wget is not installed.

## Scope

- Stage server SSH alias: warehub-stage
- Stage path: /opt/warehub/stage
- Compose project: warehub-stage
- Stage domain: stagewarehub.automatonsoft.de
- Current deployed image tag at the time: stage-a1c2946
- Target service: orchestrator

## Pre-change state

Before the server-side update, the orchestrator container was running but Docker reported it as unhealthy:

- Container: warehub-stage-orchestrator-1
- State: Up ... (unhealthy)

Root cause:

- The stage compose healthcheck still used wget.
- The orchestrator image does not include wget.
- The app itself was healthy on the internal /healthz endpoint.

Old healthcheck command:

```yaml
["CMD", "wget", "-qO-", "http://127.0.0.1:8011/healthz"]
```

## Compose upload

Uploaded the updated stage compose file:

```powershell
scp infra\deploy\stage\docker-compose.yml warehub-stage:/opt/warehub/stage/docker-compose.yml
```

Only the compose file was uploaded.

No .env file or secrets were printed, copied, or changed.

## Compose validation

Validated the compose configuration on the stage server with --quiet:

```bash
cd /opt/warehub/stage
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml config --quiet
```

Result:

- No output
- Validation completed successfully

The --quiet flag was used intentionally to avoid printing resolved environment variables or secrets.

## Controlled recreate

Only the orchestrator service was recreated:

```bash
cd /opt/warehub/stage
docker compose --project-name warehub-stage --env-file .env -f docker-compose.yml up -d --no-deps --force-recreate orchestrator
```

Important constraints followed:

- --no-deps was used
- Only orchestrator was targeted
- No full stack redeploy was performed
- No unrelated services were recreated

## Post-change state

After recreate, Docker reported the orchestrator as healthy:

- Container: warehub-stage-orchestrator-1
- State: Up ... (healthy)
- .State.Health.Status: healthy
- .State.Health.FailingStreak: 0

Active healthcheck command:

```yaml
["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8011/healthz', timeout=3).read()"]
```

## Internal smoke test

Internal orchestrator healthcheck returned HTTP 200:

```bash
curl -i http://127.0.0.1:8945/healthz
```

Observed result:

```text
HTTP/1.1 200 OK
{"status":"ok"}
```

This confirmed that the service itself was healthy through the published stage port.

## External smoke test

External stage route checks:

```powershell
curl.exe -I "https://stagewarehub.automatonsoft.de/orchestrator"
curl.exe -I "https://stagewarehub.automatonsoft.de/orchestrator/healthz"
```

Observed result:

- /orchestrator redirects to /login
- /orchestrator/healthz redirects to /login

This is acceptable because Docker healthcheck does not depend on the public nginx/auth path. Docker healthcheck uses the internal container endpoint:

```text
http://127.0.0.1:8011/healthz
```

## Services intentionally not recreated

The following services were not recreated during Slice 6Y:

- postgres
- backend
- frontend
- mobile
- services

Only orchestrator was recreated.

## Explicit non-goals

Slice 6Y intentionally did not perform:

- No migrations
- No database changes
- No nginx reload
- No certbot changes
- No secrets or variables changes
- No full stack redeploy
- No docker compose pull
- No recreate of postgres
- No recreate of backend
- No recreate of frontend
- No recreate of mobile
- No recreate of services
- No unscoped Docker stop/remove/down operations
- No docker system prune

## Result

Slice 6Y successfully applied the already-merged orchestrator healthcheck fix to the stage compose deployment.

The orchestrator Docker health status changed from unhealthy to healthy without touching migrations, database state, nginx, certbot, secrets, images, or unrelated services.
