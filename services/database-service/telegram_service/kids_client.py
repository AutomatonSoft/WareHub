from __future__ import annotations

from typing import Any

import requests

from .config import TelegramRuntimeConfig


class TelegramKidsClient:
    def __init__(self, config: TelegramRuntimeConfig) -> None:
        self.config = config

    def create_kid(
        self,
        *,
        kid_number: str,
        place: str,
        main_ean: str | None,
        quantity: int | None,
        price: str | None,
    ) -> dict[str, Any]:
        payload = {
            "kid_number": str(kid_number).strip(),
            "place": str(place).strip(),
        }
        if str(main_ean or "").strip():
            payload["main_ean"] = str(main_ean).strip()
        if quantity is not None:
            payload["quantity"] = int(quantity)
        if str(price or "").strip():
            payload["price"] = str(price).strip()
        response = requests.post(
            f"{self.config.services_base_url}/api/v1/kids/",
            json=payload,
            headers={
                "x-warehub-service-token": self.config.service_auth_token,
            },
            timeout=20,
        )
        try:
            response.raise_for_status()
        except requests.HTTPError as exc:
            response_text = (response.text or "").strip()
            if response_text:
                raise requests.HTTPError(
                    f"{exc}. Response body: {response_text}",
                    request=exc.request,
                    response=exc.response,
                ) from exc
            raise
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("Kids create returned non-object payload.")
        return {
            "status_code": response.status_code,
            "data": payload,
        }
