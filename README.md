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
- CI/CD is managed through GitHub Actions. `feature/*`, `fix/*`, `hotfix/*`,
  `integration/*`, `said/*` and `docs/*` changes go through a PR into `stage`.
  A merge into `stage` runs the automatic stage deploy. Promotion from `stage`
  to `main` is a separate PR and production deploy requires manual approval.
- Mobile APK releases use separate channel manifests. The public stable filenames
  are `warehubstage.apk` and `warehub.apk`; release metadata is published
  atomically so clients never observe a version before its APK is available.
- `Stage Mobile APK Release` is manual until its first signed release succeeds.
  It requires the stage signing-key secrets and `STAGE_APK_DEPLOY_PATH`; after
  that smoke test, enable its `push` trigger for `apps/mobile/**` changes only.
- Stage versions use SemVer prereleases such as `v0.2.0-stage.1`; production
  versions use stable SemVer such as `v0.2.0`. Keep the APK build number after
  `+` monotonically increasing in `apps/mobile/pubspec.yaml`.
- Old repositories remain the source of truth until code migration is completed.
- Local development recovery is documented in `docs/runbooks/local-dev.md`.
- Slice 3B restores monorepo-safe local dependency startup without touching stage or production deploy flows.
