# Slice 3E - Runtime Container Alias Fix Report

## 1. Summary

Slice 3E removed the hardcoded legacy backend container alias from the frontend runtime proxy path.

The frontend backend proxy now:

- prefers explicit env override via `BACKEND_INTERNAL_API_BASE_URL`
- can still use `NEXT_PUBLIC_API_BASE_URL` if already provided
- falls back only to local-safe values:
  - `http://127.0.0.1:8932/api/v1`
  - `http://localhost:8932/api/v1`

## 2. Files Changed

- `apps/frontend/app/api/backend/[...path]/route.ts`
- `apps/frontend/.env.example`
- `docs/runbooks/slice-3e-runtime-container-aliases-report.md`

## 3. Frontend Backend Proxy Change

- removed hardcoded runtime alias:
  - `http://sofortbot-backend:8932/api/v1`
- added env-driven candidate selection
- current runtime candidate order:
  1. `BACKEND_INTERNAL_API_BASE_URL`
  2. `NEXT_PUBLIC_API_BASE_URL`
  3. `http://127.0.0.1:8932/api/v1`
  4. `http://localhost:8932/api/v1`
- duplicate values are deduplicated
- existing request proxy behavior is otherwise preserved

## 4. Env Example Change

- added:
  - `BACKEND_INTERNAL_API_BASE_URL=http://127.0.0.1:8932/api/v1`
- kept local-safe frontend values in `.env.example`
- no secrets added

## 5. Validation Results

- `git status --short`
  - modified:
    - `apps/frontend/.env.example`
    - `apps/frontend/app/api/backend/[...path]/route.ts`
  - untracked:
    - `docs/runbooks/slice-3e-runtime-container-aliases-report.md`
- search in changed files:
  - command:
    - `rg -n "sofortbot-backend|sofortbot-frontend|sofortbot-services|F:\\SofortBOT|http://sofortbot-backend" apps/frontend/app/api/backend/[...path]/route.ts apps/frontend/.env.example`
  - result:
    - no matches
    - `rg` exited with code `1`, which is expected for zero matches
- env scan:
  - result: only `.env.example` files found:
    - `I:\WareHub\.env.example`
    - `I:\WareHub\apps\backend\.env.example`
    - `I:\WareHub\apps\frontend\.env.example`
    - `I:\WareHub\apps\mobile\.env.example`
    - `I:\WareHub\infra\.env.example`
    - `I:\WareHub\infra\deploy\runners\.env.example`
    - `I:\WareHub\services\database-service\.env.example`
    - `I:\WareHub\services\orchestrator\.env.example`
- forbidden dirs scan:
  - result: none
- nested workflows scan:
  - result: only root `I:\WareHub\.github`

## 6. Remaining Alias References

- none in:
  - `apps/frontend/app/api/backend/[...path]/route.ts`
  - `apps/frontend/.env.example`

Other legacy aliases may still exist elsewhere in the repo outside this slice scope.

## 7. Risks

- runtime behavior still depends on the env contract being documented and used consistently
- if a containerized local frontend later needs an internal network alias, it must now be passed explicitly through env
- no runtime commands were executed in this slice

## 8. Next Step

Next recommended step: continue with a narrow follow-up slice only if other runtime alias references outside these files need cleanup, or validate the frontend proxy manually with local untracked env files.
