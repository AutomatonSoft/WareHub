# WareHub

WareHub is a clean monorepo for the future consolidated platform layout.

Current target layout:

- `apps/backend`
- `apps/frontend`
- `apps/mobile`
- `services/database-service`
- `services/orchestrator`
- `infra`
- `docs`
- `tools`

Current rules:

- No real secrets may be stored in the repository.
- CI/CD workflows will be added in later slices.
- Old repositories remain the source of truth until code migration is completed.
- Local development recovery is documented in `docs/runbooks/local-dev.md`.
- Slice 3B restores monorepo-safe local dependency startup without touching stage or production deploy flows.
