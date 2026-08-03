import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.sofort_orchestrator.application.otto_category_scheduler import run_otto_category_scheduler


def test_otto_category_scheduler_retries_transient_connection_failure_without_exception_log():
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock(side_effect=httpx.ConnectError("services unavailable"))
    sleep = AsyncMock(side_effect=asyncio.CancelledError())
    logger = MagicMock()

    with (
        patch("src.sofort_orchestrator.application.otto_category_scheduler.httpx.AsyncClient", return_value=client),
        patch("src.sofort_orchestrator.application.otto_category_scheduler.asyncio.sleep", sleep),
        patch("src.sofort_orchestrator.application.otto_category_scheduler.logging.getLogger", return_value=logger),
        pytest.raises(asyncio.CancelledError),
    ):
        asyncio.run(
            run_otto_category_scheduler(
                base_url="http://services:8000",
                token="test-token",
                poll_interval_seconds=3600,
            )
        )

    logger.warning.assert_called_once()
    logger.exception.assert_not_called()
    sleep.assert_awaited_once_with(5.0)
