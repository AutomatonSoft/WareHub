import logging
import os
import time

import mysql.connector

logger = logging.getLogger(__name__)


def mysql_connect(config: dict):
    connect_timeout = int(os.getenv("JV_SOURCE_DB_CONNECT_TIMEOUT_SEC", "8"))
    read_timeout = int(os.getenv("JV_SOURCE_DB_READ_TIMEOUT_SEC", "25"))
    write_timeout = int(os.getenv("JV_SOURCE_DB_WRITE_TIMEOUT_SEC", "25"))
    retries = max(1, int(os.getenv("JV_SOURCE_DB_CONNECT_RETRIES", "3")))
    retry_sleep_sec = max(0.0, float(os.getenv("JV_SOURCE_DB_CONNECT_RETRY_SLEEP_SEC", "0.8")))
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            return mysql.connector.connect(
                host=config["host"],
                user=config["user"],
                password=config["password"],
                database=config["database"],
                port=config["port"],
                connection_timeout=connect_timeout,
                read_timeout=read_timeout,
                write_timeout=write_timeout,
            )
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
