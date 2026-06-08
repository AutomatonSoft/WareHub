# Slice 6D - GHCR Publish Workflow Draft

## 1. Scope

- Goal: add a safe GitHub Actions workflow draft that builds and publishes WareHub Docker images to `GHCR`.
- This slice is publish-only.
- This slice does not deploy containers or reach any server.
- Files added in this slice:
  - `.github/workflows/ghcr-publish.yml`
  - `docs/runbooks/slice-6d-ghcr-publish-workflow-draft.md`

## 2. What Workflow Was Added

- Workflow file: `.github/workflows/ghcr-publish.yml`
- Workflow name: `GHCR Publish`
- Trigger: `workflow_dispatch` only
- Job count: one job
- Job name: `publish-images`
- Permissions:
  - `contents: read`
  - `packages: write`
- Concurrency:
  - `ghcr-publish-${{ github.ref }}`
  - `cancel-in-progress: false`

## 3. Why workflow_dispatch Only

- This repository does not yet have a verified deploy workflow.
- Slice 6C explicitly deferred deploy implementation and host wiring.
- Manual trigger reduces blast radius for the first package-publish slice.
- Manual trigger allows the repository owners to verify package naming, permissions, and tag results before any automatic publish policy is introduced.
- The workflow does not run on `push` or `pull_request`.

## 4. GHCR Authentication Strategy

- The workflow uses `docker/login-action` with:
  - registry: `ghcr.io`
  - username: `${{ github.actor }}`
  - password: `${{ secrets.GITHUB_TOKEN }}`
- This follows the slice rule to use the GitHub-provided `GITHUB_TOKEN` unless repository evidence proves a PAT is required.
- No PAT requirement was confirmed from repository files inspected in this slice.
- Package write success still depends on repository and organization GitHub package permissions at runtime.

## 5. Image Naming Contract

- The workflow lowercases repository owner and repository name before constructing image refs.
- Intended image refs:
  - `ghcr.io/<owner>/<repo>/backend`
  - `ghcr.io/<owner>/<repo>/frontend`
  - `ghcr.io/<owner>/<repo>/mobile`
  - `ghcr.io/<owner>/<repo>/services`
  - `ghcr.io/<owner>/<repo>/orchestrator`
  - `ghcr.io/<owner>/<repo>/infra`
- This follows the Slice 6C stage environment contract.
- It intentionally moves toward nested GHCR package paths even though `infra/.env.example` still contains flatter placeholder names such as `ghcr.io/example/warehub-backend`.

## 6. Tagging Strategy

- Required immutable tag:
  - `${{ inputs.tag_prefix }}-${short_sha}`
- Optional convenience tag:
  - `${{ inputs.tag_prefix }}-latest`
- The convenience tag is only pushed when `push_stage_latest` is `true`.
- `latest` is not used.
- `stage-latest` or any `<prefix>-latest` convenience tag is not the rollback source of truth.

## 7. Images Covered

- backend:
  - context: `apps/backend`
  - file: `apps/backend/Dockerfile`
  - target: `prod`
- frontend:
  - context: `apps/frontend`
  - file: `apps/frontend/Dockerfile`
  - target: `prod`
- mobile:
  - context: `apps/mobile`
  - file: `apps/mobile/Dockerfile`
  - target: `prod`
- services:
  - context: `services`
  - file: `services/database-service/Dockerfile`
  - target: default Dockerfile final stage
- orchestrator:
  - context: `services/orchestrator`
  - file: `services/orchestrator/Dockerfile`
  - target: default Dockerfile final stage
- infra:
  - context: `infra`
  - file: `infra/Dockerfile`
  - target: `prod`

## 8. Explicit Confirmation Of Exclusions

- No deploy logic was added.
- No SSH logic was added.
- No server host, IP, user, path, or stage env file was referenced.
- No GitHub Secrets were added or changed.
- No GitHub Environment settings were added or changed.
- No `.github/workflows/ci.yml` behavior was modified.

## 9. Required Repository Or GitHub Settings To Verify Before First Run

- Actions can read repository contents.
- Actions can write packages to `GHCR`.
- GHCR package visibility decision is confirmed.
- GHCR package cleanup or retention policy is confirmed.

## 10. First Manual Run Plan

- Run from:
  - branch or ref that contains `.github/workflows/ghcr-publish.yml`
- First input values:
  - `tag_prefix=stage`
  - `push_stage_latest=false`
- Expected output:
  - six image packages pushed to `ghcr.io`
  - immutable image refs tagged as `stage-<short_sha>`
  - GitHub step summary listing all pushed refs
  - no deploy or server-side action

## 11. Risks / Notes

- GHCR package permissions may block push even when workflow syntax is correct.
- Uppercase repository owner or repository name would break GHCR refs without normalization; the workflow explicitly lowercases both values.
- The mobile image is likely the slowest publish step because its Docker build is the heaviest validated image in earlier slices.
- `GITHUB_TOKEN` package permissions may still depend on repository or organization settings outside the repository.
- `<prefix>-latest` is convenience only and is not the rollback source of truth.

## 12. Recommended Next Slice

- `Slice 6E - run GHCR publish manually and verify package refs`

## 13. Explicit Non-Goals

- no deploy
- no SSH
- no server changes
- no GitHub Secrets changes
- no GitHub Environment changes
- no stage rollout
- no runtime changes
- no Dockerfile changes
- no compose changes
- no script changes
- no source changes
