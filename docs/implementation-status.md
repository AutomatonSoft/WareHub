# Implementation status

## OTTO publication confirmation — 2026-10-08

### Implemented locally

- Accepted upserts return HTTP 202, retain an EAN mapping, and record a durable account/SKU submission instead of automatically asserting publication.
- Polling reads OTTO task results per SKU and separately checks ONLINE visibility. Rejections preserve error codes and JSON field paths; unknown responses and timeouts never imply success.
- A submission generation prevents late responses from overwriting newer submissions. Pending work resumes after restarts without reposting products.
- Sofort list shows pending, rejected, processed, online or unknown state. A rejected update does not erase previously confirmed visibility. Create Product and task history distinguish request completion from publication.

### Validation

- The additive migration and EAN/status transitions have been tested against a temporary, isolated PostgreSQL database.
- Frontend: 260 unit tests pass. Typecheck is blocked by the existing `clearOpenApiCacheForTests` export in the OpenAPI route. The existing `preferredSourceSiteKey` effect dependency lint warning remains.
- Orchestrator: 158 tests pass, with a dependency deprecation warning.
- Database-service: 60 focused tests pass, covering PostgreSQL persistence, rejection, ONLINE confirmation, retry generations, deactivation and EAN mapping isolation. A broader 181-test selection was interrupted because existing unrelated tests make slow external calls; it is not counted as passing.
- A read-only live check of the known rejected OTTO task timed out. Live end-to-end confirmation is still pending.
- Authenticated browser verification and actual submission of a new OTTO product have not been performed.

### Pending rollout / confirmation

- Obtain an actual accepted upsert response to confirm the external process-ID field. The external OpenAPI does not specify the response schema; a lone internal `task_id` remains explicitly unconfirmed.
- Apply OTTO migration `0005_ottopublication` through the approved server migration process, then deploy services/orchestrator/frontend together. No stage/prod changes have been made.
- Historical EAN flags require separately approved reconciliation. This patch does not silently alter existing production data.
- Run live JV/XL acceptance checks described in `runbooks/otto-publication-confirmation.md`.
