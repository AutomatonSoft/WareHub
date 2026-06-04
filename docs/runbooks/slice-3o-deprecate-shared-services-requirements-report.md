# Slice 3O — Deprecate Shared Services Requirements Report

## 1. Summary

Slice 3O explicitly deprecated `services/requirements.txt` as a legacy/shared manifest.

Result:

- `services/requirements.txt` now has a deprecation header
- documentation now states that active Python service bootstrap must use service-local manifests
- the shared manifest was not removed
- package lines inside `services/requirements.txt` were not changed

## 2. Git State

- `Get-Location`
  - `I:\WareHub`
- `git branch --show-current`
  - `feature/slice-3o-deprecate-shared-services-requirements`
- `git status --short` before changes
  - clean
- `git log --oneline -5`
  - `83f05fb Merge pull request #15 from RavilkaDev0/feature/slice-3n-python-services-dependency-policy`
  - `a45844e docs: add python services dependency policy report`
  - `d379ab6 Merge pull request #14 from RavilkaDev0/feature/slice-3m-database-service-requirements-cleanup`
  - `f3950a3 chore: clean up database service requirements`
  - `cb5c57d Merge pull request #13 from RavilkaDev0/feature/slice-3l-database-service-uv-bootstrap-validation`

## 3. Files Changed

- `services/requirements.txt`
- `services/README.md`
- `docs/runbooks/local-dev.md`
- `docs/runbooks/slice-3o-deprecate-shared-services-requirements-report.md`

## 4. Deprecation Policy

Policy established in this slice:

- `services/requirements.txt` is deprecated legacy/shared manifest
- it must not be used as the source of truth for active service bootstrap
- active manifests are:
  - `services/database-service/requirements.txt`
  - `services/orchestrator/requirements.txt`
- no new dependencies should be added to `services/requirements.txt`
- removal of the shared manifest requires a separate migration slice

## 5. Active Service Manifests

Confirmed active manifests:

- `services/database-service/requirements.txt`
- `services/orchestrator/requirements.txt`

Shared manifest status:

- `services/requirements.txt`
  - kept temporarily
  - legacy/manual compatibility only
  - not source of truth

## 6. services/requirements.txt Change

Change applied:

- added comment-only deprecation header at the top of the file

No package list changes:

- dependency lines were preserved exactly

## 7. Documentation Changes

Updated:

- `services/README.md`
- `docs/runbooks/local-dev.md`

What changed:

- documented service-local manifest ownership
- documented deprecation of `services/requirements.txt`
- documented that new dependencies must go to service-local manifests
- kept local bootstrap guidance aligned with existing no-auto-migrate policy

## 8. Validation Results

Commands run:

- `git status --short`
- `Get-Content services/requirements.txt -TotalCount 10`
- `rg -n "services/requirements\.txt|services/database-service/requirements\.txt|services/orchestrator/requirements\.txt|deprecated|source of truth" services/README.md docs/runbooks/local-dev.md services/requirements.txt`
- `git diff -- services/requirements.txt`
- env scan
- forbidden dirs scan
- `git status --ignored --short services/database-service/.venv`

Results:

- header present in `services/requirements.txt`
- docs reference service-local manifests correctly
- diff for `services/requirements.txt` is comment-header only
- env scan found only `.env.example` / `.env.*.example`
- `.venv` remains ignored

## 9. Risks

- developers may still have old habits pointing to `services/requirements.txt`
- historical reports and older notes still mention the shared manifest as previous source of truth

## 10. Blockers

- none for this policy slice

## 11. Warnings

- `services/database-service/.venv` may still produce ignored internal `__pycache__` directories during later work; this is expected local noise, not a tracked repo issue

## 12. Proposed Next Slice

- dedicated migration slice to remove or rename `services/requirements.txt` after final validation that no manual or scripted consumers remain
