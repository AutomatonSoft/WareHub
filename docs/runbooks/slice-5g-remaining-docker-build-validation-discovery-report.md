# Slice 5G - Remaining Docker Build Validation Discovery Report

## 1. Scope

- Goal: discovery-only report for remaining Dockerfile build validation candidates in `I:\WareHub`.
- Allowed change in this slice: add this runbook only.
- Repository state used for this report:
  - current branch: `feature/slice-5g-remaining-docker-build-discovery`
  - working tree status at preflight: clean
- Evidence sources used:
  - `.github/workflows/ci.yml`
  - `apps/backend/Dockerfile`
  - `apps/frontend/Dockerfile`
  - `apps/mobile/Dockerfile`
  - `infra/Dockerfile`
  - matching `.dockerignore` files
  - `apps/backend/README.md`
  - `infra/deploy/stage/docker-compose.yml`
  - `infra/deploy/prod/docker-compose.yml`
  - `apps/frontend/README.md`
  - `apps/mobile/README.md`
  - `infra/README.md`
- This report does not claim any remaining image builds pass.
- If a point was not directly verifiable from repository files, it is marked as unknown and paired with a validation command.

## 2. Already Validated in Slice 5F

CI already validates these Docker builds in `.github/workflows/ci.yml`:

1. `services/database-service/Dockerfile`
   - CI command:
     ```bash
     docker build -f services/database-service/Dockerfile -t warehub-database-service:ci-validation services
     ```
2. `services/orchestrator/Dockerfile`
   - CI command:
     ```bash
     docker build -f services/orchestrator/Dockerfile -t warehub-orchestrator:ci-validation services/orchestrator
     ```

These are out of scope for Slice 5G because the task is limited to remaining discovery candidates.

## 3. Remaining Dockerfile Inventory

| Dockerfile | Declared stages | Final default stage | Expected local build context | `.dockerignore` |
|---|---|---|---|---|
| `apps/backend/Dockerfile` | `dev`, `builder`, `stage`, `prod` | `prod` | `apps/backend` | `apps/backend/.dockerignore` exists |
| `apps/frontend/Dockerfile` | `deps`, `dev`, `builder`, `stage`, `prod` | `prod` | `apps/frontend` | `apps/frontend/.dockerignore` exists |
| `apps/mobile/Dockerfile` | `dev`, `builder`, `stage`, `prod` | `prod` | `apps/mobile` | `apps/mobile/.dockerignore` exists |
| `infra/Dockerfile` | `dev`, `stage`, `prod` | `prod` | `infra` | `infra/.dockerignore` exists |

## 4. Recommended Local Docker Build Commands for Each Remaining Dockerfile

The commands below are recommendations for local validation from repository root. They have not been executed in this slice.

### `apps/backend/Dockerfile`

Primary command:

```bash
docker build --target prod -f apps/backend/Dockerfile -t warehub-backend:local-validation apps/backend
```

Additional command if `stage` target also needs explicit validation:

```bash
docker build --target stage -f apps/backend/Dockerfile -t warehub-backend:local-stage-validation apps/backend
```

### `apps/frontend/Dockerfile`

Primary command:

```bash
docker build --target prod -f apps/frontend/Dockerfile -t warehub-frontend:local-validation apps/frontend
```

Additional command if `stage` target also needs explicit validation:

```bash
docker build --target stage -f apps/frontend/Dockerfile -t warehub-frontend:local-stage-validation apps/frontend
```

### `apps/mobile/Dockerfile`

Primary command:

```bash
docker build --target prod -f apps/mobile/Dockerfile -t warehub-mobile:local-validation apps/mobile
```

Additional command if `stage` target also needs explicit validation:

```bash
docker build --target stage -f apps/mobile/Dockerfile -t warehub-mobile:local-stage-validation apps/mobile
```

### `infra/Dockerfile`

Primary command:

```bash
docker build --target prod -f infra/Dockerfile -t warehub-infra:local-validation infra
```

Additional command if `stage` target also needs explicit validation:

```bash
docker build --target stage -f infra/Dockerfile -t warehub-infra:local-stage-validation infra
```

## 5. Expected Build Context for Each Command

### `apps/backend/Dockerfile`

