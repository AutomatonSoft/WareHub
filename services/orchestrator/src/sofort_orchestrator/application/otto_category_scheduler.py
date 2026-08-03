from __future__ import annotations

import asyncio
import logging

import httpx

_INITIAL_RETRY_DELAY_SECONDS = 5.0
_MAX_RETRY_DELAY_SECONDS = 60.0


async def run_otto_category_scheduler(*, base_url: str, token: str, poll_interval_seconds: float) -> None:
    logger = logging.getLogger(__name__)
    url = f"{base_url.rstrip('/')}/api/v1/otto/categories/sync/"
    retry_delay_seconds = _INITIAL_RETRY_DELAY_SECONDS
    while True:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers={"x-warehub-service-token": token})
                response.raise_for_status()
        except httpx.HTTPError as error:
            logger.warning(
                "OTTO_CATEGORY_CACHE_SYNC_RETRY url=%s retry_seconds=%s error=%s",
                url,
                retry_delay_seconds,
                error,
            )
            await asyncio.sleep(retry_delay_seconds)
            retry_delay_seconds = min(retry_delay_seconds * 2, _MAX_RETRY_DELAY_SECONDS)
            continue

        retry_delay_seconds = _INITIAL_RETRY_DELAY_SECONDS
        await asyncio.sleep(poll_interval_seconds)
