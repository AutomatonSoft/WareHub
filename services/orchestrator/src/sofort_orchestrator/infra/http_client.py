from __future__ import annotations

import time

import httpx


class RetryExhaustedError(RuntimeError):
    def __init__(self, message: str, kind: str) -> None:
        super().__init__(message)
        self.kind = kind


class HttpClient:
    def __init__(self, timeout_seconds: float, retries: int) -> None:
        # Allow disabling timeout via ORCHESTRATOR_HTTP_TIMEOUT_SECONDS<=0.
        self._timeout = timeout_seconds if timeout_seconds > 0 else None
        self._retries = retries

    def request(self, method: str, url: str, *, headers: dict[str, str], params: dict | None = None, json: dict | list | None = None) -> httpx.Response:
        last_exc: Exception | None = None
        last_kind = "network"
        for attempt in range(self._retries + 1):
            try:
                with httpx.Client(timeout=self._timeout) as client:
                    response = client.request(method, url, headers=headers, params=params, json=json)
                if response.status_code >= 500 and attempt < self._retries:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                return response
            except httpx.TimeoutException as exc:
                last_exc = exc
                last_kind = "timeout"
                if attempt >= self._retries:
                    raise RetryExhaustedError(str(exc), kind=last_kind) from exc
                time.sleep(0.2 * (attempt + 1))
            except (httpx.NetworkError, httpx.RemoteProtocolError) as exc:
                last_exc = exc
                last_kind = "network"
                if attempt >= self._retries:
                    raise RetryExhaustedError(str(exc), kind=last_kind) from exc
                time.sleep(0.2 * (attempt + 1))
        if last_exc:
            raise RetryExhaustedError(str(last_exc), kind=last_kind)
        raise RuntimeError("unreachable")
