# SECURITY_BASELINE

This document defines minimum security controls for `sofortbot-infra` environments.

## 1. Secrets Handling

- Runtime secrets MUST be stored only in server-side `.env` files or secret managers.
- `.env.example` MUST contain placeholders only.
- Real credentials, tokens, DSNs, and passwords MUST NOT be committed.
- Secret values in logs or error output are prohibited.

## 2. Network Exposure

- Postgres ports in stage/prod MUST be bound to localhost only (`127.0.0.1`).
- Public traffic MUST enter through reverse proxy only.
- Internal services SHOULD not publish ports publicly unless explicitly required.

## 3. Access Control

- Deployment hosts MUST use least-privilege accounts.
- SSH access MUST be restricted by key-based auth and IP allowlists.
- CI deploy tokens MUST be scoped and rotated on schedule.

## 4. Supply Chain

- Images MUST be pinned by explicit tags for production.
- Deploys SHOULD verify image origin and expected registry path.
- Unknown/untrusted images MUST NOT be deployed.

## 5. Logging and Incident Readiness

- Deploy logs MUST be retained for audit and rollback analysis.
- Security-relevant events (failed auth, secret rotation, deploy failures) SHOULD be traceable.
- Incident response contacts and rollback commands MUST be documented.

## 6. Verification Checklist

Before release:

- `docker compose -f deploy/stage/docker-compose.yml config`
- `docker compose -f deploy/prod/docker-compose.yml config`
- Confirm `.env.example` has no real secrets.
- Confirm Postgres ports are localhost-bound in stage/prod compose.
