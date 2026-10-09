# Atomic queued-job replay rollout

Scope: single and batch `/api/v1/orchestrator/jobs` endpoints only. No server change is authorized by this document.

## Before rollout

1. Obtain separate environment-specific rollout/migration approval. Resolve the actual jobs SQLite file from `Settings().jobs_sqlite_path` in the service's runtime working directory. Do not use the legacy idempotency database or the marketplace-toggle database.
2. Pause job intake and stop/drain old writers. Do not run old and new enqueue handlers together: old handlers cannot see the new transactional replay records.
3. Back up the jobs SQLite database using SQLite's backup API, or stop all writers and checkpoint WAL before a filesystem backup. A live copy of just the main file is not a reliable backup. Verify the backup can be opened.
4. With the new code available, run the explicit additive migration against that existing jobs file, from the orchestrator service directory:

   ```sh
   python -m src.sofort_orchestrator.infra.job_replay_schema --db-path /absolute/path/to/orchestrator_jobs.sqlite3
   ```

   Use the interpreter/environment belonging to the service. The command refuses to create a nonexistent database and requires the existing `orchestrator_jobs` table. Re-running it preserves jobs and replay records.
5. Start the new version and require `/api/v1/readyz` to return 200 before restoring intake. Without the replay table it returns 503; keyed enqueue requests are not supported on an unmigrated database.
6. On stage, send the same single/batch body and `Idempotency-Key` twice: responses must retain the same job IDs. Check that the queue contains only one set. Resume intake only after this smoke check.

## Compatibility and limits

- Replay expiration still uses `ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS`. A different body with the same header key remains a distinct request. Requests without a key can create new jobs every time.
- Unexpired old replay responses remain readable from the legacy database; new queued responses live only in the jobs database. Existing legacy idempotency metrics therefore exclude new queued replay records.
- This transaction protects local enqueue only. Synchronous updates, separate toggle/editor stores and external API effects require their own audit; it does not make external publication exactly-once.

## Rollback

Pause intake and stop new writers before reverting the application. Retain the additive table and existing jobs; do not drop tables or restore an old database over newly queued work. Old code ignores new replay records, so blind resubmission after rollback can duplicate jobs. Reconcile submitted job IDs first. Restoring a database backup is a separate recovery action requiring approval and reconciliation of jobs created since that backup.
