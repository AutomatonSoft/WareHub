from __future__ import annotations

import asyncio

from ..domain.models import ErrorContract, JobStatus
from ..infra.job_store import SqliteJobStore
from .orchestrator_service import OrchestratorService


async def run_job_worker(*, service: OrchestratorService, job_store: SqliteJobStore, poll_interval_seconds: float = 0.2) -> None:
    while True:
        claimed = job_store.claim_next_queued_job()
        if claimed is None:
            await asyncio.sleep(poll_interval_seconds)
            continue

        job_id = claimed["job_id"]
        request_id = claimed["request_id"]
        ean = claimed["ean"]
        command = claimed["command"]
        attempt_no = job_store.mark_attempt_started(job_id=job_id)
        try:
            result = service.execute(ean=ean, request_id=request_id, command=command, job_id=job_id)
            job_store.mark_completed(job_id=job_id, result=result)
            job_store.mark_attempt_finished(job_id=job_id, attempt_no=attempt_no, status=JobStatus.COMPLETED)
        except Exception as exc:  # noqa: BLE001
            error = ErrorContract(
                code="orchestrator_job_execution_failed",
                message="Orchestrator job execution failed",
                request_id=request_id,
                details={"reason": str(exc)},
            )
            job_store.mark_failed(
                job_id=job_id,
                error=error,
            )
            job_store.mark_attempt_finished(job_id=job_id, attempt_no=attempt_no, status=JobStatus.FAILED, error=error)
