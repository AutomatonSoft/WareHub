from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager

from ..domain.models import (
    ErrorContract,
    JobAttempt,
    JobDetailsResponse,
    JobEvent,
    JobPriority,
    JobStatus,
    Operation,
    OrchestrateRequest,
    OrchestrateResponse,
    ReconciliationDiffItem,
    ReconciliationReport,
)


class SqliteJobStore:
    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._ensure_schema()

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            yield conn
        finally:
            conn.close()

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS orchestrator_jobs (
                    job_id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL,
                    ean TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    command_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    priority TEXT NOT NULL DEFAULT 'normal',
                    created_at_unix_ms INTEGER NOT NULL,
                    updated_at_unix_ms INTEGER NOT NULL,
                    scheduled_at_unix_ms INTEGER NULL,
                    result_json TEXT NULL,
                    error_json TEXT NULL
                )
                """
            )
            cols = conn.execute("PRAGMA table_info(orchestrator_jobs)").fetchall()
            col_names = {row[1] for row in cols}
            if "command_json" not in col_names:
                conn.execute("ALTER TABLE orchestrator_jobs ADD COLUMN command_json TEXT NULL")
                conn.execute("UPDATE orchestrator_jobs SET command_json = '{}' WHERE command_json IS NULL")
            if "scheduled_at_unix_ms" not in col_names:
                conn.execute("ALTER TABLE orchestrator_jobs ADD COLUMN scheduled_at_unix_ms INTEGER NULL")
            if "priority" not in col_names:
                conn.execute("ALTER TABLE orchestrator_jobs ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS orchestrator_job_events (
                    job_id TEXT NOT NULL,
                    idx INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    at_unix_ms INTEGER NOT NULL,
                    details_json TEXT NOT NULL,
                    PRIMARY KEY (job_id, idx)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS orchestrator_job_attempts (
                    job_id TEXT NOT NULL,
                    attempt_no INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    started_at_unix_ms INTEGER NOT NULL,
                    finished_at_unix_ms INTEGER NULL,
                    error_json TEXT NULL,
                    PRIMARY KEY (job_id, attempt_no)
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_orch_job_events_job_id ON orchestrator_job_events (job_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_orch_job_attempts_job_id ON orchestrator_job_attempts (job_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_orch_jobs_status_created ON orchestrator_jobs (status, created_at_unix_ms)")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS orchestrator_reconciliation_reports (
                    report_id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL,
                    ean TEXT NOT NULL,
                    created_at_unix_ms INTEGER NOT NULL,
                    total_channels INTEGER NOT NULL,
                    channels_with_drift INTEGER NOT NULL,
                    diffs_json TEXT NOT NULL,
                    desired_command_json TEXT NOT NULL,
                    repair_job_id TEXT NULL
                )
                """
            )
            cols = conn.execute("PRAGMA table_info(orchestrator_reconciliation_reports)").fetchall()
            col_names = {row[1] for row in cols}
            if "desired_command_json" not in col_names:
                conn.execute("ALTER TABLE orchestrator_reconciliation_reports ADD COLUMN desired_command_json TEXT NULL")
                conn.execute(
                    "UPDATE orchestrator_reconciliation_reports SET desired_command_json = '{}' WHERE desired_command_json IS NULL"
                )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_orch_recon_ean_created ON orchestrator_reconciliation_reports (ean, created_at_unix_ms DESC)")
            conn.commit()

    def create_job(
        self,
        *,
        job_id: str,
        request_id: str,
        ean: str,
        command: OrchestrateRequest,
        scheduled_at_unix_ms: int | None = None,
        priority: JobPriority = JobPriority.NORMAL,
    ) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO orchestrator_jobs (
                    job_id, request_id, ean, operation, command_json, status, priority, created_at_unix_ms, updated_at_unix_ms, scheduled_at_unix_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    request_id,
                    ean,
                    command.operation.value,
                    json.dumps(command.model_dump(), ensure_ascii=False),
                    JobStatus.QUEUED.value,
                    priority.value,
                    now,
                    now,
                    scheduled_at_unix_ms,
                ),
            )
            conn.execute(
                """
                INSERT INTO orchestrator_job_events (job_id, idx, event_type, at_unix_ms, details_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (job_id, 0, "job_created", now, json.dumps({}, ensure_ascii=False)),
            )
            conn.commit()

    def mark_running(self, *, job_id: str) -> bool:
        now = _now_ms()
        with self._connect() as conn:
            row = conn.execute("SELECT status FROM orchestrator_jobs WHERE job_id = ?", (job_id,)).fetchone()
            if row is None or row[0] != JobStatus.QUEUED.value:
                conn.commit()
                return False
            conn.execute("UPDATE orchestrator_jobs SET status = ?, updated_at_unix_ms = ? WHERE job_id = ?", (JobStatus.RUNNING.value, now, job_id))
            next_idx = self._next_event_idx(conn, job_id)
            conn.execute(
                """
                INSERT INTO orchestrator_job_events (job_id, idx, event_type, at_unix_ms, details_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (job_id, next_idx, "job_running", now, json.dumps({}, ensure_ascii=False)),
            )
            conn.commit()
            return True

    def mark_attempt_started(self, *, job_id: str) -> int:
        now = _now_ms()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(attempt_no), 0) FROM orchestrator_job_attempts WHERE job_id = ?",
                (job_id,),
            ).fetchone()
            next_attempt = (int(row[0]) if row and row[0] is not None else 0) + 1
            conn.execute(
                """
                INSERT INTO orchestrator_job_attempts (
                    job_id, attempt_no, status, started_at_unix_ms, finished_at_unix_ms, error_json
                ) VALUES (?, ?, ?, ?, NULL, NULL)
                """,
                (job_id, next_attempt, JobStatus.RUNNING.value, now),
            )
            conn.commit()
        return next_attempt

    def mark_attempt_finished(self, *, job_id: str, attempt_no: int, status: JobStatus, error: ErrorContract | None = None) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE orchestrator_job_attempts
                SET status = ?, finished_at_unix_ms = ?, error_json = ?
                WHERE job_id = ? AND attempt_no = ?
                """,
                (
                    status.value,
                    now,
                    json.dumps(error.model_dump(), ensure_ascii=False) if error is not None else None,
                    job_id,
                    attempt_no,
                ),
            )
            conn.commit()

    def mark_completed(self, *, job_id: str, result: OrchestrateResponse) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE orchestrator_jobs
                SET status = ?, updated_at_unix_ms = ?, result_json = ?, error_json = NULL
                WHERE job_id = ?
                """,
                (JobStatus.COMPLETED.value, now, json.dumps(result.model_dump(), ensure_ascii=False), job_id),
            )
            next_idx = self._next_event_idx(conn, job_id)
            conn.execute(
                """
                INSERT INTO orchestrator_job_events (job_id, idx, event_type, at_unix_ms, details_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    next_idx,
                    "job_completed",
                    now,
                    json.dumps({"status": result.status.value, "results_count": len(result.results)}, ensure_ascii=False),
                ),
            )
            conn.commit()

    def mark_failed(self, *, job_id: str, error: ErrorContract) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE orchestrator_jobs
                SET status = ?, updated_at_unix_ms = ?, error_json = ?
                WHERE job_id = ?
                """,
                (JobStatus.FAILED.value, now, json.dumps(error.model_dump(), ensure_ascii=False), job_id),
            )
            next_idx = self._next_event_idx(conn, job_id)
            conn.execute(
                """
                INSERT INTO orchestrator_job_events (job_id, idx, event_type, at_unix_ms, details_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (job_id, next_idx, "job_failed", now, json.dumps({"code": error.code}, ensure_ascii=False)),
            )
            conn.commit()

    def get_job(self, *, job_id: str) -> JobDetailsResponse | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                    job_id, request_id, ean, operation, status, priority, created_at_unix_ms, updated_at_unix_ms, scheduled_at_unix_ms, result_json, error_json
                FROM orchestrator_jobs
                WHERE job_id = ?
                """,
                (job_id,),
            ).fetchone()
            conn.commit()
        if row is None:
            return None
        result = OrchestrateResponse(**json.loads(row[9])) if row[9] else None
        error = ErrorContract(**json.loads(row[10])) if row[10] else None
        return JobDetailsResponse(
            job_id=row[0],
            request_id=row[1],
            ean=row[2],
            operation=Operation(row[3]),
            status=JobStatus(row[4]),
            priority=JobPriority(row[5]),
            created_at_unix_ms=int(row[6]),
            updated_at_unix_ms=int(row[7]),
            scheduled_at_unix_ms=int(row[8]) if row[8] is not None else None,
            result=result,
            error=error,
        )

    def get_job_command(self, *, job_id: str) -> OrchestrateRequest | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT command_json
                FROM orchestrator_jobs
                WHERE job_id = ?
                """,
                (job_id,),
            ).fetchone()
            conn.commit()
        if row is None or not row[0]:
            return None
        return OrchestrateRequest(**json.loads(row[0]))

    def claim_next_queued_job(self) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT job_id, request_id, ean, command_json
                FROM orchestrator_jobs
                WHERE status = ?
                AND (scheduled_at_unix_ms IS NULL OR scheduled_at_unix_ms <= ?)
                ORDER BY
                    CASE priority
                        WHEN 'urgent' THEN 0
                        WHEN 'normal' THEN 1
                        ELSE 2
                    END ASC,
                    created_at_unix_ms ASC
                LIMIT 1
                """,
                (JobStatus.QUEUED.value, _now_ms()),
            ).fetchone()
            if row is None:
                conn.commit()
                return None
            job_id = row[0]
            request_id = row[1]
            ean = row[2]
            command_json = row[3]
            if not self.mark_running(job_id=job_id):
                conn.commit()
                return None
            conn.commit()
        return {
            "job_id": job_id,
            "request_id": request_id,
            "ean": ean,
            "command": OrchestrateRequest(**json.loads(command_json)),
        }

    def get_job_events(self, *, job_id: str) -> list[JobEvent]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT event_type, at_unix_ms, details_json
                FROM orchestrator_job_events
                WHERE job_id = ?
                ORDER BY idx ASC
                """,
                (job_id,),
            ).fetchall()
            conn.commit()
        return [
            JobEvent(event_type=row[0], at_unix_ms=int(row[1]), details=json.loads(row[2]) if row[2] else {})
            for row in rows
        ]

    def get_job_attempts(self, *, job_id: str) -> list[JobAttempt]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT attempt_no, status, started_at_unix_ms, finished_at_unix_ms, error_json
                FROM orchestrator_job_attempts
                WHERE job_id = ?
                ORDER BY attempt_no ASC
                """,
                (job_id,),
            ).fetchall()
            conn.commit()
        attempts: list[JobAttempt] = []
        for row in rows:
            attempts.append(
                JobAttempt(
                    attempt_no=int(row[0]),
                    status=JobStatus(row[1]),
                    started_at_unix_ms=int(row[2]),
                    finished_at_unix_ms=int(row[3]) if row[3] is not None else None,
                    error=ErrorContract(**json.loads(row[4])) if row[4] else None,
                )
            )
        return attempts

    def create_reconciliation_report(
        self,
        *,
        report_id: str,
        request_id: str,
        ean: str,
        total_channels: int,
        channels_with_drift: int,
        diffs: list[ReconciliationDiffItem],
        desired_command: OrchestrateRequest,
        repair_job_id: str | None,
    ) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO orchestrator_reconciliation_reports (
                    report_id, request_id, ean, created_at_unix_ms, total_channels, channels_with_drift, diffs_json, desired_command_json, repair_job_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    report_id,
                    request_id,
                    ean,
                    now,
                    total_channels,
                    channels_with_drift,
                    json.dumps([item.model_dump() for item in diffs], ensure_ascii=False),
                    json.dumps(desired_command.model_dump(), ensure_ascii=False),
                    repair_job_id,
                ),
            )
            conn.commit()

    def get_reconciliation_report(self, *, report_id: str) -> ReconciliationReport | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT report_id, request_id, ean, created_at_unix_ms, total_channels, channels_with_drift, diffs_json, repair_job_id
                FROM orchestrator_reconciliation_reports
                WHERE report_id = ?
                """,
                (report_id,),
            ).fetchone()
            conn.commit()
        if row is None:
            return None
        return ReconciliationReport(
            report_id=row[0],
            request_id=row[1],
            ean=row[2],
            created_at_unix_ms=int(row[3]),
            total_channels=int(row[4]),
            channels_with_drift=int(row[5]),
            diffs=[ReconciliationDiffItem(**item) for item in json.loads(row[6])],
            repair_job_id=row[7],
        )

    def list_reconciliation_reports_by_ean(self, *, ean: str, limit: int = 20) -> list[ReconciliationReport]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT report_id, request_id, ean, created_at_unix_ms, total_channels, channels_with_drift, diffs_json, repair_job_id
                FROM orchestrator_reconciliation_reports
                WHERE ean = ?
                ORDER BY created_at_unix_ms DESC
                LIMIT ?
                """,
                (ean, limit),
            ).fetchall()
            conn.commit()
        reports: list[ReconciliationReport] = []
        for row in rows:
            reports.append(
                ReconciliationReport(
                    report_id=row[0],
                    request_id=row[1],
                    ean=row[2],
                    created_at_unix_ms=int(row[3]),
                    total_channels=int(row[4]),
                    channels_with_drift=int(row[5]),
                    diffs=[ReconciliationDiffItem(**item) for item in json.loads(row[6])],
                    repair_job_id=row[7],
                )
            )
        return reports

    def list_reconciliation_reports_pending_repair(self, *, limit: int = 20) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT report_id, request_id, ean, diffs_json, desired_command_json
                FROM orchestrator_reconciliation_reports
                WHERE channels_with_drift > 0 AND repair_job_id IS NULL
                ORDER BY created_at_unix_ms ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
            conn.commit()
        items: list[dict] = []
        for row in rows:
            items.append(
                {
                    "report_id": row[0],
                    "request_id": row[1],
                    "ean": row[2],
                    "diffs": [ReconciliationDiffItem(**item) for item in json.loads(row[3])],
                    "desired_command": OrchestrateRequest(**json.loads(row[4])),
                }
            )
        return items

    def set_reconciliation_report_repair_job(self, *, report_id: str, repair_job_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE orchestrator_reconciliation_reports SET repair_job_id = ? WHERE report_id = ?",
                (repair_job_id, report_id),
            )
            conn.commit()

    def has_active_job_for_ean(self, *, ean: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT 1
                FROM orchestrator_jobs
                WHERE ean = ? AND status IN (?, ?)
                LIMIT 1
                """,
                (ean, JobStatus.QUEUED.value, JobStatus.RUNNING.value),
            ).fetchone()
            conn.commit()
        return row is not None

    def cleanup_reconciliation_reports(self, *, ttl_seconds: int, max_per_ean: int) -> dict:
        now_ms = _now_ms()
        deleted_by_ttl = 0
        deleted_by_limit = 0
        with self._connect() as conn:
            if ttl_seconds > 0:
                threshold_ms = now_ms - (ttl_seconds * 1000)
                cursor = conn.execute(
                    "DELETE FROM orchestrator_reconciliation_reports WHERE created_at_unix_ms < ?",
                    (threshold_ms,),
                )
                deleted_by_ttl = int(cursor.rowcount if cursor.rowcount is not None else 0)
            if max_per_ean > 0:
                eans = conn.execute("SELECT DISTINCT ean FROM orchestrator_reconciliation_reports").fetchall()
                for (ean_value,) in eans:
                    overflow = conn.execute(
                        """
                        SELECT report_id
                        FROM orchestrator_reconciliation_reports
                        WHERE ean = ?
                        ORDER BY created_at_unix_ms DESC
                        LIMIT -1 OFFSET ?
                        """,
                        (ean_value, max_per_ean),
                    ).fetchall()
                    if not overflow:
                        continue
                    report_ids = [row[0] for row in overflow]
                    placeholders = ",".join(["?"] * len(report_ids))
                    cursor = conn.execute(
                        f"DELETE FROM orchestrator_reconciliation_reports WHERE report_id IN ({placeholders})",
                        report_ids,
                    )
                    deleted_by_limit += int(cursor.rowcount if cursor.rowcount is not None else 0)
            conn.commit()
        return {"deleted_by_ttl": deleted_by_ttl, "deleted_by_limit": deleted_by_limit}

    def metrics(self) -> dict:
        with self._connect() as conn:
            total_row = conn.execute("SELECT COUNT(1) FROM orchestrator_jobs").fetchone()
            status_rows = conn.execute(
                """
                SELECT status, COUNT(1)
                FROM orchestrator_jobs
                GROUP BY status
                """
            ).fetchall()
            priority_rows = conn.execute(
                """
                SELECT priority, COUNT(1)
                FROM orchestrator_jobs
                GROUP BY priority
                """
            ).fetchall()
            recon_row = conn.execute("SELECT COUNT(1) FROM orchestrator_reconciliation_reports").fetchone()
            conn.commit()
        jobs_total = int(total_row[0]) if total_row and total_row[0] is not None else 0
        recon_total = int(recon_row[0]) if recon_row and recon_row[0] is not None else 0
        jobs_by_status = {str(row[0]): int(row[1]) for row in status_rows}
        jobs_by_priority = {str(row[0]): int(row[1]) for row in priority_rows}
        return {
            "jobs_total": jobs_total,
            "jobs_by_status": jobs_by_status,
            "jobs_by_priority": jobs_by_priority,
            "reconciliation_reports_total": recon_total,
        }

    @staticmethod
    def _next_event_idx(conn, job_id: str) -> int:
        row = conn.execute("SELECT COALESCE(MAX(idx), -1) FROM orchestrator_job_events WHERE job_id = ?", (job_id,)).fetchone()
        max_idx = int(row[0]) if row and row[0] is not None else -1
        return max_idx + 1


def _now_ms() -> int:
    return int(time.time() * 1000)
