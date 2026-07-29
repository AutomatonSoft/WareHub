from __future__ import annotations

import asyncio
import logging

import httpx


async def run_otto_category_scheduler(*, base_url: str, token: str, poll_interval_seconds: float) -> None:
    logger = logging.getLogger(__name__)
    url = f"{base_url.rstrip('/')}/api/v1/otto/categories/sync/"
    while True:
        delay_seconds = poll_interval_seconds
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers={"x-warehub-service-token": token})
                response.raise_for_status()
        except httpx.HTTPError:
            logger.exception("OTTO category cache synchronization failed")
            delay_seconds = min(poll_interval_seconds, 60.0)
        await asyncio.sleep(delay_seconds)
