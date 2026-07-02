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
        self._limits = httpx.Limits(max_connections=20, max_keepalive_connections=10)
        self._client: httpx.Client | None = None

    def _get_client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                timeout=self._timeout,
                trust_env=False,
                limits=self._limits,
            )
        return self._client

    def close(self) -> None:
        if self._client is None:
            return
        self._client.close()
        self._client = None

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str],
        params: dict | None = None,
        json: dict | list | None = None,
        timeout_seconds: float | None = None,
    ) -> httpx.Response:
        last_exc: Exception | None = None
        last_kind = "network"
        for attempt in range(self._retries + 1):
            try:
                request_timeout = timeout_seconds if timeout_seconds is not None and timeout_seconds > 0 else None
                response = self._get_client().request(
                    method,
                    url,
                    headers=headers,
                    params=params,
                    json=json,
                    timeout=request_timeout,
                )
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
