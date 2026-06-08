from __future__ import annotations

from collections import Counter
from threading import Lock


LATENCY_BUCKETS_MS = (50, 100, 250, 500, 1000, 2000, 5000)


class InMemoryMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self._request_total = 0
        self._error_total = 0
        self._latency_histogram: Counter[str] = Counter()

    def record_request(self, *, status_code: int, latency_ms: float) -> None:
        bucket = _bucket_label(latency_ms)
        with self._lock:
            self._request_total += 1
            if status_code >= 400:
                self._error_total += 1
            self._latency_histogram[bucket] += 1

    def snapshot(self) -> dict:
        with self._lock:
            request_total = self._request_total
            error_total = self._error_total
            histogram = dict(self._latency_histogram)

        error_rate = (error_total / request_total) if request_total else 0.0
        return {
            "request_rate": {"total_requests": request_total},
            "error_rate": {"total_errors": error_total, "error_ratio": round(error_rate, 6)},
            "latency_histogram_ms": histogram,
        }


def _bucket_label(latency_ms: float) -> str:
    for upper in LATENCY_BUCKETS_MS:
        if latency_ms <= upper:
            return f"<= {upper}"
    return "> 5000"
