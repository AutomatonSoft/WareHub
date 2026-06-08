# SECRET_ROTATION_PLAN

This plan describes how to rotate secrets used by `sofortbot-infra` safely.

## 1. Scope

Rotate any secret that is exposed, suspected exposed, shared in chat/logs, or older than policy threshold.

Primary scope:

- Postgres credentials (`*_POSTGRES_PASSWORD`)
- FTP credentials (`BACKEND_UPLOAD_FTP_*`)
- Afterbuy credentials (`AFTERBUY_*`)
- Sentry DSNs/tokens
- CI runner and deploy tokens

## 2. Rotation Workflow

1. Prepare new secret value in secure store.
2. Update stage `.env` first.
3. Deploy stage and validate health.
4. Update production `.env`.
5. Deploy production in approved window.
6. Revoke old secret.
7. Record rotation event (date, owner, scope).

## 3. Safety Rules

- Never rotate production secrets without rollback window.
- Never commit secrets to git.
- Never print secret values in terminal logs.
- For DB password changes, ensure app and DB are switched atomically.

## 4. Emergency Revoke

If leak is confirmed:

1. Disable impacted credentials immediately.
2. Replace with temporary emergency credentials.
3. Redeploy affected services.
4. Audit access logs and incident timeline.
5. Complete full post-incident rotation.

## 5. Validation After Rotation

- `docker compose -f deploy/stage/docker-compose.yml --env-file .env ps`
- `docker compose -f deploy/prod/docker-compose.yml --env-file .env ps`
- Health endpoints respond (`/healthz`, `/readyz`) where applicable.
- No authentication errors in service logs.

## 6. Rotation Cadence (Minimum)

- High-risk credentials: every 30-90 days
- Standard service credentials: every 90-180 days
- Immediate rotation on incident or team offboarding
