# Product Editor Architecture

Last updated: 2026-05-22
Status: Phase 7 complete for local code/docs readiness; browser UI manual smoke not verified

## Architectural intent

Product Editor is a control-plane workflow, not a direct mutation UI.

Release-readiness note:
- Verified implementation progress is `100 / 100` for local code/docs readiness after automated checks and local signoff capture.
- Browser UI manual smoke is `NOT VERIFIED`.
- Stage/prod readiness is `NOT VERIFIED` and deployment was not performed in this slice.
- Frontend Product Editor apply path is `Frontend -> Orchestrator` only.
- HOOD pending file upload is not implemented and is safe-rejected on apply, never silently uploaded.
- Remove image means remove from product payload only; FTP file stays untouched.
- `XL`, `OTTO`, `KAUFLAND`, and `EBAY` remain placeholder or read-only targets in MVP.

Target architecture:

`Frontend -> Orchestrator -> source/marketplace services`

The frontend must not directly call live mutation endpoints for:
- Hood PATCH
- JV update/apply
- XL update/apply
- Kaufland mutations
- future marketplace mutations

## High-level flow

1. Search EAN
2. Orchestrator discover
3. Orchestrator load
4. User edits active tab draft
5. Frontend calculates changed fields only
6. Orchestrator plan
7. User reviews plan and warnings
8. Orchestrator apply
9. Job/result tracking
10. Reconciliation

## Active tab apply rule

- Apply affects only the active tab.
- No global multi-marketplace apply in MVP.

Examples:
- Active tab `HOOD` -> update found Hood account only
- Active tab `JV` -> update all found JV sites
- Active tab `XL` -> later update all found XL sites, not in early MVP

## MVP delivery order

1. Hood fully through Orchestrator
2. JV fully through Orchestrator
3. XL placeholder/read-only
4. Otto planned/read-only
5. Kaufland planned/read-only
6. Ebay unsupported/planned

## Source and target model

### Account families

- `JV` = JVMOEBEL
- `XL` = XLMOEBEL

### Source sites in MVP scope

JV:
- `JV_DE`
- `JV_CH`
- `JV_AT`
- `JV_CO_UK`

XL:
- `XLMOEBEL_DE` as future baseline target
- other XL sites remain placeholder/read-only in early phases

### Explicit exclusions

- `JV_MAIN` is excluded from Product Editor completely
- frontend pseudo-values such as `ALL_SITES` and empty site keys are not valid targets

### Baseline rule

JV baseline priority:
1. `JV_DE`
2. `JV_CH`
3. `JV_AT`
4. `JV_CO_UK` manual only, never auto

XL baseline priority:
1. `XLMOEBEL_DE`

## Target registry model

Product Editor uses an orchestrator-owned registry model with:
- target id
- target group
- family
- source site vs marketplace account type
- planned/read-only/unsupported flags
- discover/load/plan/apply/job capabilities
- warnings and risk level

Phase 1/2 implementation files:
- `sofortbot-services/services/sb-sofort-orchestrator-service/src/sofort_orchestrator/domain/product_editor_models.py`
- `sofortbot-services/services/sb-sofort-orchestrator-service/src/sofort_orchestrator/domain/product_editor_registry.py`

Registry rules now enforced:
- `JV_MAIN` is absent
- `XL`, `OTTO`, `KAUFLAND`, and `EBAY` are marked planned/read-only
- `EBAY` is additionally marked unsupported
- `HOOD` and `JV` expose active capabilities for discover/load/plan/apply/job

## Hood phase architecture

Phase 2 adds a dedicated Product Editor Hood workflow inside orchestrator:

- `api/product_editor_routes.py`
  - thin route/controller layer
- `application/product_editor_service.py`
  - Product Editor orchestration logic for HOOD
- `infra/product_editor_gateway.py`
  - downstream `database_service` transport for HOOD read/update
- `infra/product_editor_store.py`
  - persistent sqlite storage for Product Editor plans/jobs

Current Hood flow:

1. `discover`
   - queries `HOOD_JV` and `HOOD_XL`
   - marks each target as `found`, `missing`, or `error`
2. `load`
   - resolves the found Hood target
   - returns normalized draft fields
3. `plan`
   - validates `changed_fields`
   - filters draft to mutable Hood payload only
   - stores persistent plan
   - returns warnings and risk level
4. `apply`
   - requires `plan_id`
   - creates persistent Product Editor job
   - sends live Hood PATCH only after explicit apply
   - keeps removed images out of payload without deleting FTP files
5. `jobs/{job_id}`
   - returns per-target result summary

## JV phase architecture

Phase 5 adds a dedicated Product Editor JV workflow inside orchestrator:

- `application/product_editor_jv_flow.py`
  - JV discover/load/plan/apply logic
- `infra/product_editor_gateway.py`
  - JV downstream discover/load/sync/batch apply transport
- `application/product_editor_service.py`
  - thin dispatcher between `HOOD` and `JV` active groups

Current JV flow:

1. `discover`
   - queries JV site presence for `JV_DE`, `JV_CH`, `JV_AT`, `JV_CO_UK`
   - excludes `JV_MAIN`
