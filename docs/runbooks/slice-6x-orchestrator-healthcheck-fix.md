# Slice 6X - Orchestrator Docker Healthcheck Fix

## 1. Scope

- Goal: fix the orchestrator Docker healthcheck for stage and prod compose definitions.
- Repository root: `I:\WareHub`
- This slice updates compose healthcheck definitions only.
- This slice does not deploy anything.

## 2. Root Cause

- The first stage deploy showed `warehub-stage-orchestrator-1` as Docker `unhealthy`.
- The orchestrator application itself responded successfully on `/healthz`.
- Docker healthcheck failed because it used `wget`.
- The orchestrator image is based on `python:3.12-slim`.
- `wget` is not installed in the image.

## 3. Fix

The orchestrator healthcheck was changed from:

```yaml
test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8011/healthz"]
```

to:

```yaml
test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8011/healthz', timeout=3).read()"]
```

## 4. Files Changed

- `infra/deploy/stage/docker-compose.yml`
- `infra/deploy/prod/docker-compose.yml`

## 5. Why Stage And Prod Were Both Updated

- Both stage and prod compose files had the same broken `wget` healthcheck.
- Fixing both prevents the same issue from being promoted to prod later.
- No prod deployment was performed.

## 6. Expected Result After Redeploy/Recreate

- Orchestrator container healthcheck should use Python, which is already available in the image.
- `/healthz` should return `200 OK`.
- Docker health should become `healthy` if the app continues responding on `/healthz`.

## 7. Important Runtime Note

- Existing running stage containers will not automatically pick up this compose healthcheck change.
- Stage must be recreated or redeployed later for the new healthcheck definition to apply.
- This slice only changes repository compose definitions.

## 8. Explicit Non-Goals

- no deploy
- no container recreate
- no `docker compose up`
- no `docker compose pull`
- no migrations
- no nginx reload
- no certbot changes
- no GitHub Secrets changes
- no GitHub Variables changes
- no Dockerfile changes
- no source changes
