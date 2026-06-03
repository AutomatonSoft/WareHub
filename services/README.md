# sofortbot-services

Repository for standalone microservices developed in parallel with the main SofortBOT backend.

## Goal

- Isolate non-core features into independent services.
- Let a second developer work safely without touching Rust domain logic in `sofortbot-backend`.
- Keep integration through explicit HTTP/API contracts.

## Recommended ownership

- `sofortbot-backend`: source of truth for core business rules.
- `sofortbot-services`: async jobs, adapters, enrichers, integrations, helper APIs.

## Structure

- `services/` individual microservices (`one service = one folder`)
- `libs/` shared reusable code (small, stable, no business-rule coupling)
- `tools/` scripts for local workflows
- `docs/` architecture and service contracts
- `docs/adr/` architecture decision records index and decisions

## Development rules

- Every service MUST have:
  - `README.md`
  - `Dockerfile`
  - `.env.example`
  - tests for happy path + failure path
- Services MUST expose `/healthz` and `/readyz`.
- Service logic MUST NOT duplicate core business rules from backend.
- Integration with backend MUST be API-first and versioned.

## First service template

Use `services/template-service` as a starting point.

## CI/CD

This repository now has Gitea workflows in `.gitea/workflows`:

- `ci.yml`: PR/push quality checks for `services/database_service`
- `cd-stage.yml`: build and push stage image on tags like `vX.Y.Z-stage.N`
- `cd-prod.yml`: build and push prod image on tags like `vX.Y.Z`

Required repository secrets (recommended unified setup):

- `REGISTRY_HOST`
- `REGISTRY_NAMESPACE`
- `REGISTRY_USERNAME`
- `REGISTRY_TOKEN`
- `IMAGE_REPO` (optional, defaults to repository name)

Compatibility fallback (if unified secrets are not set):

- stage/prod-specific secrets:
  - `STAGE_REGISTRY_HOST`, `STAGE_REGISTRY_NAMESPACE`, `STAGE_REGISTRY_USERNAME`, `STAGE_REGISTRY_TOKEN`
  - `PROD_REGISTRY_HOST`, `PROD_REGISTRY_NAMESPACE`, `PROD_REGISTRY_USERNAME`, `PROD_REGISTRY_TOKEN`
- optional repo overrides:
  - `STAGE_IMAGE_REPO`, `PROD_IMAGE_REPO`
