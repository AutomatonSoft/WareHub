import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)


async def run_otto_publication_scheduler(*, base_url: str, token: str) -> None:
    async with httpx.AsyncClient(timeout=90.0) as client:
        while True:
            try:
                response = await client.post(
                    f"{base_url.rstrip('/')}/api/v1/otto/publications/sync/",
                    headers={"x-warehub-service-token": token},
                )
                response.raise_for_status()
            except httpx.HTTPError as error:
                logger.warning("OTTO_PUBLICATION_SYNC_UNAVAILABLE kind=%s status_code=%s", type(error).__name__,
                               getattr(getattr(error, "response", None), "status_code", None))
            await asyncio.sleep(10)
