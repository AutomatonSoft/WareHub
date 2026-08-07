from __future__ import annotations

import asyncio

from ..domain.models import ErrorContract
from ..infra.marketplace_job_store import SqliteMarketplaceJobStore
from .marketplace_job_service import MarketplaceJobService


async def run_marketplace_job_worker(
    *,
    service: MarketplaceJobService,
    job_store: SqliteMarketplaceJobStore,
    poll_interval_seconds: float = 0.2,
) -> None:
    while True:
        claimed = job_store.claim_next_queued_job()
        if claimed is None:
            await asyncio.sleep(poll_interval_seconds)
            continue

        job_id = claimed["job_id"]
        request_id = claimed["request_id"]
        kid_number = claimed["kid_number"]
        inactive = bool(claimed["inactive"])
        place = str(claimed["place"]).strip() if claimed.get("place") is not None else None
        actor_login = str(claimed.get("actor_login") or "").strip()
        actor_name = str(claimed.get("actor_name") or "").strip()
        try:
            result = service.execute(
                kid_number=kid_number,
                inactive=inactive,
                request_id=request_id,
                place=place,
                actor_login=actor_login,
                actor_name=actor_name,
            )
            job_store.mark_completed(job_id=job_id, result=result)
        except Exception as exc:  # noqa: BLE001
            error = ErrorContract(
                code="marketplace_toggle_job_execution_failed",
                message="Marketplace toggle job execution failed",
                request_id=request_id,
                details={"reason": str(exc)},
            )
            job_store.mark_failed(job_id=job_id, error=error)