- Expected context: `apps/backend`
- Why:
  - Dockerfile copies `Cargo.toml`, `Cargo.lock`, `migrations`, and `src` from the context root.
  - `apps/backend/README.md` shows `docker build ... .` when run inside `apps/backend`.

### `apps/frontend/Dockerfile`

- Expected context: `apps/frontend`
- Why:
  - Dockerfile copies `package*.json*` and later `COPY . .` from the context root.
  - Build ARG names align with frontend repository files and deploy compose environment wiring.

### `apps/mobile/Dockerfile`

- Expected context: `apps/mobile`
- Why:
  - Dockerfile uses `COPY . .` and then runs Flutter dependency, test, and web build commands from the copied project.

### `infra/Dockerfile`

- Expected context: `infra`
- Why:
  - Dockerfile itself does not currently copy repository files, but `infra/.dockerignore` exists and the Dockerfile lives under `infra`.
  - Keeping the context rooted at `infra` matches the file location and limits unrelated repository content.

## 6. Risk Notes Per Image

### `apps/backend/Dockerfile`

- Build context size risk:
  - Medium.
  - Context is the full `apps/backend` directory.
  - `apps/backend/.dockerignore` excludes `.git`, `.github`, `target`, `dist`, `build`, `.next`, `coverage`, logs, and `.env*` except `.env.example`.
- Dependency install risk:
  - Medium.
  - Builder stage runs `cargo build --release`.
  - Success depends on fetching Rust dependencies and compiling the workspace state present under `apps/backend`.
  - Unknown whether any crate or native dependency issue appears on clean Docker hosts until the build is run.
  - Validation command: `docker build --target prod -f apps/backend/Dockerfile -t warehub-backend:local-validation apps/backend`
- Required ARG/ENV risk:
  - Low from Dockerfile inspection.
  - No build `ARG` is declared in this Dockerfile.
  - `APP_ENV` is set inside `stage` and `prod`.
  - Unknown whether application startup needs additional runtime environment beyond the image build itself.
- Generated artifact risk:
  - Present.
  - Runtime stages depend on `/app/target/release/sofortbot-backend` from the builder stage.
  - If the binary name or release build output changes, the final stage copy will fail.
- `.dockerignore`:
  - Exists: `apps/backend/.dockerignore`

### `apps/frontend/Dockerfile`

- Build context size risk:
  - Medium.
  - Context is the full `apps/frontend` directory.
  - `apps/frontend/.dockerignore` excludes `.git`, `.github`, `node_modules`, `.next`, `dist`, `build`, `coverage`, logs, and `.env*` except `.env.example`.
- Dependency install risk:
  - Medium to high.
  - `deps` stage runs `npm ci` when `package-lock.json` exists, otherwise `npm install` when only `package.json` exists.
  - Builder stage runs `npm run build`.
  - Success depends on registry access, lockfile/package consistency, and application build requirements.
  - Validation command: `docker build --target prod -f apps/frontend/Dockerfile -t warehub-frontend:local-validation apps/frontend`
- Required ARG/ENV risk:
  - Medium.
  - Dockerfile declares:
    - `NEXT_PUBLIC_ANDROID_APK_URL`
    - `NEXT_PUBLIC_ANDROID_APK_URL_STAGE`
    - `NEXT_PUBLIC_ANDROID_APK_URL_PROD`
    - `NEXT_PUBLIC_ANDROID_APP_NAME`
  - Default values exist in the Dockerfile, so these ARGs are not strictly required for build invocation.
  - Repository files show stage/prod deploy wiring for Android URL and app name.
  - Unknown whether additional frontend build-time environment is required beyond what the Dockerfile declares.
  - Validation command if custom values are needed:
    ```bash
    docker build --target prod -f apps/frontend/Dockerfile -t warehub-frontend:local-validation --build-arg NEXT_PUBLIC_ANDROID_APK_URL=https://example.com/downloads/warehub.apk --build-arg NEXT_PUBLIC_ANDROID_APP_NAME=warehub apps/frontend
    ```
- Generated artifact risk:
  - Present.
  - Builder stage runs `npm run build`.
  - Final stages copy `/app` from builder, which means runtime image contents depend on build outputs created during the builder stage.
