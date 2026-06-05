# Slice 5I - Remaining Docker Build CI Report

## Scope

- Goal: add CI validation for the remaining Docker image builds not yet covered by CI.
- This slice covers build validation only.
- This slice does not add runtime container tests.
- Repository root used for validation: `I:\WareHub`

## Target Dockerfiles

- `apps/backend/Dockerfile`
- `apps/mobile/Dockerfile`
- `infra/Dockerfile`

## Commands Executed

From repository root:

```powershell
Get-Location
git branch --show-current
git status --short
Get-Content apps/backend/Dockerfile
Get-Content apps/mobile/Dockerfile
Get-Content infra/Dockerfile
docker build --target prod -f apps/backend/Dockerfile -t warehub-backend:ci-validation apps/backend
docker build --target prod -f apps/mobile/Dockerfile -t warehub-mobile:ci-validation apps/mobile
docker build --target prod -f infra/Dockerfile -t warehub-infra:ci-validation infra
docker image ls --filter "reference=warehub-*:*"
```

## Result For Each Local Docker Build Validation

### Backend

- Command:
  ```bash
  docker build --target prod -f apps/backend/Dockerfile -t warehub-backend:ci-validation apps/backend
  ```
- Result: passed
- Observed notes:
  - builder stage ran `cargo build --release`
  - final image tag was created as `warehub-backend:ci-validation`
  - the successful release build completed after downloading and compiling Rust dependencies inside the container

### Mobile

- Command:
  ```bash
  docker build --target prod -f apps/mobile/Dockerfile -t warehub-mobile:ci-validation apps/mobile
  ```
- Result: passed
- Observed notes:
  - Docker transferred about `46.89MB` of build context
  - `flutter pub get` completed successfully
  - `flutter test` completed successfully and reported `All tests passed!`
  - `flutter build web --release` completed successfully and produced `build/web`
  - final image tag was created as `warehub-mobile:ci-validation`
  - build duration was materially longer than the other remaining images because the Flutter base image and dependencies were large
- Non-failing warnings observed during build:
  - Flutter warned about running as root inside the container
  - `flutter pub get` reported multiple packages with newer versions available
  - Flutter emitted WebAssembly dry-run incompatibility warnings for `flutter_secure_storage_web`
  - these warnings did not fail the Docker build

### Infra

- Command:
  ```bash
  docker build --target prod -f infra/Dockerfile -t warehub-infra:ci-validation infra
  ```
- Result: passed
- Observed notes:
  - `apk add --no-cache bash curl jq docker-cli` completed successfully
  - final image tag was created as `warehub-infra:ci-validation`

## Files Changed

- `.github/workflows/ci.yml`
- `docs/runbooks/slice-5i-remaining-docker-build-ci-report.md`

## CI Job Added Or Not Added

- CI job added: yes
- Exact CI job name: `remaining-docker-builds`
- Reason:
  - all three required local validation commands passed

## Exact CI Job Name

- `remaining-docker-builds`

## Risks / Notes

- This slice validates build success only. It does not prove runtime behavior for backend, mobile, or infra containers.
- The mobile image is the heaviest remaining build and is the most likely to stress CI time and network bandwidth because it pulls a large Flutter base image and runs test plus web build steps.
- The job timeout was set to `30` minutes to reflect the observed relative cost of the mobile build.
- Local validation used Docker Desktop on the current workstation. GitHub Actions runner behavior is expected to be similar but is not yet confirmed until CI executes the new job.
- Mobile build warnings about root execution, outdated packages, and wasm dry-run incompatibilities remain informational in this slice and were not treated as build blockers.

## Explicit Non-Goals

- no deploy
- no registry push
- no image publishing
- no runtime changes
- no Dockerfile refactor unless absolutely required and documented
