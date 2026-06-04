# Slice 4A - CI Discovery and Validation Plan

## 1. Summary

Slice 4A is a discovery-only and documentation-only step for future GitHub Actions in the WareHub monorepo.

Current conclusion:

- no workflow files exist yet; `.github/workflows` contains only `.gitkeep`;
- the first CI slice should stay non-deploy and non-migration;
- initial CI should focus on repository safety scans, compose config validation, and only those language-specific checks that are already evidenced as safe;
- frontend, mobile, and some deeper Rust/Python checks should be deferred until their install and runtime assumptions are explicitly validated.

## 2. Git State

- Working directory: `I:\WareHub`
- Branch: `feature/slice-4a-ci-discovery-plan`
- Preflight working tree: clean
- Recent `HEAD` history includes stage merge Slice 3O:
  - `be1157d Merge pull request #16 from RavilkaDev0/feature/slice-3o-deprecate-shared-services-requirements`

## 3. Current Repository CI/CD State

- Repository-level CI/CD policy already exists in `docs/ci-cd/`.
- `README.md` states that CI/CD workflows will be added in later slices.
- `AGENTS.md` defines GitHub as canonical platform and forbids deploy, migrations, or secrets misuse in early slices.
- No GitHub Actions workflow files currently exist.
- `.github/workflows` currently contains only `.gitkeep`.
- Branch model already documented:
  - `feature/*` -> PR -> `stage`
  - `stage` -> PR -> `main`
  - `hotfix/*` -> PR -> `main` -> back-merge to `stage`

## 4. Tooling Availability

Detected toolchain on the current host:

- `node --version` -> `v24.14.0`
- `npm --version` -> `11.9.0`
- `rustc --version` -> `rustc 1.93.1 (01f6ddf75 2026-02-11)`
- `cargo --version` -> `cargo 1.93.1 (083ac5135 2025-12-15)`
- `python --version` -> `Python 3.14.3`
- `py --version` -> `Python 3.14.3`
- `uv --version` -> `uv 0.11.19 (7b2cff1c3 2026-06-03 x86_64-pc-windows-msvc)`
- `flutter --version` -> `Flutter 3.41.4`, `Dart 3.11.1`
- `docker --version` -> `Docker version 29.4.3, build 055a478`
- `docker compose version` -> `Docker Compose version v5.1.3`

Tool availability is sufficient for future CI design, but Slice 4A intentionally did not run install/build/test/server commands.

## 5. Rust Backend CI Findings

Inspected:

- `apps/backend/Cargo.toml`
- `apps/backend/Cargo.lock`
- `apps/backend/.env.example`
- `apps/backend/README.md`
- `apps/backend/migrations`
- `apps/backend/src`
- `apps/backend/Dockerfile`

Findings:

- backend is a single Rust package rooted in `apps/backend`;
- binaries discovered:
  - `sofortbot-backend`
  - `reset_users`
- `cargo metadata --no-deps` succeeded, so workspace metadata is readable in CI-safe mode;
- `README.md` explicitly documents:
  - `cargo fmt --all -- --check`
  - `cargo clippy -- -D warnings`
  - `cargo test`
- `AGENTS.md` additionally expects `cargo check` for meaningful backend validation;
- SQLx is present, and backend contains `migrations/*.sql`, so some future checks may depend on SQLx/database assumptions.

Conservative CI recommendation for backend:

- safe immediately:
  - `cargo metadata --no-deps`
- candidate for next slice, but not yet proven in this discovery slice:
  - `cargo fmt --all -- --check`
  - `cargo check`
  - `cargo clippy -- -D warnings`
  - `cargo test`

Risk notes:

- Rust build/test commands were not run in Slice 4A, so they should not be marked as initial required checks without explicit validation in Slice 4B or a dedicated backend validation slice.

Path filter:

- `apps/backend/**`

## 6. Frontend CI Findings

Inspected:

