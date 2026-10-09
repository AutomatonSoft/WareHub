# Implementation status

## Architecture refactor (`new_refactor`) — 2026-10-08

- First slice implemented locally: all marketplace EAN confirmations reject ambiguous KID numbers; explicit `kid_id` and unique legacy matches remain supported.
- Archive restoration distinguishes actual PostgreSQL place conflicts from unrelated integrity errors. Place conflicts retain the field error and include the occupying KID/archive state; other failures use a safe separate error code.
- Validation: 33 focused database-service tests pass on an isolated temporary PostgreSQL; Python compile and diff checks pass. No production database or server migration was run.
- Second slice implemented locally: single/batch queued-job endpoints persist jobs, creation events and replay responses in one SQLite transaction. Concurrent connections/processes reuse one set of job IDs; interrupted batches roll back completely. Legacy replay responses and existing header/body semantics remain supported.
- Second-slice validation: all 166 orchestrator tests pass, including concurrency, rollback, restart, expiration, legacy-cache compatibility and migration readiness. One existing Starlette/httpx deprecation warning remains.
- An explicit additive SQLite migration is required before routing traffic to this version. No automatic startup migration was added. Cutover, smoke checks and rollback constraints: `runbooks/orchestrator-atomic-job-replays.md`. No server migration or deployment was performed.
- Third local slice (part of step 4): the common OTTO JV/XL upsert validates category HIGH attributes, exact allowed values and explicit single-value constraints before external publication. Structured errors include item/field paths; unavailable taxonomy fails safely with 503. Valid payloads remain unchanged and publication remains pending after acceptance.
- Third-slice validation: 67 focused OTTO tests pass with mocked persistence/external APIs; Django system checks pass. No live marketplace or authenticated browser verification was performed. Partial updates without category and numeric/unit validation remain outside this slice.
- Fourth local slice: the shared OTTO panel used by Create Product and Product Editor displays server validation errors next to the named attribute, including the Grundfarbe selector. Summary links focus the field or fall back to the attributes section if it is absent. Draft values remain unchanged; error identity does not depend on attribute order.
- Fourth-slice validation: all 264 frontend unit tests, changed-file ESLint, ten focused backend tests and diff-check pass. Typecheck still fails on the existing OpenAPI route export `clearOpenApiCacheForTests`. Local frontend was not running, so browser/focus verification remains pending; no stage/prod changes were made.
- Fifth local slice: OTTO enumerated single-value fields use taxonomy-driven selects in the shared Create Product/Product Editor panel. Existing invalid values stay visible; multi-value and free-text fields keep their current controls. Grundfarbe retains its fallback list only when taxonomy choices are unavailable.
- Fifth-slice serialization fix: editor values containing commas are no longer split automatically; unchanged source arrays are preserved. Create Product preserves cleared attribute overrides instead of silently restoring old values. Manual multi-value editing needs a dedicated control and is not implemented here.
- Fifth-slice validation: all 266 frontend tests, changed-file ESLint and diff-check pass. Typecheck remains blocked by the existing OpenAPI export error; no additional TypeScript errors were reported. Browser validation and deployment remain pending.
- Sixth local slice: browser QA exposed a React cross-component update warning caused by parent callbacks inside OTTO state updater functions. Automatic draft preparation is now a pure model operation; parent notification happens outside the updater. Loaded taxonomy is keyed by account/category, and changing draft identity clears the local dirty marker without leaking the previous draft.
- Sixth-slice validation: all 267 frontend unit tests and changed-file ESLint pass. Chromium checks of the actual shared OTTO component with mocked auth/taxonomy/errors pass for JV and XL: choices, invalid source retention, inline error associations, summary-to-field focus, independent error clearing, comma payloads, manual edits and same-mounted-component draft-key changes. No console errors occurred in the post-fix checks; screenshots were inspected. The temporary local QA page is removed. These checks do not replace authenticated full-page/live-publication acceptance; stage/prod remain unchanged.
- Remaining slices, acceptance checks and rollback boundaries: `architecture/refactor-plan.md`. Synchronous/toggle/editor idempotency, durable external-operation delivery, server validation, database-side pagination, unified states, placement schema and frontend decomposition remain pending.
- Authenticated browser verification and deployment are pending. No changes have been committed or pushed by the agent.

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