2. `load`
   - resolves baseline with priority `JV_DE -> JV_CH -> JV_AT`
   - never auto-promotes `JV_CO_UK`
   - fetches local product by EAN
   - falls back to `sync-by-ean` if local baseline row is missing
3. `plan`
   - validates changed fields against `XLJV` allowed field registry
   - scopes targets to all found JV sites in the active tab
   - adds UK translation warning when `JV_CO_UK` is in scope
4. `apply`
   - uses Product Editor plan id
   - calls Orchestrator facade only from frontend
   - delegates internally to JV batch apply
5. `jobs/{job_id}`
   - maps JV batch result into Product Editor job/result contract

## Frontend shell and Phase 4 review flow

Frontend Product Editor now uses a modular shell instead of the legacy direct-service orchestration page.

Current frontend modules:
- `components/product-editor/product-editor-shell.tsx`
- `components/product-editor/product-editor-target-matrix.tsx`
- `components/product-editor/product-editor-hood-panel.tsx`
- `components/product-editor/product-editor-plan-panel.tsx`
- `components/product-editor/product-editor-job-panel.tsx`
- `components/product-editor/product-editor-api.ts`

Current frontend orchestrator calls:
- `discover`
- `load`
- `plan`
- `apply`
- `jobs/{job_id}`

Phase 4 frontend behavior:
- `Review Changes` generates a fresh orchestrator plan for the active HOOD tab.
- `Apply` stays disabled until a plan exists and the user explicitly confirms the live update.
- Plan review shows:
  - exact target names
  - changed fields
  - removed images
  - pending local uploads
  - warnings
  - risk level
- Result tracking shows:
  - job id
  - job status
  - per-target success/failure
  - backend error code/message when present
- Job polling is allowed only through Product Editor orchestrator job endpoint, never through direct marketplace calls.

## Changed fields rule

- Only fields actually changed by the user may be sent to plan/apply.
- No hidden full-payload overwrite.
- If only `price` changed, only `price` is planned/applied.
- If only `description` changed, only `description` is planned/applied.

## Image rules

- Existing images must be visible in draft.
- User can remove image from product draft without deleting FTP file.
- User can add pending local files.
- File selection must not upload immediately.
- Upload happens only during reviewed apply flow if supported.
- FTP delete is out of MVP.
- Public URL vs source/internal path mismatch must be visible.

Current Hood Phase 2 safety:
- removing images updates only the outgoing `images` payload
- no FTP delete is attempted
- `pending_uploads` are explicitly rejected on apply until safe upload execution exists

Phase 4 frontend safety additions:
- selecting a file creates only local pending upload draft state
- `Review Changes` does not upload files
- `Apply` is explicit and visible, never hidden behind `Sync`
- stale plans are cleared when the draft changes

Phase 5 frontend additions:
- `JV` now has a real orchestrator-backed editor tab
- review/apply/result UX is shared between `HOOD` and `JV`
- active-tab apply rule is enforced for `JV` as well
- Product Editor frontend still does not call direct JV endpoints

Phase 6 frontend placeholder rules:
- `XL`, `OTTO`, `KAUFLAND`, and `EBAY` stay visible as first-class tabs
- placeholder tabs must render explicit read-only / planned / unsupported copy
- no review, plan, or apply controls are shown for placeholder tabs
- status matrix must remain readable for 35+ targets by showing group-level counts and per-target status without implying capability

## Safety rules

- No hidden live updates.
- No direct mutation endpoint calls from Product Editor frontend.
- No button named `Sync` may perform apply behind the scenes.
- No file upload on selection.
- No delete-from-FTP in MVP.
- Unsupported/planned targets are read-only and disabled.

## Orchestrator Product Editor facade

Current facade routes:

- `POST /api/v1/orchestrator/product-editor/discover`
- `POST /api/v1/orchestrator/product-editor/load`
- `POST /api/v1/orchestrator/product-editor/plan`
- `POST /api/v1/orchestrator/product-editor/apply`
- `GET /api/v1/orchestrator/product-editor/jobs/{job_id}`

Semantics:
- `discover`: returns registry-backed groups, targets, baseline recommendation, and live Hood status
- `load`: returns normalized Hood draft for the found target
- `plan`: persists plan and returns warnings/risk summary
- `apply`: enforces confirmation and plan-first execution
- `jobs/{job_id}`: returns persistent Product Editor job result

Implementation note:
- Product Editor jobs are currently persisted separately from generic orchestrator jobs.
- This avoids leaking Product Editor partial-patch semantics into the generic marketplace worker path.

## Frontend rules

- UI components should remain presentational where possible.
- Business logic should live in orchestrator/domain client and local state model, not inside giant React components.
- No giant all-in-one Product Editor component.
- No source/marketplace mutation knowledge embedded directly in view components.

## Backend rules

- Orchestrator is the control plane.
- Existing direct service endpoints may remain as downstream adapters only.
- Product Editor routes should not expose raw marketplace mutation topology to the frontend.

## Not in MVP

- `JV_MAIN`
- direct frontend mutation endpoint usage
- FTP delete
- full XL editing
- Otto editing
- Kaufland editing
- Ebay editing
- global apply across all marketplaces
