from __future__ import annotations

import time
from typing import Any

import requests

from .config import TelegramRuntimeConfig


class TelegramMarketplaceJobClient:
    def __init__(self, config: TelegramRuntimeConfig) -> None:
        self.config = config

    def create_job(self, *, kid_number: str, inactive: bool, place: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {
            "kid_number": str(kid_number).strip(),
            "inactive": bool(inactive),
        }
        if isinstance(place, str) and place.strip():
            body["place"] = place.strip()
        response = requests.post(
            f"{self.config.orchestrator_base_url}/api/v1/orchestrator/marketplace/toggle-by-kid",
            json=body,
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("Marketplace toggle job create returned non-object payload.")
        return payload

    def get_job(self, *, job_id: str) -> dict[str, Any]:
        response = requests.get(
            f"{self.config.orchestrator_base_url}/api/v1/orchestrator/marketplace/jobs/{job_id}",
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("Marketplace toggle job status returned non-object payload.")
        return payload

    def wait_for_job(self, *, job_id: str) -> dict[str, Any]:
        for _ in range(self.config.orchestrator_poll_attempts):
            payload = self.get_job(job_id=job_id)
            if str(payload.get("job_status") or "").strip().lower() in {"completed", "failed"}:
                return payload
            time.sleep(self.config.orchestrator_poll_interval_seconds)
        raise TimeoutError(f"Marketplace toggle job {job_id} polling timed out.")
