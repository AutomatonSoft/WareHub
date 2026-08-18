import logging
import os
import threading
import time
from hashlib import sha256

import mysql.connector

logger = logging.getLogger(__name__)
_connection_limiter_lock = threading.Lock()
_connection_limiters: dict[str, threading.BoundedSemaphore] = {}
_TRANSIENT_MYSQL_ERROR_CODES = {2006, 2013, 2055, 3024}


class _LimitedMySqlConnection:
    def __init__(self, connection, limiter: threading.BoundedSemaphore, release_distributed_slot) -> None:
        self._connection = connection
        self._limiter = limiter
        self._release_distributed_slot = release_distributed_slot
        self._closed = False

    def __getattr__(self, name: str):
        return getattr(self._connection, name)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            self._connection.close()
        finally:
            try:
                self._limiter.release()
            finally:
                self._release_distributed_slot()


def _connection_limiter(config: dict, max_connections: int) -> threading.BoundedSemaphore:
    key = ":".join((str(config.get("host") or ""), str(config.get("port") or ""), str(config.get("user") or "")))
    with _connection_limiter_lock:
        limiter = _connection_limiters.get(key)
        if limiter is None:
            limiter = threading.BoundedSemaphore(max_connections)
            _connection_limiters[key] = limiter
        return limiter


def _distributed_connection_slot_name(config: dict) -> str:
    identity = ":".join((str(config.get("host") or ""), str(config.get("port") or ""), str(config.get("user") or "")))
    return f"warehub:jv-source-db:{sha256(identity.encode('utf-8')).hexdigest()}"


def _acquire_distributed_connection_slot(config: dict, max_connections: int, wait_seconds: float, lease_seconds: int):
    redis_url = (os.getenv("JV_SOURCE_DB_REDIS_URL") or os.getenv("FTP_UPLOAD_REDIS_URL") or "").strip()
    if not redis_url:
        return lambda: None

    try:
        from redis import Redis
        from redis.exceptions import LockError, RedisError
    except ImportError as error:
        raise RuntimeError("JV source DB concurrency guard is unavailable.") from error

    client = Redis.from_url(redis_url, socket_connect_timeout=3, socket_timeout=3)
    lock = None
    deadline = time.monotonic() + wait_seconds
    try:
        while lock is None:
            for slot_number in range(max_connections):
                candidate = client.lock(
                    f"{_distributed_connection_slot_name(config)}:{slot_number}",
                    timeout=lease_seconds,
                )
                if candidate.acquire(blocking=False):
                    lock = candidate
                    break
            if lock is None:
                if time.monotonic() >= deadline:
                    raise TimeoutError("Timed out waiting for an available shared JV source database connection.")
                time.sleep(min(0.2, max(0.0, deadline - time.monotonic())))
    except RedisError as error:
        client.close()
        raise RuntimeError("JV source DB concurrency guard is unavailable.") from error
    except Exception:
        client.close()
        raise

    def release() -> None:
        try:
            lock.release()
        except (LockError, RedisError):
            pass
        finally:
            client.close()

    return release


def mysql_connect(config: dict):
    connect_timeout = int(os.getenv("JV_SOURCE_DB_CONNECT_TIMEOUT_SEC", "15"))
    read_timeout = int(os.getenv("JV_SOURCE_DB_READ_TIMEOUT_SEC", "45"))
    write_timeout = int(os.getenv("JV_SOURCE_DB_WRITE_TIMEOUT_SEC", "25"))
    retries = max(1, int(os.getenv("JV_SOURCE_DB_CONNECT_RETRIES", "3")))
    retry_sleep_sec = max(0.0, float(os.getenv("JV_SOURCE_DB_CONNECT_RETRY_SLEEP_SEC", "0.8")))
    max_connections = max(1, int(os.getenv("JV_SOURCE_DB_MAX_CONCURRENT_CONNECTIONS", "2")))
    acquire_timeout_sec = max(1.0, float(os.getenv("JV_SOURCE_DB_CONNECTION_ACQUIRE_TIMEOUT_SEC", "40")))
    shared_max_connections = max(1, int(os.getenv("JV_SOURCE_DB_REDIS_MAX_CONCURRENT_CONNECTIONS", str(max_connections))))
    shared_wait_seconds = max(1.0, float(os.getenv("JV_SOURCE_DB_REDIS_LOCK_WAIT_SECONDS", str(acquire_timeout_sec))))
    shared_lease_seconds = max(1, int(os.getenv("JV_SOURCE_DB_REDIS_LOCK_TIMEOUT_SECONDS", "120")))
    release_distributed_slot = _acquire_distributed_connection_slot(
        config,
        max_connections=shared_max_connections,
        wait_seconds=shared_wait_seconds,
        lease_seconds=shared_lease_seconds,
    )
    limiter = _connection_limiter(config, max_connections)
    if not limiter.acquire(timeout=acquire_timeout_sec):
        release_distributed_slot()
        raise TimeoutError(
            "Timed out waiting for an available JV source database connection "
            f"after {acquire_timeout_sec:.1f} seconds."
        )

    last_error = None
    try:
        for attempt in range(1, retries + 1):
            try:
                connection = mysql.connector.connect(
                    host=config["host"],
                    user=config["user"],
                    password=config["password"],
                    database=config["database"],
                    port=config["port"],
                    use_pure=True,
                    connection_timeout=connect_timeout,
                    read_timeout=read_timeout,
                    write_timeout=write_timeout,
                )
                return _LimitedMySqlConnection(connection, limiter, release_distributed_slot)
            except mysql.connector.Error as exc:
                last_error = exc
                if attempt >= retries:
                    break
                logger.warning(
                    "JV_SOURCE_DB_CONNECT_RETRY attempt=%s/%s host=%s port=%s error=%s",
                    attempt,
                    retries,
                    config.get("host"),
                    config.get("port"),
                    str(exc),
                )
                time.sleep(retry_sleep_sec)
        raise last_error
    except Exception:
        limiter.release()
        release_distributed_slot()
        raise


def is_transient_jv_source_error(error: Exception) -> bool:
    error_code = getattr(error, "errno", None)
    if error_code in _TRANSIENT_MYSQL_ERROR_CODES:
        return True
    message = str(error).lower()
    return any(
        marker in message
        for marker in (
            "handshake operation timed out",
            "read operation timed out",
            "lost connection to mysql server",
            "connection has been closed",
        )
    )


def jv_source_read_retry_delay(attempt: int) -> float:
    base_delay = max(0.0, float(os.getenv("JV_SOURCE_DB_READ_RETRY_BASE_DELAY_SEC", "1.0")))
    return base_delay * (2 ** max(0, attempt - 1))


def jv_source_read_retries() -> int:
    return max(1, int(os.getenv("JV_SOURCE_DB_READ_RETRIES", "2")))
