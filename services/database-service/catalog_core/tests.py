from datetime import date
from decimal import Decimal
from unittest import TestCase
from unittest.mock import Mock, patch

import requests
from .batch_shared import fetch_max_rate_last_period


class FetchMaxRateLastPeriodTests(TestCase):
    @patch("catalog_core.batch_shared.requests.get")
    def test_retries_transient_frankfurter_failure_before_using_rate(self, get):
        response = Mock()
        response.json.return_value = {"rates": {"2026-08-16": {"CHF": "0.95"}}}
        response.raise_for_status.return_value = None
        get.side_effect = [requests.Timeout("temporary timeout"), response]

        rate = fetch_max_rate_last_period(
            from_code="EUR",
            to_code="CHF",
            lookback_days=30,
            timeout=(1, 1),
            end_date=date(2026, 8, 17),
            api_url="",
            request_retries=1,
        )

        self.assertEqual(rate, Decimal("0.95"))
        self.assertEqual(get.call_count, 2)
        self.assertEqual(
            get.call_args.args[0],
            "https://api.frankfurter.dev/v1/2026-07-18..2026-08-17",
        )

    @patch("catalog_core.batch_shared.requests.get")
    def test_uses_configured_exchangerate_host_access_key(self, get):
        frankfurter_failure = requests.Timeout("temporary timeout")
        fallback_response = Mock()
        fallback_response.json.return_value = {"rates": {"2026-08-16": {"CHF": "0.95"}}}
        fallback_response.raise_for_status.return_value = None
        get.side_effect = [frankfurter_failure, fallback_response]

        rate = fetch_max_rate_last_period(
            from_code="EUR",
            to_code="CHF",
            lookback_days=30,
            timeout=(1, 1),
            end_date=date(2026, 8, 17),
            api_url="",
            request_retries=0,
            exchangerate_host_access_key="test-key",
        )

        self.assertEqual(rate, Decimal("0.95"))
        self.assertEqual(get.call_count, 2)
        self.assertEqual(
            get.call_args.kwargs["params"]["access_key"],
            "test-key",
        )
