# Kaufland publication confirmation

Product upload returns HTTP 202 after the upstream service accepts the request.
This acknowledges submission, not a live listing. The orchestrator then records
the submitted EAN on the KID; its Kaufland status remains false until confirmed.

`KauflandPublication` stores pending checks separately for JV and XL. The first
check is due one hour after submission. Pending and temporarily unavailable
listings are checked hourly without a 72-hour cutoff. A listing becomes green
only when the status response matches the EAN and account and both `is_live` and
`is_valid` are true. Confirmed listings stop polling. A new submission resets
confirmation; successful deactivation cancels pending checks.

The orchestrator worker calls authenticated
`POST /api/v1/kaufland/publications/sync/` every minute. Each tick processes up to
10 due records; it does not query the marketplace for records that are not due.
Enable the existing job worker and configure the shared service token in both
services, as for OTTO publication checks.

Before releasing this code, explicitly apply migration
`kaufland.0002_kauflandpublication` using the normal backup and migration approval
process. Do not start the new worker against an unmigrated database. Deploy both
database-service and orchestrator. Existing untracked uploads are not backfilled.
