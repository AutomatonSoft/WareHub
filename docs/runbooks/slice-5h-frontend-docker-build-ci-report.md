# Slice 5H - Frontend Docker Build CI Report

## Scope

- Goal: add CI validation for the frontend Docker image build only.
- Target Dockerfile: `apps/frontend/Dockerfile`
- Inspected inputs:
  - `apps/frontend/Dockerfile`
  - `apps/frontend/.dockerignore`
  - `.github/workflows/ci.yml`
- Slice constraints followed:
  - no deploy
  - no registry push
  - no image publishing
  - no runtime changes
  - no Dockerfile change
  - no frontend source change
  - no package manifest or lockfile change

## Commands Executed

From repository root:

```powershell
Get-Location
git branch --show-current
git status --short
Get-Content apps/frontend/Dockerfile
Get-Content apps/frontend/.dockerignore
docker build --target prod -f apps/frontend/Dockerfile -t warehub-frontend:ci-validation apps/frontend
docker image ls --filter "reference=warehub-frontend:*"
```

## Result of Local Frontend Docker Build Validation

- Result: passed
- Validated command:

```bash
docker build --target prod -f apps/frontend/Dockerfile -t warehub-frontend:ci-validation apps/frontend
```

- Observed facts from the successful local build:
  - Docker loaded `apps/frontend/.dockerignore`
  - transferred build context size was about `3.25MB`
  - `npm ci` completed successfully in the `deps` stage
  - `npm run build` completed successfully in the `builder` stage
  - the final image was created with tag `warehub-frontend:ci-validation`
- Observed notes from build output:
  - npm reported deprecated packages during dependency installation
  - npm audit summary reported `16 vulnerabilities (6 low, 5 moderate, 5 high)`
  - these warnings did not fail the Docker build
- Local image listing after validation:
  - `warehub-frontend:ci-validation`

## Files Changed

- `.github/workflows/ci.yml`
- `docs/runbooks/slice-5h-frontend-docker-build-ci-report.md`

## CI Job Added Or Not Added

- CI job added: yes
- Job name: `frontend-docker-build`
- Job behavior:
  - runs on `ubuntu-latest`
  - timeout `15` minutes
  - checks out the repository
  - shows Docker version
  - runs:
    ```bash
    docker build --target prod -f apps/frontend/Dockerfile -t warehub-frontend:ci-validation apps/frontend
    ```
  - lists the validation image with:
    ```bash
    docker image ls --filter "reference=warehub-frontend:*"
    ```

## Risks / Notes

- This slice validates image build only. It does not validate container runtime behavior.
- The local build used Docker Desktop on the current workstation. GitHub Actions runner behavior is expected to be similar but is not yet confirmed until CI runs.
- The build succeeded without explicit build args because the Dockerfile declares defaults for:
  - `NEXT_PUBLIC_ANDROID_APK_URL`
  - `NEXT_PUBLIC_ANDROID_APK_URL_STAGE`
  - `NEXT_PUBLIC_ANDROID_APK_URL_PROD`
  - `NEXT_PUBLIC_ANDROID_APP_NAME`
- Dependency health warnings remain:
  - deprecated npm packages were reported during `npm ci`
  - `npm audit` summary reported vulnerabilities
- This slice intentionally does not address dependency remediation because that would exceed CI-only scope.

## Non-Goals

- no deploy
- no registry push
- no image publishing
- no runtime changes
