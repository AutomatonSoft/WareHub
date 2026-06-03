from __future__ import annotations

from threading import Lock


class InMemoryChannelLimiter:
    def __init__(self, *, max_inflight_per_key: int, enabled: bool = True) -> None:
        self.max_inflight_per_key = max(1, max_inflight_per_key)
        self.enabled = enabled
        self._lock = Lock()
        self._inflight: dict[str, int] = {}

    def try_acquire(self, key: str) -> bool:
        if not self.enabled:
            return True
        with self._lock:
            current = self._inflight.get(key, 0)
            if current >= self.max_inflight_per_key:
                return False
            self._inflight[key] = current + 1
            return True

    def release(self, key: str) -> None:
        if not self.enabled:
            return
        with self._lock:
            current = self._inflight.get(key, 0)
            if current <= 1:
                self._inflight.pop(key, None)
            else:
                self._inflight[key] = current - 1
