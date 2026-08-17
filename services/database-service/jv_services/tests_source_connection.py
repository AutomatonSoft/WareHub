import os
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from . import source_connection


class JvSourceConnectionTests(SimpleTestCase):
    def setUp(self) -> None:
        source_connection._connection_limiters.clear()

    def tearDown(self) -> None:
        source_connection._connection_limiters.clear()

    @patch("jv_services.source_connection.mysql.connector.connect")
    def test_mysql_connect_releases_limiter_when_connection_is_closed(self, connect: MagicMock) -> None:
        raw_connection = MagicMock()
        connect.return_value = raw_connection
        config = {"host": "source.example", "port": 3306, "user": "warehouse", "password": "secret", "database": "catalog"}

        connection = source_connection.mysql_connect(config)
        connection.close()
        connection.close()

        raw_connection.close.assert_called_once_with()
        limiter = source_connection._connection_limiter(config, max_connections=2)
        self.assertTrue(limiter.acquire(blocking=False))
        limiter.release()

    @patch("redis.Redis.from_url")
    @patch("jv_services.source_connection.mysql.connector.connect")
    def test_mysql_connect_releases_shared_redis_slot_when_connection_is_closed(self, connect: MagicMock, from_url: MagicMock) -> None:
        raw_connection = MagicMock()
        connect.return_value = raw_connection
        client = MagicMock()
        lock = MagicMock()
        lock.acquire.return_value = True
        client.lock.return_value = lock
        from_url.return_value = client
        config = {"host": "source.example", "port": 3306, "user": "warehouse", "password": "secret", "database": "catalog"}

        with patch.dict(
            os.environ,
            {
                "JV_SOURCE_DB_REDIS_URL": "redis://redis.example/1",
                "JV_SOURCE_DB_REDIS_MAX_CONCURRENT_CONNECTIONS": "1",
            },
            clear=False,
        ):
            connection = source_connection.mysql_connect(config)
            connection.close()

        lock.release.assert_called_once_with()
        client.close.assert_called_once_with()

    def test_transient_mysql_errors_are_recognized(self) -> None:
        timeout = source_connection.mysql.connector.Error(msg="The handshake operation timed out", errno=2055)
        permanent = source_connection.mysql.connector.Error(msg="Access denied", errno=1045)

        self.assertTrue(source_connection.is_transient_jv_source_error(timeout))
        self.assertFalse(source_connection.is_transient_jv_source_error(permanent))
