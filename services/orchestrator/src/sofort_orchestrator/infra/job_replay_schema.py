import argparse
from contextlib import closing
from pathlib import Path
import sqlite3


def migrate_job_replays(db_path: str) -> None:
    uri = Path(db_path).resolve().as_uri() + "?mode=rw"
    with closing(sqlite3.connect(uri, uri=True)) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='orchestrator_jobs'").fetchone() is None:
            raise RuntimeError("Expected an existing orchestrator jobs database.")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS orchestrator_job_replays (
                replay_key TEXT PRIMARY KEY,
                expires_at REAL NOT NULL,
                payload_json TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_job_replays_expires_at ON orchestrator_job_replays (expires_at)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Explicit additive migration for atomic queued-job replays.")
    parser.add_argument("--db-path", required=True)
    migrate_job_replays(parser.parse_args().db_path)
