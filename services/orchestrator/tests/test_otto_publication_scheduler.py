import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.sofort_orchestrator.application.otto_publication_scheduler import run_otto_publication_scheduler


@pytest.mark.parametrize("error", [None, httpx.ConnectError("unavailable")])
def test_publication_worker_posts_authenticated_tick_and_survives_transient_errors(error):
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock(side_effect=error)
    client.post.return_value = MagicMock()
    with patch("src.sofort_orchestrator.application.otto_publication_scheduler.httpx.AsyncClient", return_value=client), patch("src.sofort_orchestrator.application.otto_publication_scheduler.asyncio.sleep", AsyncMock(side_effect=asyncio.CancelledError())), pytest.raises(asyncio.CancelledError):
        asyncio.run(run_otto_publication_scheduler(base_url="http://services:8000/", token="test-token"))
    client.post.assert_awaited_once_with("http://services:8000/api/v1/otto/publications/sync/", headers={"x-warehub-service-token": "test-token"})
