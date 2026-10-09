# Incremental architecture refactor

Branch: `new_refactor`. Started: 2026-10-08. Implementation owner: Ravil under the current single-developer override.

## Safety boundaries

- No deployment, GHCR publication, server migrations, production writes or automatic data backfills are included.
- Keep API success shapes compatible. Add structured error codes without removing existing field errors.
- Preserve the single-match legacy KID lookup; reject ambiguous identities rather than selecting an arbitrary row.
- Deliver independent, tested slices. Do not combine schema changes, data conversion and UI restructuring in one release.
- Server migrations and rollout require separate approval, backups and a rollback plan.

## Sequence and acceptance checks

### 1. Error diagnostics and KID identity — implemented locally

- EAN confirmation rejects ambiguous KID numbers for every supported mapping channel. Explicit matching `kid_id` continues to work.
- Archive restoration identifies the PostgreSQL place uniqueness constraint specifically. Occupied-place errors include the conflicting KID and archive state while retaining the existing `place` error array.
- Other integrity failures return `inventory_archive_save_failed`, not a false occupied-place message. Database details are not exposed to users.
- Validation: 33 focused tests pass against temporary PostgreSQL, including real place-conflict rollback, cross-channel identity checks and OTTO publication regressions. Compile and diff checks pass.
- Remaining: authenticated UI verification; trace all legacy mutation callers and propagate explicit KID IDs where needed. This slice does not claim all mutation APIs have been converted.
- Rollback: revert this slice. No schema change or data conversion is required; rollback restores the old ambiguous-mapping and misleading-error risks.

### 2. Atomic job idempotency — implemented locally for queued single/batch endpoints

Reserve the replay key and persist queued jobs in one database transaction. Cover single and batch enqueue paths; retain existing body/key semantics. Do not replace SQLite merely to implement this invariant.

Acceptance: simultaneous requests across independent connections produce one set of jobs; failure between job creation and response recording leaves no duplicate enqueue window; restart and replay return the same job IDs. Audit synchronous execution separately because external effects cannot be rolled back with the local transaction.

- `/orchestrator/jobs` and `/orchestrator/jobs/batch` now persist jobs, creation events and the replay response in the same SQLite transaction. The existing header/body hash semantics and response shapes remain unchanged; unexpired legacy cached responses are still read.
- Tests cover independent connections and spawned processes, partial-batch rollback, restart, expiration, legacy replay and readiness before/after migration.
- Explicit additive SQLite migration is required; no replay table is created automatically on startup. See `../runbooks/orchestrator-atomic-job-replays.md` for coordinated cutover and rollback constraints.
- Remaining: synchronous updates and marketplace-toggle/product-editor-specific enqueue paths. Atomic local enqueue does not guarantee exactly-once external publication. Intake rate-limit accounting is unchanged and concurrent retries can still consume slots before discovering a committed replay.

### 3. Durable external operations and intake synchronization — pending

Persist an operation intent before an external write, record the external job identity and reconcile uncertain outcomes. Replace fire-and-forget Rust-to-Django synchronization with a durable delivery record and bounded retries. Keep network calls outside database transactions.

Acceptance: crashes before/after an external response are recoverable without blindly creating a second listing. Verify downstream idempotency before enabling automatic retries of writes.

### 4. Server-authoritative publication validation — partially implemented locally for OTTO

Start with OTTO: share category/allowed-value and required-attribute validation between Create Product and Product Editor through the server. Retain UI hints, but do not rely on them as the enforcement boundary. Return structured errors with field paths.

Acceptance: the same invalid payload fails from both UI flows and from a direct API call before publication; existing valid payloads remain accepted. Taxonomy unavailability must be explicit, not interpreted as no mandatory attributes.

