from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager


class SqliteIdempotencyStore:
    def __init__(self, db_path: str, ttl_seconds: int) -> None:
        self.db_path = db_path
        self.ttl_seconds = ttl_seconds
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
                CREATE TABLE IF NOT EXISTS idempotency_records (
                    idem_key TEXT PRIMARY KEY,
                    expires_at REAL NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_idem_expires_at ON idempotency_records (expires_at)")
            conn.commit()

    def _cleanup(self, conn) -> None:
        conn.execute("DELETE FROM idempotency_records WHERE expires_at <= ?", (time.time(),))

    def get(self, key: str) -> dict | None:
        with self._connect() as conn:
            self._cleanup(conn)
            row = conn.execute(
                "SELECT payload_json FROM idempotency_records WHERE idem_key = ?",
                (key,),
            ).fetchone()
            conn.commit()
        if row is None:
            return None
        payload_json = row[0]
        return json.loads(payload_json)

    def put(self, key: str, payload: dict) -> None:
        expires_at = time.time() + self.ttl_seconds
        payload_json = json.dumps(payload, ensure_ascii=False)
        with self._connect() as conn:
            self._cleanup(conn)
            conn.execute(
                """
                INSERT INTO idempotency_records (idem_key, expires_at, payload_json)
                VALUES (?, ?, ?)
                ON CONFLICT(idem_key) DO UPDATE SET
                    expires_at=excluded.expires_at,
                    payload_json=excluded.payload_json
                """,
                (key, expires_at, payload_json),
            )
            conn.commit()

    def ping(self) -> bool:
        with self._connect() as conn:
            conn.execute("SELECT 1").fetchone()
            conn.commit()
        return True

    def metrics(self) -> dict:
        now = time.time()
        with self._connect() as conn:
            total_records = conn.execute("SELECT COUNT(*) FROM idempotency_records").fetchone()[0]
            active_records = conn.execute("SELECT COUNT(*) FROM idempotency_records WHERE expires_at > ?", (now,)).fetchone()[0]
            conn.commit()
        return {
            "idempotency_records_total": int(total_records),
            "idempotency_records_active": int(active_records),
        }
