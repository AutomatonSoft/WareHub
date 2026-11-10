# Marketplace toggle actor routing

`/api/v1/orchestrator/marketplace/toggle-by-kid` must route through the frontend,
not directly to orchestrator. The frontend verifies the bearer token with
`/auth/me` and supplies the verified actor headers used by the job and audit log.
Create Product submissions must also pass through frontend actor verification:

- `/api/v1/orchestrator/jobs` and `/api/v1/orchestrator/jobs/batch`;
- `/api/v1/orchestrator/products/{ean}/update`;
- trailing-slash variants of these paths.

The Create Product orchestrator client uses the existing `authorizedFetch` flow,
including token refresh, and retains the request ID header. Never trust actor
names supplied by the browser; the frontend resolves the actor from `/auth/me`.
The frontend also preserves `Idempotency-Key` when forwarding submissions.

The job-list GET shares the frontend route. Individual job polling, job events,
attempts, health checks and other orchestrator routes remain direct.

## Validation

- Run `node --test infra/gateway/tests/gateway-contract.test.mjs` in the isolated
  local Docker test project.
- After an approved deployment, an unauthenticated POST with `{}` to the toggle
  URL must return `401` and `marketplace_toggle_authentication_required`, without
  creating a job. A `422` from orchestrator indicates the frontend guard is bypassed.
- For a separately approved real toggle, verify `actor_login` and `actor_name`
  in the job and corresponding `InventoryChangeLog` records.
- Unauthenticated POSTs with `{}` to the Create Product routes above must return
  `401`, not an orchestrator `422`, without creating jobs. After a separately
  approved real submission, compare the verified user with the stored command's
  `actor_login` / `actor_name` and the matching audit entry's `request_id`.
- Deploy the gateway and frontend changes together using the approved rollout.

## Rollback

Restore the previous immutable gateway image through the normal approved rollout.
No database migration or data rollback is required. Rolling back this fix can
reintroduce tasks without an actor; existing `Unknown user` history is not repaired.
