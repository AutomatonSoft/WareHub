import os
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

import requests
from django.utils import timezone


def round_price_no_fraction(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def json_safe(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    return value


def fetch_max_rate_last_period(
    *,
    from_code: str,
    to_code: str,
    lookback_days: int,
    timeout: tuple[int, int],
    end_date: date,
    api_url: str,
) -> Decimal:
    start_date = end_date - timedelta(days=max(1, int(lookback_days)))
    errors: list[str] = []
    endpoint = (api_url or "").strip()

    if endpoint:
        try:
            resp = requests.get(
                endpoint,
                params={
                    "from": from_code,
                    "to": to_code,
                    "amount": "1",
                    "mode": "max_rate",
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                },
                timeout=timeout,
            )
            resp.raise_for_status()
            payload = resp.json() or {}
            value = payload.get("max_rate")
            if value in (None, ""):
                value = payload.get("rate")
            if value in (None, ""):
                value = payload.get("result")
            if value in (None, ""):
                raise RuntimeError("custom endpoint returned empty max rate")
            return Decimal(str(value))
        except Exception as exc:
            errors.append(f"custom_fx_failed: {exc}")

    try:
        resp = requests.get(
            f"https://api.frankfurter.app/{start_date.isoformat()}..{end_date.isoformat()}",
            params={"from": from_code, "to": to_code},
            timeout=timeout,
        )
        resp.raise_for_status()
        payload = resp.json() or {}
        rates_by_day = payload.get("rates") or {}
        max_rate = None
        for day_rates in rates_by_day.values():
            if not isinstance(day_rates, dict):
                continue
            day_rate = day_rates.get(to_code)
            if day_rate in (None, ""):
                continue
            day_rate_decimal = Decimal(str(day_rate))
            if max_rate is None or day_rate_decimal > max_rate:
                max_rate = day_rate_decimal
        if max_rate is None:
            raise RuntimeError("max rate not found in frankfurter range response")
        return max_rate
    except Exception as exc:
        errors.append(f"frankfurter_range_failed: {exc}")

    try:
        resp = requests.get(
            "https://api.exchangerate.host/timeseries",
            params={
                "base": from_code,
                "symbols": to_code,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        payload = resp.json() or {}
        rates_by_day = payload.get("rates") or {}
        max_rate = None
        for day_rates in rates_by_day.values():
            if not isinstance(day_rates, dict):
                continue
            day_rate = day_rates.get(to_code)
            if day_rate in (None, ""):
                continue
            day_rate_decimal = Decimal(str(day_rate))
            if max_rate is None or day_rate_decimal > max_rate:
                max_rate = day_rate_decimal
        if max_rate is None:
            raise RuntimeError("max rate not found in exchangerate.host timeseries response")
        return max_rate
    except Exception as exc:
        errors.append(f"exchangerate_timeseries_failed: {exc}")

    raise RuntimeError("; ".join(errors) or "Unable to resolve max FX rate for period.")


def convert_amount(*, amount, from_currency: str, to_currency: str, env_prefix: str, cache: dict) -> Decimal | None:
    if amount is None:
        return None
    if str(from_currency).upper() == str(to_currency).upper():
        return round_price_no_fraction(amount)

    timeout = (
        int(os.getenv(f"{env_prefix}_FX_CONNECT_TIMEOUT", "5")),
        int(os.getenv(f"{env_prefix}_FX_READ_TIMEOUT", "15")),
    )
    from_code = str(from_currency).upper().strip()
    to_code = str(to_currency).upper().strip()
    if not re.match(r"^[A-Z]{3}$", from_code) or not re.match(r"^[A-Z]{3}$", to_code):
        raise RuntimeError("Invalid currency code for conversion.")

    lookback_days = int(os.getenv(f"{env_prefix}_FX_LOOKBACK_DAYS", "365"))
    end_date = timezone.now().date()
    cache_key = (from_code, to_code, lookback_days, end_date.isoformat())
    max_rate = cache.get(cache_key)
    if max_rate is None:
        max_rate = fetch_max_rate_last_period(
            from_code=from_code,
            to_code=to_code,
            lookback_days=lookback_days,
            timeout=timeout,
            end_date=end_date,
            api_url=os.getenv(f"{env_prefix}_FX_API_URL", "").strip(),
        )
        cache[cache_key] = max_rate

    converted = Decimal(str(amount)) * max_rate
    return round_price_no_fraction(converted)
