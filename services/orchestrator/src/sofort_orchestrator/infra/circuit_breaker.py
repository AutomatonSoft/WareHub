from __future__ import annotations

import time
from dataclasses import dataclass
from threading import Lock


@dataclass
class _CircuitState:
    consecutive_failures: int = 0
    open_until_unix: float = 0.0


class InMemoryCircuitBreaker:
    def __init__(self, *, failure_threshold: int, open_seconds: float, enabled: bool = True) -> None:
        self.failure_threshold = max(1, failure_threshold)
        self.open_seconds = max(0.1, open_seconds)
        self.enabled = enabled
        self._lock = Lock()
        self._states: dict[str, _CircuitState] = {}

    def allow_request(self, key: str) -> bool:
        if not self.enabled:
            return True
        now = time.time()
        with self._lock:
            state = self._states.get(key)
            if state is None:
                return True
            return state.open_until_unix <= now

    def record_success(self, key: str) -> None:
        if not self.enabled:
            return
        with self._lock:
            state = self._states.setdefault(key, _CircuitState())
            state.consecutive_failures = 0
            state.open_until_unix = 0.0

    def record_failure(self, key: str) -> None:
        if not self.enabled:
            return
        now = time.time()
        with self._lock:
            state = self._states.setdefault(key, _CircuitState())
            state.consecutive_failures += 1
            if state.consecutive_failures >= self.failure_threshold:
                state.open_until_unix = now + self.open_seconds

    def snapshot(self) -> dict:
        now = time.time()
        with self._lock:
            items = list(self._states.items())
            threshold = self.failure_threshold
            open_seconds = self.open_seconds
            enabled = self.enabled

        open_keys = [key for key, state in items if state.open_until_unix > now]
        return {
            "enabled": enabled,
            "failure_threshold": threshold,
            "open_seconds": open_seconds,
            "tracked_channels_total": len(items),
            "open_channels_total": len(open_keys),
            "open_channels": open_keys,
        }
