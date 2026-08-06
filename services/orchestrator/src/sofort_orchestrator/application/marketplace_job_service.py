from __future__ import annotations

from ..domain.marketplace_job_models import (
    MarketplaceToggleExecutionResult,
    MarketplaceToggleResultItem,
    MarketplaceToggleSummary,
)
from ..infra.http_client import RetryExhaustedError
from ..infra.marketplace_job_gateway import GatewayResult, MarketplaceJobGateway


class MarketplaceJobService:
    def __init__(self, gateway: MarketplaceJobGateway) -> None:
        self.gateway = gateway

    def execute(
        self,
        *,
        kid_number: str,
        inactive: bool,
        request_id: str,
        place: str | None = None,
        actor_login: str = "",
        actor_name: str = "",
    ) -> MarketplaceToggleExecutionResult:
        results: list[MarketplaceToggleResultItem] = []
        actor_kwargs = {"actor_login": actor_login, "actor_name": actor_name} if actor_login or actor_name else {}
        results.extend(
            self._call_channel(
                fallback_site_key="JV",
                fallback_channel="JV",
                request_id=request_id,
                call=lambda: self.gateway.toggle_jv_by_kid(
                    kid_number=kid_number,
                    inactive=inactive,
                    request_id=request_id,
                    place=place,
                    **actor_kwargs,
                ),
            )
        )
        results.extend(
            self._call_channel(
                fallback_site_key="XLMOEBEL_DE",
                fallback_channel="XL",
                request_id=request_id,
                call=lambda: self.gateway.toggle_xl_by_kid(
                    kid_number=kid_number,
                    inactive=inactive,
                    request_id=request_id,
                    place=place,
                    **actor_kwargs,
                ),
            )
        )
        results.extend(
            self._call_channel(
                fallback_site_key="HOOD",
                fallback_channel="HOOD",
                request_id=request_id,
                call=lambda: self.gateway.toggle_hood_by_kid(
                    kid_number=kid_number,
                    inactive=inactive,
                    request_id=request_id,
                    place=place,
                    **actor_kwargs,
                ),
            )
        )
        results.extend(
            self._call_channel(
                fallback_site_key="KAUFLAND",
                fallback_channel="KAUFLAND",
                request_id=request_id,
                call=lambda: self.gateway.toggle_kaufland_by_kid(
                    kid_number=kid_number,
                    inactive=inactive,
                    request_id=request_id,
                    place=place,
                    **actor_kwargs,
                ),
            )
        )
        results.extend(
            self._call_channel(
                fallback_site_key="OTTO",
                fallback_channel="OTTO",
                request_id=request_id,
                call=lambda: self.gateway.toggle_otto_by_kid(
                    kid_number=kid_number,
                    inactive=inactive,
                    request_id=request_id,
                    place=place,
                ),
            )
        )
        results.extend(
            self._call_channel(
                fallback_site_key="LOCAL",
                fallback_channel="LOCAL",
                request_id=request_id,
                call=lambda: self.gateway.toggle_local_statuses_by_kid(
                    kid_number=kid_number,
                    inactive=inactive,
                    request_id=request_id,
                    **actor_kwargs,
                ),
            )
        )
        results = self._deduplicate_results(results)

        success = sum(1 for item in results if item.ok)
        failed = len(results) - success
        if success == len(results):
            status = "ok"
        elif success == 0:
            status = "failed"
        else:
            status = "partial"
        return MarketplaceToggleExecutionResult(
            status=status,
            inactive=inactive,
            summary=MarketplaceToggleSummary(total=len(results), success=success, failed=failed),
            results=results,
        )

    def _deduplicate_results(self, results: list[MarketplaceToggleResultItem]) -> list[MarketplaceToggleResultItem]:
        by_site_key: dict[str, MarketplaceToggleResultItem] = {}
        ordered_site_keys: list[str] = []
        for item in results:
            site_key = item.site_key.strip() or item.channel.strip() or "UNKNOWN"
            if site_key not in by_site_key:
                by_site_key[site_key] = item
                ordered_site_keys.append(site_key)
                continue
            if self._prefer_result(candidate=item, current=by_site_key[site_key]):
                by_site_key[site_key] = item
        return [by_site_key[site_key] for site_key in ordered_site_keys]

    def _prefer_result(self, *, candidate: MarketplaceToggleResultItem, current: MarketplaceToggleResultItem) -> bool:
        return self._result_rank(candidate) > self._result_rank(current)

    def _result_rank(self, item: MarketplaceToggleResultItem) -> int:
        details = item.details if isinstance(item.details, dict) else {}
        code = str(details.get("code") or "").strip()
        if code == "marketplace_local_status_updated":
            return 1
        if item.ok:
            return 3
        return 2

    def _call_channel(
        self,
        *,
        fallback_site_key: str,
        fallback_channel: str,
        request_id: str,
        call,
    ) -> list[MarketplaceToggleResultItem]:
        try:
            result = call()
            return self._flatten_gateway_result(result, fallback_channel=fallback_channel)
        except RetryExhaustedError as exc:
            code = "orchestrator_marketplace_toggle_retry_exhausted"
            if exc.kind == "timeout":
                code = "orchestrator_marketplace_toggle_timeout"
            elif exc.kind == "network":
                code = "orchestrator_marketplace_toggle_network"
            return [
                MarketplaceToggleResultItem(
                    ok=False,
                    site_key=fallback_site_key,
                    channel=fallback_channel,
                    status_code=504,
                    details={
                        "code": code,
                        "detail": "Marketplace toggle request retries exhausted.",
                        "request_id": request_id,
                        "kind": exc.kind,
                        "reason": str(exc),
                    },
                )
            ]
        except Exception as exc:  # noqa: BLE001
            return [
                MarketplaceToggleResultItem(
                    ok=False,
                    site_key=fallback_site_key,
                    channel=fallback_channel,
                    status_code=502,
                    details={
                        "code": "orchestrator_marketplace_toggle_transport_error",
                        "detail": "Marketplace toggle request failed before response.",
                        "request_id": request_id,
                        "reason": str(exc),
                    },
                )
            ]

    def _flatten_gateway_result(self, result: GatewayResult, *, fallback_channel: str) -> list[MarketplaceToggleResultItem]:
        body = result.body if isinstance(result.body, dict) else {}
        rows = body.get("results")
        if isinstance(rows, list):
            normalized: list[MarketplaceToggleResultItem] = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                normalized.append(
                    MarketplaceToggleResultItem(
                        ok=bool(row.get("ok")),
                        site_key=str(row.get("site_key") or fallback_channel).strip() or fallback_channel,
                        channel=str(row.get("channel") or fallback_channel).strip() or fallback_channel,
                        status_code=int(row.get("status_code") or result.status_code),
                        details=row.get("details") if isinstance(row.get("details"), dict) else {},
                    )
                )
            if normalized:
                return normalized

        return [
            MarketplaceToggleResultItem(
                ok=200 <= result.status_code < 300,
                site_key=fallback_channel,
                channel=fallback_channel,
                status_code=result.status_code,
                details=body,
            )
        ]