- `apps/frontend/package.json`
- `apps/frontend/package-lock.json`
- `apps/frontend/next.config.mjs`
- `apps/frontend/tsconfig.json`
- `apps/frontend/.env.example`
- `apps/frontend/app/api/backend/[...path]/route.ts`
- `apps/frontend/Dockerfile`

Findings:

- package manager is `npm`;
- lockfile exists: `package-lock.json`;
- relevant scripts discovered:
  - `lint`
  - `typecheck`
  - `test`
  - `build`
- project also contains Playwright/e2e and OpenAPI-related scripts;
- frontend env handling is monorepo-aware and loads local-safe env sources;
- no legacy hardcoded backend alias remains in the inspected proxy route.

Conservative CI recommendation for frontend:

- not for first required checks until install path is explicitly validated:
  - `npm ci`
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
- defer `npm run build` and e2e checks initially.

Reason for deferral:

- Slice 4A was not allowed to run `npm ci`, lint, typecheck, or build;
- therefore these commands are known to exist but not yet validated as safe and deterministic in CI for the current monorepo state.

Path filter:

- `apps/frontend/**`

## 7. Mobile CI Findings

Inspected:

- `apps/mobile/pubspec.yaml`
- `apps/mobile/pubspec.lock`
- `apps/mobile/.env.example`
- `apps/mobile/README.md`

Findings:

- Flutter/Dart project is present and has a lockfile;
- `README.md` documents:
  - `dart format --set-exit-if-changed lib test`
  - `flutter analyze`
  - `flutter test`
- mobile env file exists only as placeholder example;
- mobile signing placeholders exist at repository level and should not be used in early CI.

Conservative CI recommendation for mobile:

- defer mobile from the first CI workflow;
- add mobile CI only after a dedicated validation slice confirms host/CI bootstrap expectations.

Reason for deferral:

- Slice 4A did not run `flutter pub get`, `flutter analyze`, `flutter test`, or any mobile build flow;
- early CI must not require signing secrets or app-store credentials.

Path filter:

- `apps/mobile/**`

## 8. Database-Service CI Findings

Inspected:

- `services/database-service/requirements.txt`
- `services/database-service/README.md`
- `services/database-service/manage.py`
- `services/database-service/database_service/settings.py`
- `services/database-service/orders_pars/service.py`
- `services/database-service/docker-compose.yml`
- `docs/runbooks/slice-3l-database-service-uv-bootstrap-validation-report.md`
- `docs/runbooks/slice-3m-database-service-requirements-cleanup-report.md`

Findings:

- service-local dependency ownership already exists:
  - `services/database-service/requirements.txt`
- previous slices already validated `uv` bootstrap and explicit `.venv`-based import checks;
- Docker/compose local bootstrap is monorepo-safe and explicitly does not auto-run migrations;
- settings load env from local `.env`, repo root `.env`, and `infra/.env`;
- service contains DB-aware Django settings, so not every Python check is DB-independent.

Conservative CI recommendation for database-service:

- good candidate for first CI workflow:
  - `uv venv`
  - `uv pip install -r requirements.txt`
  - selected `py_compile` checks
  - explicit import checks against the created virtualenv interpreter
- defer full `pytest` until deterministic test scope and DB assumptions are explicitly validated.

Initial path filter:

- `services/database-service/**`

## 9. Orchestrator CI Findings

Inspected:

- `services/orchestrator/requirements.txt`
- `services/orchestrator/README.md`
- `services/orchestrator/src`
- `services/orchestrator/tests`
- `services/orchestrator/Dockerfile`
- `services/orchestrator/.env.example`

Findings:

- orchestrator has its own service-local `requirements.txt`;
- README documents `pytest -q`;
- tests exist, but Slice 4A did not validate install or execution flow;
- Dockerfile is simple and monorepo-local, but no build was run in this slice;
- future standardization to `uv` is plausible, but not yet established as policy for orchestrator.