- The common JV/XL upsert endpoint validates requests containing `productDescription.category` against the existing Mongo taxonomy cache before external writes. Exact unique category-name lookup avoids selecting an arbitrary category.
- HIGH attributes are mandatory. Provided known attributes must use exact allowed values and honor explicit single-value constraints. Empty/malformed values and duplicate attribute names are rejected with item/field paths. Values are not silently rewritten.
- Missing, ambiguous or malformed cached taxonomy produces safe HTTP 503 `otto_taxonomy_unavailable`; invalid attributes produce HTTP 400 `otto_attributes_invalid` with structured `errors`. No automatic taxonomy fetch or write retry was added to publication.
- Validation: 67 focused OTTO tests pass, including both profiles, safe taxonomy failure, unchanged accepted payload/pending response and regression coverage for external contracts, suggestions and publication tracking. These tests mock persistence/external APIs; they are not live marketplace confirmation.
- Shared frontend error parsing now retains OTTO attribute names instead of mapping their array paths to the description field. The common Create Product/Product Editor OTTO panel connects inputs and the Grundfarbe selector to inline errors and accessible field links. When an attribute is not rendered, the error link falls back to the attributes section; it does not invent a new value or reset the draft.
- Frontend validation: all 264 unit tests and changed-file ESLint pass. Typecheck remains blocked by the existing OpenAPI route export `clearOpenApiCacheForTests`; no additional TypeScript errors were reported. Ten focused backend validation tests pass after adding attribute identity metadata.
- Follow-up UI slice: category attributes with enumerated single values use the existing accessible select control in both forms. Taxonomy choices take precedence over the Grundfarbe fallback; invalid source values remain visible until explicitly corrected. Multi-value/free-text fields retain text controls.
- Shared UI serialization treats an edited text/select value as one value, preserving commas in prose, decimals and enum labels. Unchanged source arrays remain arrays. Clearing a source field no longer silently restores its original value in the Create Product payload. Product Editor no longer treats commas as an implicit multi-value editor; a dedicated multi-value control is still pending.
- Follow-up validation: all 266 frontend tests and changed-file ESLint pass. Typecheck reports only the existing OpenAPI export error. These are local checks, not authenticated browser or live-publication confirmation.
- Remaining: partial updates without category retain existing behavior and bypass category checks; resolving their current category/attributes requires a separate merge/read contract. Numeric types, units and conditional requirements are not enforced by this slice. Unknown custom attribute names remain accepted. Authenticated Create Product/Product Editor smoke checks, cache-readiness verification on stage and deployment remain pending; unit tests do not prove browser rendering/focus behavior.
- Rollback: revert this validation slice; no schema migration is required. Invalid attributes will again reach upstream OTTO validation. Durable delivery (step 3) remains pending; this independent preflight slice does not solve external-write crash recovery.

### 5. Inventory filtering and pagination — pending

Apply supported filters and pagination before loading associated orders and marketplace data. Keep the existing complex search path until equivalence is demonstrated. Preserve archive semantics, sorting, counts and page stability.

Acceptance: old/new results match on fixtures including multiple orders, duplicate KID numbers, archived records and missing EANs. Measure query count, memory and latency; do not claim a speedup without measurement.

### 6. Marketplace publication state — pending beyond existing OTTO tracking

Separate identifier mapping, operation outcome and last confirmed external visibility. Introduce additional state alongside existing boolean fields, one marketplace at a time. Do not infer ONLINE from a successful request alone.

Acceptance: pending, rejected, unknown and confirmed states remain distinguishable; failed edits preserve previously confirmed visibility. Historical backfill requires separate review.

### 7. Archive and placement model — pending

Define current warehouse place separately from historical place and archive lifecycle. Inspect existing data first. Introduce compatible fields, explicit backfill and dual-read/write transition before changing uniqueness rules.

Acceptance: archived historical places cannot accidentally reserve active space; restoration requires a new positive place and retains the previous place in the audit. Do not silently free or delete conflicting records.

### 8. Frontend decomposition — pending

Extract source loading, draft state and per-marketplace submit flows from Create Product and Product Editor one at a time. First move code without changing behavior; move business rules to the server in separate slices.

Acceptance: draft edits survive tab switches, late load responses and revisits; image ordering and per-site categories/delivery remain stable. Include authenticated browser checks, not only unit tests.

- Initial OTTO UI-state slice implemented locally: shared pure draft preparation replaces parent notifications inside React updater callbacks. Account/category-keyed taxonomy prevents a previous selection's attribute list from being used while the next load is pending. Local dirty state resets when draft identity changes.
- Validation: 267 frontend unit tests and changed-file ESLint pass. Local Chromium component checks with mocked APIs pass for JV and XL, including errors/focus, choices, comma values, manual edits and draft-key changes without remount. The observed pre-fix cross-component React warning is absent after the fix. Temporary QA route removed; inspected screenshots: `/tmp/warehub-otto-jv-qa.png`, `/tmp/warehub-otto-xl-qa.png` (local ephemeral artifacts).
- Remaining: authenticated full-page Create Product/Product Editor flows, late-response/tab-cache regression checks, other marketplace decomposition and live integration acceptance. This is not a claim that all frontend draft state is refactored.

## Rollout gate

Each slice needs focused tests, relevant broader regression checks, documented limitations and a staged smoke check before production approval. There is no zero-regression guarantee and no blanket approval to deploy this branch.
