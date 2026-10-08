# Implementation status

## OTTO category attribute form — 2026-10-08

- The supplied `categories.json` links categories to groups; `attributes_by_group.json` contains attribute relevance. The user explicitly confirmed that HIGH means mandatory for this OTTO integration.
- Create Product retains relevance from the existing category-attributes API and automatically adds HIGH-relevance fields alongside existing account defaults for JV and XL. Mandatory fields are marked with an asterisk, including matching source attributes; source values, manual edits and removals remain intact. Empty placeholders are excluded from publication payloads.
- The supplied snapshots were inspected, not imported into MongoDB or bundled. Runtime taxonomy continues to use the existing category cache/API.
- Validation: 8 focused model tests and 261 frontend tests pass; changed-file ESLint and diff checks pass. Typecheck remains blocked by the existing OpenAPI route export `clearOpenApiCacheForTests`.
- Blocking submission of empty mandatory fields is not implemented in this form change. Authenticated browser verification, deployment and live OTTO confirmation remain pending.

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

- The user supplied the accepted-response contract: `job_id` / `marketplace_job_id` identify the OTTO process, unlike internal `task_id`. The adapter now polls `/extermal/job_status/{job_id}` and consumes SKU-matched aggregated failures/succeeded items, retaining independent ONLINE confirmation. All 20 publication unit tests pass after this update; compile and diff checks pass. A live check of the updated external service is still pending.
- Apply OTTO migration `0005_ottopublication` through the approved server migration process, then deploy services/orchestrator/frontend together. No stage/prod changes have been made.
- Historical EAN flags require separately approved reconciliation. This patch does not silently alter existing production data.
- Run live JV/XL acceptance checks described in `runbooks/otto-publication-confirmation.md`.
