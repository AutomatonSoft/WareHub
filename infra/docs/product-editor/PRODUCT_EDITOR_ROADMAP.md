# Product Editor Roadmap

Status: Phase 7 done
Last updated: 2026-05-22

## Product goal

Build a production-grade Product Editor as a controlled workflow:

`Frontend -> Orchestrator -> source/marketplace services`

This is not a cosmetic UI refactor. It is a new safe control-plane workflow with:
- no direct frontend marketplace mutation calls
- no hidden live updates
- no hidden sync-to-apply behavior
- explicit draft -> plan -> review -> apply -> job tracking

## Fixed product decisions

- Product Editor works with one EAN at a time in MVP.
- Linked JV/XL EAN handling is out of MVP.
- Apply always affects only the active tab.
- Hood is MVP-first and must go through Orchestrator.
- JV is second and must go through Orchestrator.
- XL is placeholder/read-only in early rollout.
- Otto/Kaufland/Ebay are planned/read-only in MVP.
- `JV_MAIN` is excluded from Product Editor completely.
- `JV_CO_UK` is never auto-baseline.
- Changed fields only must be sent on plan/apply.
- Image upload must not happen on file selection.
- Remove image means remove from product draft, not delete from FTP.
- FTP delete is out of MVP.

## Non-MVP

- `JV_MAIN`
- direct frontend mutation endpoints
- FTP delete
- full XL editing
- Otto editing
- Kaufland editing
- Ebay editing
- global apply across all marketplaces
- linked JV/XL EAN editing

## Progress system

- Overall roadmap progress is weighted and totals 100%.
- Phase progress increases only when that phase acceptance criteria pass.
- If tests are not run, phase cannot be called fully complete unless the phase is docs-only.
- If implementation is incomplete, status must be `PARTIAL`.
- If blocked by missing dependency or unsafe repo state, status must be `BLOCKED`.
- Percentages must never be inflated.

## Phase weights

| Phase | Name | Weight |
| --- | --- | ---: |
| 0 | Documentation / roadmap / context lock | 5% |
| 1 | Orchestrator Product Editor API foundation | 15% |
| 2 | Hood through Orchestrator | 20% |
| 3 | Product Editor frontend shell + Hood tab | 20% |
| 4 | Review / Plan / Apply / Job UX | 15% |
| 5 | JV through Orchestrator | 15% |
| 6 | XL / Otto / Kaufland / Ebay placeholders and cleanup | 5% |
| 7 | Tests / docs / release readiness | 5% |

## Phase status summary

- Phase 0: DONE
- Phase 1: DONE
- Phase 2: DONE
- Phase 3: DONE
- Phase 4: DONE
- Phase 5: DONE
- Phase 6: DONE
- Phase 7: DONE

## Phase 0 - Context lock and roadmap docs - 5%

Tasks:
- [x] Create `docs/PRODUCT_EDITOR_ROADMAP.md`
- [x] Create `docs/PRODUCT_EDITOR_PROGRESS.md`
- [x] Create `docs/PRODUCT_EDITOR_ARCHITECTURE.md`
- [x] Document all fixed product decisions
- [x] Document non-MVP items
- [x] Document progress system and percentages

Acceptance:
- [x] Docs created
- [x] No runtime code behavior changed
- [x] User can read roadmap and understand next steps

## Phase 1 - Orchestrator Product Editor API foundation - 15%

Tasks:
- [x] Inspect current orchestrator route structure
- [x] Add Product Editor route module
- [x] Add schemas/models for discover/load/plan/apply/job
- [x] Add orchestrator target registry
- [x] Exclude `JV_MAIN`
- [x] Mark XL/Otto/Kaufland/Ebay planned/read-only initially
- [x] Implement endpoint skeletons
- [x] Add stable error responses
- [x] Add tests for schemas/routes if framework exists

Acceptance:
- [x] Orchestrator starts
- [x] `/healthz` still works
- [x] Product Editor endpoints exist
- [x] Discover endpoint returns groups/tabs
- [x] No frontend direct mutation introduced
- [x] Tests pass or are skipped with reason

## Phase 2 - Hood through Orchestrator - 20%

Tasks:
- [x] Add Hood adapter in Product Editor orchestrator flow
- [x] Discover Hood JV/XL by EAN via orchestrator facade
- [x] Load normalized Hood form via orchestrator
- [x] Implement Hood plan with changed-fields only
- [x] Implement Hood apply with plan-first rule
- [x] Keep FTP files when images are removed from product
- [x] Implement Hood job status
- [x] Add tests for discover/load/plan/apply/job
- [x] Handle pending uploads safely: reject them on apply until apply-time upload support exists

Acceptance:
- [x] Frontend can discover Hood via Orchestrator
- [x] Hood load returns normalized form
- [x] Plan returns only found Hood target
- [x] Apply does not run without plan
- [x] Upload does not happen at file select
- [x] Removed images are removed from payload, not FTP
- [x] Job status shows success/failure per Hood target

## Phase 3 - Product Editor frontend shell + Hood tab - 20%

Tasks:
- [x] Refactor `/product-editor` to premium SaaS shell
- [x] Add Product Editor orchestrator-only frontend API client
- [x] Add shell, tabs, target matrix, target cards
- [x] Add Hood editor panel
- [x] Add frontend draft state for Hood
- [x] Add changed-fields detection
- [x] Add safe image editor for Hood
- [x] Add planned/read-only tabs for remaining groups
- [x] Remove misleading fake pending states
- [x] Remove direct mutation endpoint usage from Product Editor

Acceptance:
- [x] Search goes through Orchestrator
- [x] Tabs visible
- [x] Hood tab usable
- [x] Planned tabs clearly disabled/read-only
- [x] Files are not uploaded on file selection
- [x] Changed fields visible
- [x] No direct Hood/JV/XL mutation calls from Product Editor

