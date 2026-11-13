from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from ..domain.models import OrchestrateRequest


class ProductReviewStore:
    def __init__(self, db_path: str):
        self.db_path = db_path

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(Path(self.db_path).resolve().as_uri() + "?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
        finally:
            connection.close()

    def latest(self, *, limit: int, offset: int, query: str = "") -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute("""
                WITH candidates AS (
                    SELECT jobs.job_id, channel.key AS channel_index,
                        ROW_NUMBER() OVER (
                            PARTITION BY COALESCE(
                                CAST(json_extract(command_json, '$.kid_id') AS TEXT),
                                NULLIF(json_extract(command_json, '$.kid_number'), ''), ean
                            ), json_extract(channel.value, '$.marketplace'),
                            COALESCE(json_extract(channel.value, '$.profile'), json_extract(channel.value, '$.account'), ''),
                            COALESCE(json_extract(channel.value, '$.site_key'), json_extract(channel.value, '$.site'), '')
                            ORDER BY created_at_unix_ms DESC, jobs.rowid DESC
                        ) AS position
                    FROM orchestrator_jobs AS jobs, json_each(jobs.command_json, '$.channels') AS channel
                    WHERE operation IN ('publish', 'update')
                )
                SELECT jobs.*, json_extract(jobs.command_json, '$.channels[' || channel_index || ']') AS channel_json
                FROM candidates JOIN orchestrator_jobs AS jobs ON jobs.job_id = candidates.job_id
                WHERE position = 1
                    AND (instr(jobs.ean, ?) > 0 OR instr(COALESCE(json_extract(jobs.command_json, '$.kid_number'), ''), ?) > 0
                        OR instr(COALESCE(jobs.result_json, ''), ?) > 0)
                ORDER BY jobs.created_at_unix_ms DESC, jobs.job_id DESC LIMIT ? OFFSET ?
            """, (query, query, query, limit, offset)).fetchall()
        return [self._decode(row) for row in rows]

    def source(self, job_id: str, target: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM orchestrator_jobs WHERE job_id = ? AND operation IN ('publish', 'update')", (job_id,)).fetchone()
        if row is None:
            return None
        command = OrchestrateRequest.model_validate_json(row['command_json'])
        channel = next((item for item in command.channels if item.target_label() == target), None)
        if channel is None:
            return None
        value = dict(row)
        value['channel_json'] = channel.model_dump_json()
        return self._decode(value)

    def is_latest(self, source: dict) -> bool:
        with self._connect() as connection:
            rows = connection.execute("""
                SELECT job_id, command_json FROM orchestrator_jobs
                WHERE operation IN ('publish', 'update') AND
                    COALESCE(CAST(json_extract(command_json, '$.kid_id') AS TEXT),
                        NULLIF(json_extract(command_json, '$.kid_number'), ''), ean) = ?
                ORDER BY created_at_unix_ms DESC, rowid DESC
            """, (str(source['command'].kid_id or source['command'].kid_number or source['ean']),))
            for row in rows:
                command = OrchestrateRequest.model_validate_json(row['command_json'])
                if any(self._target_key(item) == self._target_key(source['channel']) for item in command.channels):
                    return row['job_id'] == source['job_id']
        return False

    @staticmethod
    def _target_key(channel):
        return channel.marketplace, channel.profile or channel.account or '', channel.site_key or channel.site or ''

    @staticmethod
    def _decode(row) -> dict:
        from ..domain.models import ChannelTarget
        return {
            'job_id': row['job_id'], 'request_id': row['request_id'], 'ean': row['ean'],
            'job_status': row['status'], 'created_at_unix_ms': row['created_at_unix_ms'],
            'command': OrchestrateRequest.model_validate_json(row['command_json']),
            'channel': ChannelTarget.model_validate_json(row['channel_json']),
            'result': json.loads(row['result_json']) if row['result_json'] else {},
            'error': json.loads(row['error_json']) if row['error_json'] else {},
        }
