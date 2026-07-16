"""Application service for searching orders across Afterbuy profiles."""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable

from .client import AfterbuyApiClient, AfterbuyApiError, AfterbuyCredentials
from .contracts import AfterbuyLookupResult

DEFAULT_PROFILES = ("JV", "XL", "CH")
logger = logging.getLogger(__name__)


class AfterbuyOrderLookupService:
    """Looks up a KID in configured Afterbuy accounts, without writing data."""

    def __init__(
        self,
        client_factory: Callable[[str], AfterbuyApiClient] | None = None,
    ) -> None:
        self._client_factory = client_factory or self._build_client

    def find_by_kid(
        self, kid_number: str, profiles: Iterable[str] = DEFAULT_PROFILES
    ) -> AfterbuyLookupResult | None:
        for profile in profiles:
            try:
                client = self._client_factory(profile)
                orders = client.fetch_orders_by_kid(kid_number)
            except AfterbuyApiError:
                logger.warning("AFTERBUY_PROFILE_LOOKUP_FAILED profile=%s", profile)
                continue
            if orders:
                return AfterbuyLookupResult(profile=client.profile, orders=orders)
        return None

    @staticmethod
    def _build_client(profile: str) -> AfterbuyApiClient:
        normalized_profile = profile.upper()
        return AfterbuyApiClient(
            profile=normalized_profile,
            credentials=AfterbuyCredentials.from_environment(normalized_profile),
        )
