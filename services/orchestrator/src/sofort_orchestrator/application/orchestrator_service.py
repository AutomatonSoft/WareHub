from __future__ import annotations

from ..domain.field_registry import filtered_payload, missing_required_fields, validate_changed_fields
from ..domain.models import (
    ChannelResult,
    ErrorContract,
    FinalStatus,
    Marketplace,
    Operation,
    OrchestrateRequest,
    OrchestrateResponse,
    ReconciliationDiffItem,
)
from ..infra.channel_limiter import InMemoryChannelLimiter
from ..infra.http_client import RetryExhaustedError
from ..infra.circuit_breaker import InMemoryCircuitBreaker
from ..infra.ean_pool_gateway import EanPoolGateway
from ..infra.marketplace_adapters import MarketplaceAdapters


class OrchestratorService:
    def __init__(
        self,
        adapters: MarketplaceAdapters,
        circuit_breaker: InMemoryCircuitBreaker | None = None,
        channel_limiter: InMemoryChannelLimiter | None = None,
        ean_pool_gateway: EanPoolGateway | None = None,
    ) -> None:
        self.adapters = adapters
        self.circuit_breaker = circuit_breaker
        self.channel_limiter = channel_limiter
        self.ean_pool_gateway = ean_pool_gateway

    def execute(self, *, ean: str, request_id: str, command: OrchestrateRequest, job_id: str | None = None) -> OrchestrateResponse:
        if command.operation not in {Operation.UPDATE, Operation.PUBLISH}:
            return self._unsupported_operation_response(request_id=request_id, command=command)

        results: list[ChannelResult] = []
        pool_ean = self._claim_pool_ean_if_needed(command=command, job_id=job_id, request_id=request_id)
        pool_ean_published = False

        for channel in command.channels:
            target_label = _target_label(channel)
            if command.operation is Operation.PUBLISH and channel.marketplace not in {
                Marketplace.HOOD,
                Marketplace.KAUFLAND,
                Marketplace.XLJV,
            }:
                results.append(
                    ChannelResult(
                        marketplace=channel.marketplace,
                        target=target_label,
                        status="failed",
                        status_code=501,
                        error=ErrorContract(
                            code="orchestrator_operation_not_supported",
                            message="Publish is not supported for this marketplace.",
                            request_id=request_id,
                            details={"operation": command.operation.value, "marketplace": channel.marketplace.value},
                        ),
                    )
                )
                continue
            product_editor_mode = str(channel.overrides.get("__product_editor_mode") or "").strip().lower()
            unknown = validate_changed_fields(channel.marketplace, channel.changed_fields)
            if unknown:
                results.append(
                    ChannelResult(
                        marketplace=channel.marketplace,
                        target=target_label,
                        status="failed",
                        status_code=400,
                        error=ErrorContract(
                            code="orchestrator_channel_validation_failed",
                            message="Unknown fields for marketplace",
                            request_id=request_id,
                            details={"unknown_fields": unknown},
                        ),
                    )
                )
                continue

            scoped_payload = filtered_payload(channel.marketplace, command.payload.model_dump(exclude_none=True))
            if channel.changed_fields:
                selected = set(channel.changed_fields)
                scoped_payload = {k: v for k, v in scoped_payload.items() if k in selected}
            scoped_payload.update(channel.overrides)

            missing = [] if product_editor_mode in {"jv_batch_apply", "xl_batch_apply"} else missing_required_fields(channel.marketplace, scoped_payload)
            if missing:
                results.append(
                    ChannelResult(
                        marketplace=channel.marketplace,
                        target=target_label,
                        status="failed",
                        status_code=400,
                        error=ErrorContract(
                            code="orchestrator_channel_validation_failed",
                            message="Required fields missing for marketplace",
                            request_id=request_id,
                            details={"missing_required_fields": missing},
                        ),
                    )
                )
                continue

            breaker_key = target_label
            if self.circuit_breaker is not None and not self.circuit_breaker.allow_request(breaker_key):
                results.append(
                    ChannelResult(
                        marketplace=channel.marketplace,
                        target=target_label,
                        status="failed",
                        status_code=503,
                        error=ErrorContract(
                            code="orchestrator_channel_circuit_open",
                            message="Marketplace channel is temporarily blocked by circuit breaker",
                            request_id=request_id,
                            details={"target": target_label},
                        ),
                    )
                )
                continue

            if self.channel_limiter is not None and not self.channel_limiter.try_acquire(breaker_key):
                results.append(
                    ChannelResult(
                        marketplace=channel.marketplace,
                        target=target_label,
                        status="failed",
                        status_code=429,
                        error=ErrorContract(
                            code="orchestrator_channel_busy",
                            message="Marketplace channel is busy with concurrent updates",
                            request_id=request_id,
                            details={"target": target_label},
                        ),
                    )
                )
                continue

            try:
                channel_ean = ean
                if channel.ean_source == "pool":
                    if not pool_ean:
                        raise RuntimeError("Pool EAN was not allocated.")
                    channel_ean = pool_ean
                adapter_result = self.adapters.dispatch(
                    ean=channel_ean,
                    request_id=request_id,
                    channel=channel,
                    payload=scoped_payload,
                    operation=command.operation,
                )
            except RetryExhaustedError as exc:
                code = "orchestrator_channel_retry_exhausted"
                if exc.kind == "timeout":
                    code = "orchestrator_channel_timeout"
                elif exc.kind == "network":
                    code = "orchestrator_channel_network"
                results.append(
                    ChannelResult(
                        marketplace=channel.marketplace,
                        target=target_label,
                        status="failed",
                        status_code=504,
                        error=ErrorContract(
                            code=code,
                            message="Marketplace request retries exhausted",
                            request_id=request_id,
                            details={"reason": str(exc), "kind": exc.kind},
                        ),
                    )
                )
                if self.circuit_breaker is not None:
                    self.circuit_breaker.record_failure(breaker_key)
                continue
            except Exception as exc:  # noqa: BLE001
                results.append(
                    ChannelResult(
                        marketplace=channel.marketplace,
                        target=target_label,
                        status="failed",
                        status_code=502,
                        error=ErrorContract(
                            code="orchestrator_channel_transport_error",
                            message="Marketplace request failed before response",
                            request_id=request_id,
                            details={"reason": str(exc)},
                        ),
                    )
                )
                if self.circuit_breaker is not None:
                    self.circuit_breaker.record_failure(breaker_key)
                continue
            finally:
                if self.channel_limiter is not None:
                    self.channel_limiter.release(breaker_key)

            ok = 200 <= adapter_result.status_code < 300
            if ok:
                if channel.ean_source == "pool":
                    pool_ean_published = True
                if self.circuit_breaker is not None:
                    self.circuit_breaker.record_success(breaker_key)
                results.append(
                    ChannelResult(
                        marketplace=channel.marketplace,
                        target=target_label,
                        status="success",
                        status_code=adapter_result.status_code,
                        data=adapter_result.body,
                    )
                )
                continue

            if 400 <= adapter_result.status_code < 500:
                upstream_code = "orchestrator_channel_upstream_4xx"
            elif adapter_result.status_code >= 500:
                upstream_code = "orchestrator_channel_upstream_5xx"
                if self.circuit_breaker is not None:
                    self.circuit_breaker.record_failure(breaker_key)
            else:
                upstream_code = "orchestrator_channel_request_failed"

            results.append(
                ChannelResult(
                    marketplace=channel.marketplace,
                    target=target_label,
                    status="failed",
                    status_code=adapter_result.status_code,
                    error=ErrorContract(
                        code=upstream_code,
                        message="Marketplace adapter returned non-success status",
                        request_id=request_id,
                        details={
                            "marketplace": channel.marketplace.value,
                            "target": target_label,
                            "upstream_status_code": adapter_result.status_code,
                            "upstream_response": adapter_result.body,
                        },
                    ),
                )
            )

        if pool_ean_published:
            self._mark_pool_ean_used(job_id=job_id, request_id=request_id)

        return OrchestrateResponse(request_id=request_id, status=_final_status(results), results=results)

    def _claim_pool_ean_if_needed(self, *, command: OrchestrateRequest, job_id: str | None, request_id: str) -> str | None:
        if not any(channel.ean_source == "pool" for channel in command.channels):
            return None
        if not job_id:
            raise ValueError("Pool EAN allocation requires a queued orchestrator job.")
        if self.ean_pool_gateway is None:
            raise RuntimeError("EAN pool gateway is not configured.")
        return self.ean_pool_gateway.claim_for_job(job_id=job_id, request_id=request_id)

    def _mark_pool_ean_used(self, *, job_id: str | None, request_id: str) -> None:
        if not job_id or self.ean_pool_gateway is None:
            raise RuntimeError("EAN pool gateway is not configured.")
        self.ean_pool_gateway.mark_used_for_job(job_id=job_id, request_id=request_id)

    def _unsupported_operation_response(self, *, request_id: str, command: OrchestrateRequest) -> OrchestrateResponse:
        results: list[ChannelResult] = []
        for channel in command.channels:
            results.append(
                ChannelResult(
                    marketplace=channel.marketplace,
                    target=_target_label(channel),
                    status="failed",
                    status_code=501,
                    error=ErrorContract(
                        code="orchestrator_operation_not_supported",
                        message="Operation is not supported yet for this marketplace",
                        request_id=request_id,
                        details={
                            "operation": command.operation.value,
                            "marketplace": channel.marketplace.value,
                        },
                    ),
                )
            )
        return OrchestrateResponse(request_id=request_id, status=_final_status(results), results=results)

    def diff_channel_payloads(
        self,
        *,
        desired_command: OrchestrateRequest,
        actual_by_target: dict[str, dict],
    ) -> list[ReconciliationDiffItem]:
        diffs: list[ReconciliationDiffItem] = []
        for channel in desired_command.channels:
            target_label = _target_label(channel)
            desired_payload = filtered_payload(channel.marketplace, desired_command.payload.model_dump(exclude_none=True))
            if channel.changed_fields:
                selected = set(channel.changed_fields)
                desired_payload = {k: v for k, v in desired_payload.items() if k in selected}
            desired_payload.update(channel.overrides)

            actual_payload = actual_by_target.get(target_label, {})
            missing_fields = sorted([key for key in desired_payload if key not in actual_payload])
            mismatched_fields = sorted([key for key, value in desired_payload.items() if key in actual_payload and actual_payload[key] != value])
            diffs.append(
                ReconciliationDiffItem(
                    marketplace=channel.marketplace,
                    target=target_label,
                    has_drift=bool(missing_fields or mismatched_fields),
                    missing_fields=missing_fields,
                    mismatched_fields=mismatched_fields,
                )
            )
        return diffs


def _target_label(channel) -> str:
    parts = [channel.marketplace.value]
    if channel.account:
        parts.append(f"account={channel.account}")
    if channel.profile:
        parts.append(f"profile={channel.profile}")
    if channel.site:
        parts.append(f"site={channel.site}")
    if channel.site_key:
        parts.append(f"site_key={channel.site_key}")
    return ",".join(parts)


def _final_status(results: list[ChannelResult]) -> FinalStatus:
    if not results:
        return FinalStatus.FAILED
    all_ok = all(r.status == "success" for r in results)
    any_ok = any(r.status == "success" for r in results)
    if all_ok:
        return FinalStatus.SUCCESS
    if any_ok:
        return FinalStatus.PARTIAL_SUCCESS
    return FinalStatus.FAILED