Conservative CI recommendation for orchestrator:

- not in the first required checks by default;
- prepare a later Python services CI expansion for:
  - dependency install
  - `py_compile`
  - `pytest -q`

Reason for deferral:

- install and test execution were not validated in this slice;
- env and service assumptions for orchestrator tests are not yet proven deterministic in CI.

Path filter:

- `services/orchestrator/**`

## 10. Docker / Compose CI Findings

Inspected:

- `infra/local/docker-compose.dev.yml`
- `services/database-service/docker-compose.yml`
- `services/orchestrator/Dockerfile`
- `services/database-service/Dockerfile`
- `apps/backend/Dockerfile`
- `apps/frontend/Dockerfile`

Validated config commands:

- `docker compose -f infra/local/docker-compose.dev.yml config` -> success
- `docker compose -f services/database-service/docker-compose.yml config` -> success

Findings:

- `infra/local/docker-compose.dev.yml` is a local dependency stack only:
  - `warehub-postgres`
  - `warehub-redis`
  - `warehub-minio`
  - `warehub-rabbitmq`
- `services/database-service/docker-compose.yml` is local/dev oriented and monorepo-safe at config level;
- backend and frontend Dockerfiles exist and are structurally usable for later CI design;
- Docker build validation must be deferred because Slice 4A was not allowed to run `docker build`.

Immediate CI-safe recommendation:

- include only compose config checks in the first CI workflow;
- defer all Docker image builds.

## 11. Secrets and Environments Policy

Current repository policy is already clear:

- no real `.env` files in git;
- only `.env.example` is allowed;
- future GitHub Environments:
  - `stage`
  - `production`
- secrets already documented as future-only and not for Slice 4A;
- old secrets from legacy `sofortbot-infra/.env` are candidates for rotation before production cutover.

Initial CI policy must be:

- no secrets required;
- no deploy credentials;
- no stage or production environments usage;
- no database tunnels;
- no writes to external systems.

## 12. Recommended CI Workflow Architecture

Recommended phased design:

1. Start with one conservative non-deploy workflow:
   - `.github/workflows/ci.yml`
2. Keep it focused on repo safety, compose config, and only pre-validated checks.
3. Split later into dedicated workflows when checks become stable:
   - `.github/workflows/ci-backend-rust.yml`
   - `.github/workflows/ci-frontend.yml`
   - `.github/workflows/ci-python-services.yml`
   - `.github/workflows/ci-mobile.yml`
   - `.github/workflows/ci-infra.yml`

Recommended trigger policy for the first workflow:

- `pull_request` to `stage`
- `pull_request` to `main`

Recommended later expansion:

- `push` to `stage`
- `push` to `main`

Recommended workflow defaults:

- explicit minimal permissions:
  - `contents: read`
- concurrency enabled to cancel superseded runs per branch/PR;
- path filters used aggressively to avoid unnecessary jobs;
- no environment secrets in the initial workflow.

## 13. Recommended Initial Required Checks

Recommended first required checks for branch protection after Slice 4B:

- repository safety scan
- env file scan
- forbidden artifact directory scan
- `docker compose -f infra/local/docker-compose.dev.yml config`
- `docker compose -f services/database-service/docker-compose.yml config`
- database-service `uv` bootstrap validation:
  - `uv venv`
  - `uv pip install -r requirements.txt`
  - selected `py_compile`
  - explicit import checks using the created virtualenv interpreter

Conservative backend recommendation for first CI:

- include `cargo metadata --no-deps` only at first if a Rust signal is desired immediately;
- move `cargo check` into CI only after explicit validation in the next slice.

## 14. Checks to Defer

Defer for later dedicated validation slices:

