from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager

from ..domain.models import ErrorContract, JobStatus
from ..domain.product_editor_models import ProductEditorGroupId, ProductEditorRiskLevel


class SqliteProductEditorStore:
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
                CREATE TABLE IF NOT EXISTS product_editor_plans (
                    plan_id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL,
                    ean TEXT NOT NULL,
                    active_group TEXT NOT NULL,
                    selected_target_ids_json TEXT NOT NULL,
                    changed_fields_json TEXT NOT NULL,
                    draft_json TEXT NOT NULL,
                    warnings_json TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    summary_json TEXT NOT NULL,
                    created_at_unix_ms INTEGER NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS product_editor_jobs (
                    job_id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL,
                    plan_id TEXT NOT NULL,
                    ean TEXT NOT NULL,
                    active_group TEXT NOT NULL,
                    status TEXT NOT NULL,
                    summary_json TEXT NOT NULL,
                    targets_json TEXT NOT NULL,
                    error_json TEXT NULL,
                    created_at_unix_ms INTEGER NOT NULL,
                    updated_at_unix_ms INTEGER NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pe_jobs_plan_id ON product_editor_jobs (plan_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pe_jobs_status ON product_editor_jobs (status)")
            conn.commit()

    def create_plan(
        self,
        *,
        plan_id: str,
        request_id: str,
        ean: str,
        active_group: ProductEditorGroupId,
        selected_target_ids: list[str],
        changed_fields: list[str],
        draft: dict,
        warnings: list[dict],
        risk_level: ProductEditorRiskLevel,
        summary: dict,
    ) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO product_editor_plans (
                    plan_id, request_id, ean, active_group, selected_target_ids_json, changed_fields_json, draft_json,
                    warnings_json, risk_level, summary_json, created_at_unix_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    plan_id,
                    request_id,
                    ean,
                    active_group.value,
                    json.dumps(selected_target_ids, ensure_ascii=False),
                    json.dumps(changed_fields, ensure_ascii=False),
                    json.dumps(draft, ensure_ascii=False),
                    json.dumps(warnings, ensure_ascii=False),
                    risk_level.value,
                    json.dumps(summary, ensure_ascii=False),
                    now,
                ),
            )
            conn.commit()

    def get_plan(self, *, plan_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT plan_id, request_id, ean, active_group, selected_target_ids_json, changed_fields_json,
                       draft_json, warnings_json, risk_level, summary_json, created_at_unix_ms
                FROM product_editor_plans
                WHERE plan_id = ?
                """,
                (plan_id,),
            ).fetchone()
            conn.commit()
        if row is None:
            return None
        return {
            "plan_id": row[0],
            "request_id": row[1],
            "ean": row[2],
            "active_group": ProductEditorGroupId(row[3]),
            "selected_target_ids": json.loads(row[4]),
            "changed_fields": json.loads(row[5]),
            "draft": json.loads(row[6]),
            "warnings": json.loads(row[7]),
            "risk_level": ProductEditorRiskLevel(row[8]),
            "summary": json.loads(row[9]),
            "created_at_unix_ms": int(row[10]),
        }

    def create_job(
        self,
        *,
        job_id: str,
        request_id: str,
        plan_id: str,
        ean: str,
        active_group: ProductEditorGroupId,
    ) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO product_editor_jobs (
                    job_id, request_id, plan_id, ean, active_group, status, summary_json, targets_json, error_json,
                    created_at_unix_ms, updated_at_unix_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                """,
                (
                    job_id,
                    request_id,
                    plan_id,
                    ean,
                    active_group.value,
                    JobStatus.QUEUED.value,
                    json.dumps({}, ensure_ascii=False),
                    json.dumps([], ensure_ascii=False),
                    now,
                    now,
                ),
            )
            conn.commit()

    def mark_running(self, *, job_id: str) -> None:
        self._update_status(job_id=job_id, status=JobStatus.RUNNING)

    def mark_completed(self, *, job_id: str, summary: dict, targets: list[dict]) -> None:
        self._update_terminal_status(job_id=job_id, status=JobStatus.COMPLETED, summary=summary, targets=targets, error=None)

    def mark_failed(self, *, job_id: str, summary: dict, targets: list[dict], error: ErrorContract | None) -> None:
        self._update_terminal_status(job_id=job_id, status=JobStatus.FAILED, summary=summary, targets=targets, error=error)

    def claim_next_queued_job(self) -> dict | None:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                """
                SELECT job_id, request_id, plan_id, ean, active_group, status, summary_json, targets_json, error_json,
                       created_at_unix_ms, updated_at_unix_ms
                FROM product_editor_jobs
                WHERE status = ? AND active_group IN (?, ?)
                ORDER BY created_at_unix_ms ASC
                LIMIT 1
                """,
                (JobStatus.QUEUED.value, ProductEditorGroupId.HOOD.value, ProductEditorGroupId.KAUFLAND.value),
            ).fetchone()
            if row is None:
                conn.commit()
                return None
            now = _now_ms()
            conn.execute(
                "UPDATE product_editor_jobs SET status = ?, updated_at_unix_ms = ? WHERE job_id = ?",
                (JobStatus.RUNNING.value, now, row[0]),
            )
            conn.commit()
        return self._job_from_row(row, status=JobStatus.RUNNING, updated_at_unix_ms=now)

    def count_jobs(self, *, query: str) -> int:
        pattern = _search_pattern(query)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM product_editor_jobs WHERE ean LIKE ? ESCAPE '\\'",
                (pattern,),
            ).fetchone()
            conn.commit()
        return int(row[0]) if row is not None else 0

    def list_jobs(self, *, limit: int, offset: int = 0, query: str = "") -> list[dict]:
        pattern = _search_pattern(query)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT job_id, request_id, plan_id, ean, active_group, status, summary_json, targets_json, error_json,
                       created_at_unix_ms, updated_at_unix_ms
                FROM product_editor_jobs
                WHERE ean LIKE ? ESCAPE '\\'
                ORDER BY created_at_unix_ms DESC
                LIMIT ? OFFSET ?
                """,
                (pattern, limit, offset),
            ).fetchall()
            conn.commit()
        return [self._job_from_row(row) for row in rows]
    def get_job(self, *, job_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT job_id, request_id, plan_id, ean, active_group, status, summary_json, targets_json, error_json,
                       created_at_unix_ms, updated_at_unix_ms
                FROM product_editor_jobs
                WHERE job_id = ?
                """,
                (job_id,),
            ).fetchone()
            conn.commit()
        if row is None:
            return None
        return self._job_from_row(row)

    @staticmethod
    def _job_from_row(row, *, status: JobStatus | None = None, updated_at_unix_ms: int | None = None) -> dict:
        return {
            "job_id": row[0],
            "request_id": row[1],
            "plan_id": row[2],
            "ean": row[3],
            "active_group": ProductEditorGroupId(row[4]),
            "status": status or JobStatus(row[5]),
            "summary": json.loads(row[6]),
            "targets": json.loads(row[7]),
            "error": ErrorContract(**json.loads(row[8])) if row[8] else None,
            "created_at_unix_ms": int(row[9]),
            "updated_at_unix_ms": updated_at_unix_ms if updated_at_unix_ms is not None else int(row[10]),
        }

    def _update_status(self, *, job_id: str, status: JobStatus) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                "UPDATE product_editor_jobs SET status = ?, updated_at_unix_ms = ? WHERE job_id = ?",
                (status.value, now, job_id),
            )
            conn.commit()

    def _update_terminal_status(
        self,
        *,
        job_id: str,
        status: JobStatus,
        summary: dict,
        targets: list[dict],
        error: ErrorContract | None,
    ) -> None:
        now = _now_ms()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE product_editor_jobs
                SET status = ?, summary_json = ?, targets_json = ?, error_json = ?, updated_at_unix_ms = ?
                WHERE job_id = ?
                """,
                (
                    status.value,
                    json.dumps(summary, ensure_ascii=False),
                    json.dumps(targets, ensure_ascii=False),
                    json.dumps(error.model_dump(), ensure_ascii=False) if error is not None else None,
                    now,
                    job_id,
                ),
            )
            conn.commit()


def _now_ms() -> int:
    return int(time.time() * 1000)


def _search_pattern(query: str) -> str:
    escaped = query.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
