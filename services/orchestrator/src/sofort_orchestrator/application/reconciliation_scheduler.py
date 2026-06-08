from __future__ import annotations

import asyncio
import uuid

from ..domain.models import Operation, OrchestrateRequest
from ..infra.job_store import SqliteJobStore


async def run_reconciliation_scheduler(
    *,
    job_store: SqliteJobStore,
    poll_interval_seconds: float = 5.0,
    reports_ttl_seconds: int = 604800,
    reports_max_per_ean: int = 50,
) -> None:
    while True:
        job_store.cleanup_reconciliation_reports(
            ttl_seconds=reports_ttl_seconds,
            max_per_ean=reports_max_per_ean,
        )
        pending_reports = job_store.list_reconciliation_reports_pending_repair(limit=20)
        for report in pending_reports:
            ean = report["ean"]
            if job_store.has_active_job_for_ean(ean=ean):
                continue
            desired: OrchestrateRequest = report["desired_command"]
            drifted_targets = {item.target for item in report["diffs"] if item.has_drift}
            if not drifted_targets:
                continue
            channels = [channel for channel in desired.channels if _target_label(channel) in drifted_targets]
            if not channels:
                continue

            job_id = str(uuid.uuid4())
            repair_command = OrchestrateRequest(
                operation=Operation.UPDATE,
                payload=desired.payload,
                channels=channels,
            )
            job_store.create_job(
                job_id=job_id,
                request_id=report["request_id"],
                ean=ean,
                command=repair_command,
            )
            job_store.set_reconciliation_report_repair_job(report_id=report["report_id"], repair_job_id=job_id)
        await asyncio.sleep(poll_interval_seconds)


def _target_label(channel) -> str:
    parts = [channel.marketplace.value]
    if channel.account:
        parts.append(f"account={channel.account}")
    if channel.profile:
        parts.append(f"profile={channel.profile}")
    if channel.site:
        parts.append(f"site={channel.site}")
    if channel.site_key:
        parts.append(f"site_key={channel.site_key}")
    return ",".join(parts)