- `cargo check`
- `cargo fmt --all -- --check`
- `cargo clippy -- -D warnings`
- `cargo test`
- frontend `npm ci`
- frontend `npm run lint`
- frontend `npm run typecheck`
- frontend `npm test`
- frontend `npm run build`
- mobile `flutter analyze`
- mobile `flutter test`
- mobile build/signing flows
- orchestrator install/test workflow
- all Docker image builds
- any deploy workflow
- any migration workflow

## 15. Path Filter Strategy

Recommended initial path filters:

- backend:
  - `apps/backend/**`
- frontend:
  - `apps/frontend/**`
- mobile:
  - `apps/mobile/**`
- database-service:
  - `services/database-service/**`
- orchestrator:
  - `services/orchestrator/**`
- infra:
  - `infra/**`
- repo-level CI/policy:
  - `.github/workflows/**`
  - `.gitignore`
  - `.env.example`
  - `README.md`
  - `AGENTS.md`
  - `docs/ci-cd/**`
  - `docs/runbooks/**`

Practical recommendation:

- in the first workflow, repo safety and compose config jobs should trigger on root policy files and infra changes;
- database-service job should trigger only on `services/database-service/**` and possibly shared CI workflow file changes;
- frontend/mobile/orchestrator path filters should exist in plan but remain unused until their jobs are actually introduced.

## 16. Cache Strategy

Recommended future cache approach:

- Rust:
  - cargo registry cache
  - cargo git cache
  - avoid over-caching build artifacts until job stability is proven
- Frontend:
  - npm cache keyed by `apps/frontend/package-lock.json`
- Database-service:
  - `uv` cache keyed by `services/database-service/requirements.txt`
- Orchestrator:
  - later Python dependency cache keyed by `services/orchestrator/requirements.txt`
- Mobile:
  - later Flutter/Dart pub cache only after mobile CI is enabled

Conservative rule:

- prefer dependency caches first;
- defer heavy build caches until workflows are known to be stable and worth the complexity.

## 17. Risks

- backend CI commands beyond metadata are not yet proven safe in the current monorepo state;
- frontend scripts exist, but install/lint/typecheck/build were not validated in Slice 4A;
- mobile tooling exists on the host, but no Flutter bootstrap/checks were validated in this slice;
- orchestrator test determinism is still unproven;
- premature Docker build checks could create false failures before monorepo image contracts are explicitly validated.

## 18. Blockers

Hard blockers for Slice 4A itself: none.

Practical blockers before enabling broader required CI checks:

- no validated frontend CI bootstrap yet;
- no validated orchestrator CI bootstrap/test path yet;
- no validated mobile CI bootstrap path yet;
- no evidence yet that full Rust validation commands are CI-safe in the current repo state.

## 19. Proposed Slice 4B

Recommended next slice:

- create the first non-deploy GitHub Actions workflow only;
- keep it conservative and secret-free;
- include:
  - repository safety scan
  - env file scan
  - forbidden artifact directory scan
  - compose config checks
  - database-service `uv` bootstrap and explicit import validation
  - optional `cargo metadata --no-deps` for backend signal
- do not include:
  - deploy
  - migrations
  - Docker builds
  - frontend install/build
  - mobile jobs
  - orchestrator tests

## 20. Commands Run

Preflight:

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`

Discovery:

- `Get-ChildItem` and `Get-Content` across root docs, app manifests, env examples, Dockerfiles, and runbooks
- `rg` / `Select-String` for targeted lookup

Tooling:

- `node --version`
- `npm --version`
- `rustc --version`
- `cargo --version`
- `python --version`
- `py --version`
- `uv --version`
- `flutter --version`
- `docker --version`
- `docker compose version`

Allowed config and metadata:

- `docker compose -f infra/local/docker-compose.dev.yml config`
- `docker compose -f services/database-service/docker-compose.yml config`
- `cargo metadata --no-deps`

Final validation:

- `git status --short`
- `git diff --stat`
- env scan
- forbidden dirs scan
- `git status --ignored --short services/database-service/.venv`
