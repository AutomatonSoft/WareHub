from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager

from ..domain.marketplace_job_models import (
    MarketplaceToggleExecutionResult,
    MarketplaceToggleJobResponse,
)
from ..domain.models import ErrorContract, JobStatus


class SqliteMarketplaceJobStore:
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
                CREATE TABLE IF NOT EXISTS marketplace_toggle_jobs (
                    job_id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL,
                    kid_number TEXT NOT NULL,
                    inactive INTEGER NOT NULL,
                    place TEXT NULL,
                    workspace TEXT NOT NULL DEFAULT 'sofort',
                    actor_login TEXT NULL,
                    actor_name TEXT NULL,
                    status TEXT NOT NULL,
                    result_status TEXT NULL,
                    result_json TEXT NULL,
                    error_json TEXT NULL,
                    created_at_unix_ms INTEGER NOT NULL,
                    updated_at_unix_ms INTEGER NOT NULL
                )
                """
            )
            columns = {str(row[1]) for row in conn.execute("PRAGMA table_info(marketplace_toggle_jobs)").fetchall()}
            if "place" not in columns:
                conn.execute("ALTER TABLE marketplace_toggle_jobs ADD COLUMN place TEXT NULL")
            if "workspace" not in columns:
                conn.execute("ALTER TABLE marketplace_toggle_jobs ADD COLUMN workspace TEXT NOT NULL DEFAULT 'sofort'")
            if "actor_login" not in columns:
                conn.execute("ALTER TABLE marketplace_toggle_jobs ADD COLUMN actor_login TEXT NULL")
            if "actor_name" not in columns:
                conn.execute("ALTER TABLE marketplace_toggle_jobs ADD COLUMN actor_name TEXT NULL")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_marketplace_toggle_jobs_status_created ON marketplace_toggle_jobs (status, created_at_unix_ms)")
            conn.commit()

    def create_job(
        self,
        *,
        job_id: str,
        request_id: str,
        kid_number: str,
        inactive: bool,
        place: str | None = None,
        workspace: str = "sofort",
        actor_login: str | None = None,
        actor_name: str | None = None,
    ) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO marketplace_toggle_jobs (
                    job_id, request_id, kid_number, inactive, place, workspace, actor_login, actor_name, status, result_status, result_json, error_json, created_at_unix_ms, updated_at_unix_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
                """,
                (job_id, request_id, kid_number, 1 if inactive else 0, place, workspace, actor_login, actor_name, JobStatus.QUEUED.value, now, now),
            )
            conn.commit()

    def claim_next_queued_job(self) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT job_id, request_id, kid_number, inactive, place, workspace, actor_login, actor_name
                FROM marketplace_toggle_jobs
                WHERE status = ?
                ORDER BY created_at_unix_ms ASC
                LIMIT 1
                """,
                (JobStatus.QUEUED.value,),
            ).fetchone()
            if row is None:
                conn.commit()
                return None
            conn.execute(
                "UPDATE marketplace_toggle_jobs SET status = ?, updated_at_unix_ms = ? WHERE job_id = ? AND status = ?",
                (JobStatus.RUNNING.value, _now_ms(), row[0], JobStatus.QUEUED.value),
            )
            changed = conn.total_changes
            conn.commit()
        if changed == 0:
            return None
        return {
            "job_id": str(row[0]),
            "request_id": str(row[1]),
            "kid_number": str(row[2]),
            "inactive": bool(row[3]),
            "place": str(row[4]).strip() if row[4] is not None else None,
            "workspace": str(row[5]).strip() or "sofort",
            "actor_login": str(row[6]).strip() if row[6] is not None else "",
            "actor_name": str(row[7]).strip() if row[7] is not None else "",
        }

    def mark_completed(self, *, job_id: str, result: MarketplaceToggleExecutionResult) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE marketplace_toggle_jobs
                SET status = ?, result_status = ?, result_json = ?, error_json = NULL, updated_at_unix_ms = ?
                WHERE job_id = ?
                """,
                (
                    JobStatus.COMPLETED.value,
                    result.status,
                    json.dumps(result.model_dump(), ensure_ascii=False),
                    now,
                    job_id,
                ),
            )
            conn.commit()

    def mark_failed(self, *, job_id: str, error: ErrorContract) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE marketplace_toggle_jobs
                SET status = ?, result_status = 'failed', error_json = ?, updated_at_unix_ms = ?
                WHERE job_id = ?
                """,
                (JobStatus.FAILED.value, json.dumps(error.model_dump(), ensure_ascii=False), now, job_id),
            )
            conn.commit()

    def get_job(self, *, job_id: str) -> MarketplaceToggleJobResponse | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT job_id, request_id, kid_number, inactive, workspace, status, result_status, result_json, error_json
                FROM marketplace_toggle_jobs
                WHERE job_id = ?
                """,
                (job_id,),
            ).fetchone()
            conn.commit()
        if row is None:
            return None

        result = MarketplaceToggleExecutionResult(**json.loads(row[7])) if row[7] else None
        error = ErrorContract(**json.loads(row[8])) if row[8] else None
        job_status = JobStatus(row[5])
        external_status = str(row[6] or "").strip().lower()
        if job_status is JobStatus.QUEUED:
            status_value: str = "queued"
        elif job_status is JobStatus.RUNNING:
            status_value = "running"
        elif job_status is JobStatus.FAILED:
            status_value = "failed"
        else:
            status_value = external_status or "failed"

        return MarketplaceToggleJobResponse(
            job_id=str(row[0]),
            request_id=str(row[1]),
            kid_number=str(row[2]),
            inactive=bool(row[3]),
            workspace=str(row[4]).strip() or "sofort",
            job_status=job_status,
            status=status_value,  # type: ignore[arg-type]
            summary=result.summary if result is not None else None,
            results=result.results if result is not None else [],
            error=error,
        )


def _now_ms() -> int:
    return int(time.time() * 1000)
