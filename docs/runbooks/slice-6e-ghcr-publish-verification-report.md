# Slice 6E - GHCR Publish Verification Report

## 1. Scope

- Goal: document the successful manual `GHCR Publish` workflow run and package reference verification.
- Repository root: `I:\WareHub`
- This slice adds a verification runbook only.
- No deploy or stage rollout is included in this slice.

## 2. Preconditions

- Slice 6D had already added `.github/workflows/ghcr-publish.yml`.
- The `GHCR Publish` workflow was present on `main` after stage to main promotion.
- No deploy workflow was executed as part of this verification.
- The workflow remained `workflow_dispatch` only.

## 3. Manual Workflow Run Details

- Workflow: `GHCR Publish`
- Workflow file: `.github/workflows/ghcr-publish.yml`
- Trigger: `workflow_dispatch`
- Ref used: `main`
- Inputs:
  - `tag_prefix=stage`
  - `push_stage_latest=false`
- Run ID: `27115866136`
- Job: `publish-images`
- Result: `success`
- Elapsed: `7m34s`
- Immutable tag published: `stage-a1c2946`
- `stage-latest` was not pushed because `push_stage_latest=false`

## 4. Published Image Refs

- `ghcr.io/ravilkadev0/warehub/backend:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/frontend:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/mobile:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/services:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/orchestrator:stage-a1c2946`
- `ghcr.io/ravilkadev0/warehub/infra:stage-a1c2946`

Note:

- This report confirms the published tag and package verification result for all six image packages.
- It does not include secret values or token content.

## 5. Package Verification Commands

The verification flow used GitHub CLI package access after the workflow completed.

Representative commands:

```powershell
gh auth status
gh auth refresh -h github.com -s read:packages
gh auth status
gh api /users/RavilkaDev0/packages/container/warehub%2Fbackend/versions --jq '.[0].metadata.container.tags'
gh api /users/RavilkaDev0/packages/container/warehub%2Ffrontend/versions --jq '.[0].metadata.container.tags'
gh api /users/RavilkaDev0/packages/container/warehub%2Fmobile/versions --jq '.[0].metadata.container.tags'
gh api /users/RavilkaDev0/packages/container/warehub%2Fservices/versions --jq '.[0].metadata.container.tags'
gh api /users/RavilkaDev0/packages/container/warehub%2Forchestrator/versions --jq '.[0].metadata.container.tags'
gh api /users/RavilkaDev0/packages/container/warehub%2Finfra/versions --jq '.[0].metadata.container.tags'
```

Package verification was then performed against the six published image packages and their `stage-a1c2946` tags through GHCR package queries.

## 6. Verification Result

- Package verification passed for all six images.
- Verified package tags:
  - backend: `stage-a1c2946`
  - frontend: `stage-a1c2946`
  - mobile: `stage-a1c2946`
  - services: `stage-a1c2946`
  - orchestrator: `stage-a1c2946`
  - infra: `stage-a1c2946`
- The immutable publish result matched the successful workflow run.
- `stage-latest` was correctly absent for this run.

## 7. GitHub CLI Auth Scope Issue And Resolution

- Initial GHCR API verification failed with `HTTP 403`.
- Cause:
  - the local GitHub CLI token did not include `read:packages`
- Resolution:
  - `gh auth refresh` was run to add `read:packages`
- Post-resolution confirmation:
  - `gh auth status` showed `read:packages` included
- Result after refresh:
  - package verification passed

Important:

- The local `gh` token was refreshed during verification.
- No token value or secret content is included in this report.

## 8. Warnings / Non-Blocking Notes

- GitHub Actions reported Node.js 20 actions deprecation warnings for:
  - `actions/checkout@v4`
  - `docker/build-push-action@v6`
  - `docker/login-action@v3`
  - `docker/setup-buildx-action@v3`
- This warning did not fail the workflow run.
- It should be handled in a future compatibility slice.

## 9. Explicit Non-Goals

- no deploy
- no SSH
- no server changes
- no stage rollout
- no runtime changes

## 10. Recommended Next Slice

- `Slice 6F - stage host contract and deploy preflight checklist`
