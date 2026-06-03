# Product Editor Release Notes

Last updated: 2026-05-22
Status: Release candidate notes for Product Editor MVP control-plane rollout

## Summary

Product Editor has been rebuilt as an orchestrator-driven workflow instead of a legacy direct-mutation page.

The new runtime flow is:

`Frontend -> Orchestrator -> source / marketplace services`

## Included in this release candidate

- Orchestrator Product Editor facade endpoints for:
  - `discover`
  - `load`
  - `plan`
  - `apply`
  - `jobs/{job_id}`
- Full `HOOD` Product Editor flow through Orchestrator
- Full `JV` Product Editor flow through Orchestrator
- Frontend Product Editor shell with:
  - target matrix
  - active-tab workflow
  - draft state
  - review / plan / apply / result flow
- Honest placeholder tabs for:
  - `XL`
  - `OTTO`
  - `KAUFLAND`
  - `EBAY`

## Safety changes

- No direct Product Editor frontend calls to:
  - Hood PATCH
  - JV update/apply
  - XL update/apply
  - Kaufland mutation endpoints
- No hidden sync-to-apply behavior in Product Editor
- Apply is active-tab scoped only
- Apply requires review/plan first
- Apply requires explicit confirmation
- `JV_MAIN` is excluded from Product Editor
- `JV_CO_UK` is never auto-baseline
- Removing images from product draft does not mean FTP delete
- File selection does not trigger upload

## Supported tabs

- `HOOD`: supported
- `JV`: supported
- `XL`: placeholder / read-only
- `OTTO`: planned / read-only
- `KAUFLAND`: planned / read-only
- `EBAY`: unsupported / planned

## Known limitations

- `HOOD` pending uploads remain local-only draft items and are rejected on apply until apply-time upload support is added
- `HOOD` and `JV` applies currently complete through synchronous downstream operations even though job/result UX exists
- `XL` editing is not enabled yet
- `OTTO`, `KAUFLAND`, and `EBAY` editing is not enabled yet
- Global cross-marketplace apply is intentionally not supported

## Operator notes

- Use one EAN at a time
- Review target scope before every apply
- Expect `JV` apply to affect all found JV sites in the active tab
- Expect `HOOD` apply to affect only the found HOOD account in the active tab

## Validation status

- Frontend typecheck: PASS
- Frontend unit tests: PASS
- Orchestrator Product Editor tests: PASS
- Orchestrator API regression tests: PASS

## Not in this release

- `JV_MAIN`
- direct frontend mutation endpoints
- FTP delete
- full `XL` editing
- `OTTO` editing
- `KAUFLAND` editing
- `EBAY` editing
