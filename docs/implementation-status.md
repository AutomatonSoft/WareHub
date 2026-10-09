# Implementation status

## OTTO external job lookup in Task statuses — 2026-10-09

- History and recent results display each OTTO JV/XL external `job_id` (or legacy `marketplace_job_id`) as a button, independently of WareHub's internal job/task IDs. Results without an external ID do not invent one.
- Each button also shows the KID and submitted EAN from its account-specific saved mapping, plus the upstream submitted SKU(s). Missing historical identity displays a dash, never a substituted source EAN or an assumption that SKU equals EAN. These identifiers do not assert online publication.
- Clicking requests a session-protected services endpoint, which uses the existing timeout-bound OTTO client to call `GET /extermal/job_status/{job_id}?controller=jv|xl`. The UI shows state, counters, messages and rejection details including supplied error codes/field paths; request failures remain errors. Processing completion is explicitly not represented as online publication.
- Validation: 23 OTTO publication/service tests pass, including account routing, rejection details, unauthenticated/invalid-controller rejection and upstream errors. Frontend extraction/client regressions pass; changed-file ESLint and diff checks pass. Typecheck remains blocked by the existing OpenAPI route export. Authenticated browser and live external API verification remain pending; no deployment performed.

## OTTO Create Product identity — 2026-10-09

- Follow-up: automatic attribute/category updates could save a draft before EAN reservation completed, incorrectly blocking initial reserved identity population. Reservation now updates SKU/EAN independently of other dirty fields, unless the user manually edited SKU/EAN. That identity-edit marker persists across tab remounts, including explicitly cleared fields. A regression covers late reservation, other edits and manual identity preservation.
- JV/XL reserve identities now initialize new drafts only. Saved drafts and manual SKU/EAN edits are not overwritten on tab changes or by late reservation responses; the form warns when its identity differs from the reserve.
- Publication submits the current SKU/EAN fields and rejects an empty SKU. OTTO channels use the submitted root EAN rather than pool substitution, so the existing mapping path receives the submitted EAN. Other marketplaces retain their allocation behavior.
- Validation: 263 frontend tests pass, including regressions for JV/XL edited identities, empty SKU rejection and OTTO channel allocation isolation. Changed-file ESLint reports zero errors and one reservation-effect dependency warning; diff check passes. Typecheck remains blocked by the existing OpenAPI route export `clearOpenApiCacheForTests`.
- Authenticated browser verification and live OTTO publication/mapping confirmation remain pending. No deployment or repair of existing listings/mappings was performed.

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
