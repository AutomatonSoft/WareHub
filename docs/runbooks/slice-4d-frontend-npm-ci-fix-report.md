# Slice 4D - Frontend npm ci Dependency Fix Report

## 1. Summary

Slice 4D resolved the frontend `npm ci` dependency conflict for `apps/frontend`.

Result:

- `npm ci` is now green without using `--force` or `--legacy-peer-deps`;
- `npm run lint --if-present` passes with warnings only;
- `npm run typecheck --if-present` passes;
- `npm test --if-present` passes;
- frontend is now materially ready for CI onboarding, with one follow-up condition:
  - lint warnings should be treated as warnings, not blockers, unless the CI policy is intentionally stricter.

## 2. Git State

- Working directory: `I:\WareHub`
- Branch: `feature/slice-4d-frontend-npm-ci-fix`
- Preflight working tree: clean
- Recent `HEAD` includes Slice 4C merge:
  - `6c97e61 Merge pull request #19 from RavilkaDev0/feature/slice-4c-frontend-ci-bootstrap-validation`

## 3. Root Cause

Frontend install failed in Slice 4C because:

- project dependency:
  - `next@16.1.6`
- Storybook framework package in resolved 8.x line:
  - `@storybook/nextjs@8.6.18`
- peer range in that line:
  - `next: ^13.5.0 || ^14.0.0 || ^15.0.0`

This made plain `npm ci` impossible.

Additional discovery in Slice 4D:

- latest `@storybook/nextjs` is `10.4.2`
- latest line supports:
  - `next: ^14.1.0 || ^15.0.0 || ^16.0.0`
- official Storybook 10 docs also indicate that old addon packages such as:
  - `@storybook/addon-essentials`
  - `@storybook/addon-interactions`
  - `@storybook/test`
  should no longer remain as direct dependencies, and Storybook core package is now `storybook`

## 4. Dependency Changes

Changed files:

- `apps/frontend/package.json`
- `apps/frontend/package-lock.json`

Applied narrow dependency changes:

- updated:
  - `@storybook/nextjs` -> `^10.4.2`
- added:
  - `storybook` -> `^10.4.2`
- removed direct devDependencies:
  - `@storybook/addon-essentials`
  - `@storybook/addon-interactions`
  - `@storybook/test`

Important scope note:

- `next`, `react`, and `react-dom` were not changed
- no runtime frontend source files were intentionally changed

Lockfile update method:

- `npm install --package-lock-only`

Observed nuance:

- lockfile refresh completed successfully, but emitted peer override warnings while cleaning old Storybook 8-era resolution paths
- the final practical validation is `npm ci`, which became green

## 5. npm ci Result

Command executed:

- `npm ci`

Result:

- passed

Observed output summary:

- `added 1256 packages`
- audit completed
- warnings present for deprecated transitive packages
- no peer dependency failure remained

Conclusion:

- frontend dependency bootstrap is fixed for CI purposes

## 6. lint Result

Command executed:

- `npm run lint --if-present`

Result:

- passed with warnings

Observed summary:

- `0 errors`
- `15 warnings`

Warning categories observed:

- React hook dependency warnings
- Next.js `no-img-element` warnings
- Storybook story export style warnings

Interpretation:

- lint is CI-runnable now
- but current repo state is not lint-clean if warnings are escalated to failure

## 7. typecheck Result

Command executed:

- `npm run typecheck --if-present`

Result:

- passed

Observed summary:

- `next typegen` succeeded
- `tsc --noEmit --incremental false` succeeded

Important note:

- `next typegen` temporarily changed `apps/frontend/next-env.d.ts`
- that generated drift was reverted immediately to keep the slice inside the allowed file scope

## 8. test Result

Command executed:

- `npm test --if-present`

Result:

- passed

Observed summary:

- `120` tests passed
- `0` failed

Conclusion:

- the current lightweight frontend test script is CI-safe

## 9. Generated Files / Git Ignore Check

Post-validation git checks:

- `git status --ignored --short apps/frontend/node_modules` -> `!! apps/frontend/node_modules/`
- `node_modules` is correctly ignored

Other generated local artifacts:

- `apps/frontend/.next`
- `services/database-service/.venv`
- Python `__pycache__` directories under `services/database-service`

Classification:

- local ignored generated noise
- not tracked artifacts

Important scope control:

- `apps/frontend/next-env.d.ts` was generated/modified by `typecheck`, but reverted to its original tracked state before finishing the slice

## 10. CI Readiness Recommendation

Recommendation:

- frontend is now ready for CI onboarding

Recommended next slice:

- `Slice 4E` to add a frontend CI job

Recommended initial frontend CI checks:

- `npm ci`
- `npm run lint --if-present`
- `npm run typecheck --if-present`
- `npm test --if-present`

Policy recommendation:

- first add the frontend job as non-required until at least one green PR run is confirmed in GitHub Actions
- if branch protection later requires zero lint warnings, a separate lint cleanup slice will still be needed

## 11. Blockers

Hard blockers for frontend CI bootstrap: none remaining.

## 12. Warnings

- `npm install --package-lock-only` emitted peer override warnings during Storybook migration cleanup, even though final `npm ci` passed
- lint still reports `15` warnings
- local artifact scans show expected generated noise from `node_modules`, `.next`, and prior Python local bootstrap artifacts

## 13. Commands Run

Preflight:

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`

Discovery:

- `node --version`
- `npm --version`
- `Get-Content apps/frontend/package.json`
- `npm view @storybook/nextjs@8.6.18 peerDependencies`
- `npm view @storybook/nextjs@latest version`
- `npm view @storybook/nextjs@latest peerDependencies`
- `npm view storybook@latest version`
- `npm view @storybook/addon-essentials@latest version`
- `npm view @storybook/addon-interactions@latest version`
- `npm view @storybook/test@latest version`
- `npm view @storybook/addon-essentials@latest peerDependencies`
- `npm view @storybook/addon-interactions@latest peerDependencies`
- `npm view @storybook/test@latest peerDependencies`
- `npm view @storybook/addon-essentials@10.4.2 version`
- `npm view @storybook/addon-interactions@10.4.2 version`
- `npm view @storybook/test@10.4.2 version`
- `npm view storybook@10.4.2 version`
- `npm view @storybook/nextjs@10.4.2 dependencies`
- `npm view storybook@10.4.2 dependencies`
- `npm view @storybook/nextjs-vite@latest version`
- `npm view @storybook/nextjs-vite@latest peerDependencies`
- `.storybook` config inspection

Fix and validation:

- `npm install --package-lock-only`
- `npm ci`
- `npm run lint --if-present`
- `npm run typecheck --if-present`
- `npm test --if-present`
- `git status --short`
- `git diff --stat`
- `git status --ignored --short apps/frontend/node_modules`
- env scan
- forbidden dirs scan
- nested workflow scan

## 14. Next Step

Recommended next step:

- `Slice 4E` to add a frontend CI job into GitHub Actions using the now-validated commands:
  - `npm ci`
  - `npm run lint --if-present`
  - `npm run typecheck --if-present`
  - `npm test --if-present`

Secondary follow-up after CI onboarding:

- optional lint-warning cleanup slice if the team wants warning-free CI or stricter branch protection
