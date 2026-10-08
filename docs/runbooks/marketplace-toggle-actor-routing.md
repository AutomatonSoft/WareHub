# Marketplace toggle actor routing

`/api/v1/orchestrator/marketplace/toggle-by-kid` must route through the frontend,
not directly to orchestrator. The frontend verifies the bearer token with
`/auth/me` and supplies the verified actor headers used by the job and audit log.
Job polling, health checks and other orchestrator routes remain direct.

## Validation

- Run `node --test infra/gateway/tests/gateway-contract.test.mjs` in the isolated
  local Docker test project.
- After an approved deployment, an unauthenticated POST with `{}` to the toggle
  URL must return `401` and `marketplace_toggle_authentication_required`, without
  creating a job. A `422` from orchestrator indicates the frontend guard is bypassed.
- For a separately approved real toggle, verify `actor_login` and `actor_name`
  in the job and corresponding `InventoryChangeLog` records.

## Rollback

Restore the previous immutable gateway image through the normal approved rollout.
No database migration or data rollback is required. Rolling back this fix can
reintroduce tasks without an actor; existing `Unknown user` history is not repaired.