- `.dockerignore`:
  - Exists: `apps/frontend/.dockerignore`

### `apps/mobile/Dockerfile`

- Build context size risk:
  - Medium.
  - Context is the full `apps/mobile` directory.
  - `apps/mobile/.dockerignore` excludes `.git`, `.github`, `.dart_tool`, Flutter plugin cache files, `build`, `coverage`, `.pub-cache`, `.pub`, logs, and `.env*` except `.env.example`.
- Dependency install risk:
  - High.
  - `dev` stage runs `flutter pub get`.
  - `builder` stage runs `flutter test` and `flutter build web --release`.
  - Success depends on Flutter package resolution and test/build stability inside the container image.
  - Validation command: `docker build --target prod -f apps/mobile/Dockerfile -t warehub-mobile:local-validation apps/mobile`
- Required ARG/ENV risk:
  - Low from Dockerfile inspection.
  - No build `ARG` is declared in this Dockerfile.
  - No required Dockerfile `ENV` is declared for the build steps.
  - Unknown whether Flutter project configuration or generated files outside the Dockerfile assumptions are required on a clean Docker host.
- Generated artifact risk:
  - Present.
  - Runtime stages depend on `/app/build/web` produced by `flutter build web --release`.
  - The same build path also depends on `flutter test` succeeding because test execution happens before the web build in the builder stage.
- `.dockerignore`:
  - Exists: `apps/mobile/.dockerignore`

### `infra/Dockerfile`

- Build context size risk:
  - Low.
  - Dockerfile does not copy repository files into the image.
  - `infra/.dockerignore` excludes `.git`, `.github`, logs, and `.env*` except `.env.example`.
- Dependency install risk:
  - Low to medium.
  - Each stage runs `apk add --no-cache bash curl jq docker-cli`.
  - Success depends on Alpine package repository availability during the build.
  - Validation command: `docker build --target prod -f infra/Dockerfile -t warehub-infra:local-validation infra`
- Required ARG/ENV risk:
  - Low.
  - No build `ARG` is declared.
  - `APP_ENV` is set internally in `stage` and `prod`.
- Generated artifact risk:
  - None observed from Dockerfile inspection.
  - This Dockerfile installs packages and sets a command, but does not produce or copy generated application artifacts from a builder stage.
- `.dockerignore`:
  - Exists: `infra/.dockerignore`

## 7. Proposed Next Slice After Discovery

- Proposed next slice: `Slice 5H - add frontend Docker build CI validation`
- Reasoning from repository files:
  - `apps/frontend/Dockerfile` already exists.
  - `apps/frontend/.dockerignore` already exists.
  - Frontend has explicit build steps in the Dockerfile.
  - Slice 5F already established the CI pattern for adding Docker build validation jobs without deploy or push behavior.
- Unknowns to resolve in Slice 5H before claiming success:
  - whether `docker build --target prod -f apps/frontend/Dockerfile ... apps/frontend` passes on the CI runner
  - whether any frontend build-time ARG values should be passed explicitly in CI
  - whether validating only `prod` is sufficient, or `stage` target also needs a separate CI build

## 8. Explicit Non-Goals

- no deploy
- no registry push
- no image publishing
- no Dockerfile refactor
- no runtime changes
- no CI job added in this slice

## Unknowns Requiring Local Validation

1. Whether `apps/backend/Dockerfile` builds successfully on a clean Docker host.
   - Command: `docker build --target prod -f apps/backend/Dockerfile -t warehub-backend:local-validation apps/backend`
2. Whether `apps/frontend/Dockerfile` builds successfully on a clean Docker host with default Dockerfile ARG values.
   - Command: `docker build --target prod -f apps/frontend/Dockerfile -t warehub-frontend:local-validation apps/frontend`
3. Whether `apps/mobile/Dockerfile` completes `flutter pub get`, `flutter test`, and `flutter build web --release` successfully in containerized build context.
   - Command: `docker build --target prod -f apps/mobile/Dockerfile -t warehub-mobile:local-validation apps/mobile`
4. Whether `infra/Dockerfile` builds successfully on a clean Docker host with Alpine package installation available.
   - Command: `docker build --target prod -f infra/Dockerfile -t warehub-infra:local-validation infra`
