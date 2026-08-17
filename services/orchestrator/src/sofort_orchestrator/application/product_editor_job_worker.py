from __future__ import annotations

import asyncio

from ..application.product_editor_service import ProductEditorService
from ..domain.models import ErrorContract
from ..infra.product_editor_store import SqliteProductEditorStore


async def run_product_editor_job_worker(
    *,
    service: ProductEditorService,
    job_store: SqliteProductEditorStore,
    poll_interval_seconds: float = 0.2,
) -> None:
    while True:
        claimed = job_store.claim_next_queued_job()
        if claimed is None:
            await asyncio.sleep(poll_interval_seconds)
            continue

        job_id = claimed["job_id"]
        request_id = claimed["request_id"]
        try:
            service.execute_queued_job(job_id=job_id)
        except Exception as exc:  # noqa: BLE001
            job_store.mark_failed(
                job_id=job_id,
                summary={"supported": True, "success": 0, "failed": 1},
                targets=[],
                error=ErrorContract(
                    code="product_editor_job_execution_failed",
                    message="Product Editor background job execution failed.",
                    request_id=request_id,
                    details={"reason": str(exc)},
                ),
            )