Implementation notes:
- `/product-editor` now renders a new modular shell instead of the legacy orchestration page.
- Product Editor frontend now calls only orchestrator facade routes for discover/load.
- HOOD has its own draft panel with changed-field visibility and local-only pending upload queue.
- `JV`, `XL`, `OTTO`, `KAUFLAND`, and `EBAY` are visible as truthful placeholders or read-only tabs.
- Legacy `HoodSearchPanel` and direct `fetchHoodByEan` usage are removed from Product Editor runtime.

## Phase 4 - Review / Plan / Apply / Job UX - 15%

Tasks:
- [x] Add Review Changes action
- [x] Add plan review panel/table/warnings
- [x] Add apply confirmation step
- [x] Add apply result panel
- [x] Add job status refresh/polling
- [x] Show exact target names and image changes
- [x] Apply only active tab
- [x] Disable apply until plan exists

Acceptance:
- [x] User cannot apply without review/plan
- [x] Apply only active tab
- [x] Hood apply goes through Orchestrator
- [x] Result panel shows success/failure
- [x] No hidden sync/apply semantics

Implementation notes:
- Product Editor frontend now calls orchestrator facade routes for `plan`, `apply`, and `jobs/{job_id}` in addition to `discover` and `load`.
- A dedicated review panel shows changed fields, exact HOOD target scope, warnings, removed images, and pending local uploads before apply.
- Apply requires a generated plan and explicit user confirmation.
- Result tracking is rendered as a Product Editor job panel and can refresh or auto-poll while a job is non-terminal.

## Phase 5 - JV through Orchestrator - 15%

Tasks:
- [x] Implement JV discover for `JV_DE`, `JV_CH`, `JV_AT`, `JV_CO_UK`
- [x] Exclude `JV_MAIN`
- [x] Implement baseline priority
- [x] Implement normalized JV load
- [x] Implement JV plan for all found JV sites
- [x] Include UK translation warning/action
- [x] Implement JV apply through Orchestrator
- [x] Add JV job/result mapping
- [x] Add frontend JV tab real form

Acceptance:
- [x] JV tab discovers all 4 sites
- [x] `JV_MAIN` absent
- [x] Baseline auto-selection correct
- [x] All found JV sites selected by default
- [x] Changed fields only
- [x] `JV_CO_UK` included and marked for translation
- [x] Apply goes through Orchestrator only

Implementation notes:
- Orchestrator Product Editor facade now supports `JV` for `discover`, `load`, `plan`, `apply`, and `jobs/{job_id}`.
- JV baseline priority is enforced as `JV_DE -> JV_CH -> JV_AT`, while `JV_CO_UK` stays manual-only for auto-baseline decisions.
- JV apply goes through Orchestrator and delegates internally to JV batch apply, never from frontend directly.
- Frontend now renders a real `JV` tab with orchestrator-loaded draft, changed-field detection, review, apply, and job result flow.

## Phase 6 - XL / Otto / Kaufland / Ebay placeholders and cleanup - 5%

Tasks:
- [x] XL tab visible as placeholder/read-only
- [x] XL matrix visible if low cost
- [x] Otto planned/read-only
- [x] Kaufland planned/read-only
- [x] Ebay unsupported/planned
- [x] Explanatory copy added
- [x] Disabled actions impossible

Acceptance:
- [x] User understands supported vs planned
- [x] Unsupported target cannot be applied
- [x] UI scales to 35+ targets

Implementation notes:
- Placeholder tabs now render explicit non-actionable rollout copy instead of vague empty states.
- XL, OTTO, KAUFLAND, and EBAY each show why editing/apply is unavailable in the current phase.
- Status matrix now shows `found / total` counts per group to keep 35+ targets readable without implying support.

## Phase 7 - Tests / docs / release readiness - 5%

Tasks:
- [x] Run frontend typecheck
- [x] Run frontend tests
- [x] Run orchestrator tests
- [x] Run relevant backend checks
- [x] Update docs and progress
- [x] Add release notes
- [x] Add manual smoke checklist
- [x] Remove temporary cache artifacts
- [x] Refactor oversized frontend shell file

Acceptance:
- [x] typecheck PASS
- [x] tests PASS or explicit unrelated failure
- [x] docs updated
- [x] progress accurate
- [x] temporary files removed
- [x] no unrelated files changed

Implementation notes:
- Frontend typecheck and Product Editor model/copy tests pass.
- Frontend production build passes on Next.js 16.1.6.
- Full frontend node test suite passes.
- Orchestrator Product Editor tests pass from the service package directory.
- Orchestrator Product Editor tests plus orchestrator API regression tests pass.
- Release notes and manual smoke checklist were added under `docs/`.
- Temporary Python cache artifacts were removed from the worktree.
- Product Editor shell was split enough to get back under the 500-line hard limit.
- Generated file `sofortbot-frontend/next-env.d.ts` was reconciled to the current Next.js 16 build output (`.next/types/routes.d.ts`).

## Current blockers

- HOOD pending uploads are still local-only draft items and apply is expected to fail safely until upload-at-apply support exists.
- XL, OTTO, KAUFLAND, and EBAY are not full editors yet by design.

## Next execution order

1. Phase 0 - context lock and docs
2. Phase 1 - orchestrator API foundation
3. Phase 2 - Hood through Orchestrator
4. Phase 3 - frontend shell + Hood tab
5. Phase 4 - review/plan/apply/job UX
6. Phase 5 - JV through Orchestrator
7. Phase 6 - placeholders and cleanup
8. Phase 7 - tests and release readiness
