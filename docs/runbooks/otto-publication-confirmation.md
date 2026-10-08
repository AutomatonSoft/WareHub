# OTTO publication confirmation

## Contract

- `POST /api/v1/otto/{profile}/products/upsert/` returns HTTP 202 with `publication_state: pending` after the external service accepts a request. This is not proof of publication.
- The OTTO EAN mapping is retained even if subsequent validation fails. Other marketplaces retain their existing confirmation behaviour.
- `OttoPublication` stores one current submission per account/SKU, its OTTO process UUID, processing state, last confirmed visibility and field errors. Resubmission replaces the processing generation, not the last confirmed visibility.
- Only a matching account/SKU response containing `marketplace_status: ONLINE` and `is_live: true` confirms visibility. Successful task processing alone does not.
- Rejected updates can coexist with a previously published listing. Sofort list shows the update failure without incorrectly hiding confirmed live stock.
- Successful deactivation invalidates outstanding poll generations and clears tracked visibility. Activation queues a fresh visibility check, rather than reusing an old ONLINE snapshot.
- Sofort list displays the latest processing state alongside its EAN. Hover over it to see the error code, message and JSON field path. Its OTTO indicator cannot be manually overridden for tracked submissions.

## Background processing

The orchestrator starts a polling worker when its normal job worker is enabled and its service token is configured. No external create/update requests are retried by this poller: it only reads OTTO status. Each authenticated internal `POST /api/v1/otto/publications/sync/` claims one due row with a five-minute lease, performs bounded HTTP reads outside the database transaction, and conditionally saves the result only if its submission generation still matches. Unfinished checks are rescheduled after one minute. After 48 hours, the result becomes unconfirmed and automatic polling stops. Process restarts do not lose pending rows.

The external upsert OpenAPI currently has an unspecified response schema. Recognised OTTO process UUIDs are read from `processId`, `process_id`, `processUuid`, `otto_task_id`, `ottoTaskId` or update-task links, including nested response/result/data objects. An internal `task_id` is deliberately not treated as an OTTO process UUID. Without a recognised UUID, the state remains unconfirmed; visibility can still be checked. Obtain the real accepted-response contract before adding additional field aliases.

## Rollout and verification

1. Back up the database. Apply additive OTTO migration `0005_ottopublication` through the approved migration pipeline before deploying code that reads the new table. No server migration or deploy is performed by this patch.
2. Verify `ORCHESTRATOR_ENABLE_JOB_WORKER=1`, its existing service token and database-service allowed service hosts. Deploy database-service and orchestrator together, then frontend.
3. Submit a controlled JV and XL product: EAN must be retained while the indicator remains unconfirmed/pending.
4. Inspect an invalid allowed value: processing must become rejected with its original JSON field path. Inspect a valid request: only verified ONLINE may turn the indicator green.
5. Simulate a temporary status API failure and restart the worker: no duplicate product submission and no false publication success.
6. Existing EAN flags are not silently rewritten in this change. A historical reconciliation/backfill must be separately approved; do not infer past publication from an EAN or MOIN alone.

Rollback: stop the new worker and roll back application images together; retain the additive table and task records. Old application versions still have the old optimistic-confirmation behaviour, so rolling back reintroduces that limitation.
