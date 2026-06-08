# Orchestrator Error Codes

All API errors use:

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "request_id": "uuid",
  "details": {}
}
```

## Top-level request errors

- `orchestrator_request_validation_failed`
  - HTTP `422`
  - Request body/schema validation failed.
- `orchestrator_ean_empty`
  - HTTP `400`
  - Path parameter `ean` is empty after trim.
- `orchestrator_job_not_found`
  - HTTP `404`
  - Job id does not exist in orchestrator job store.
- `orchestrator_reconciliation_report_not_found`
  - HTTP `404`
  - Reconciliation report id does not exist in orchestrator store.
- `orchestrator_jobs_batch_too_large`
  - HTTP `400`
  - Batch create request exceeded configured max item count.
- `orchestrator_jobs_status_batch_too_large`
  - HTTP `400`
  - Batch status request exceeded configured max item count.
- `orchestrator_job_scheduled_in_past`
  - HTTP `400`
  - Scheduled job timestamp is in the past.
- `orchestrator_jobs_rate_limited`
  - HTTP `429`
  - Job intake rate limit exceeded for the configured time window (global or priority bucket).

## Per-channel orchestration errors (`results[*].error.code`)

- `orchestrator_operation_not_supported`
  - Requested operation (`publish`/`unpublish`/`relist`) is not activated yet for channel execution path.
- `orchestrator_channel_circuit_open`
  - Channel fail-fast protection is active (circuit breaker open).
- `orchestrator_channel_busy`
  - Channel concurrent in-flight limit is reached.
- `orchestrator_channel_validation_failed`
  - Channel payload/field policy validation failed.
- `orchestrator_channel_timeout`
  - Upstream request timed out after retries.
- `orchestrator_channel_network`
  - Network failure after retries.
- `orchestrator_channel_retry_exhausted`
  - Retry budget exhausted (generic fallback code).
- `orchestrator_channel_transport_error`
  - Non-HTTP transport exception before response.
- `orchestrator_channel_upstream_4xx`
  - Upstream returned 4xx response.
- `orchestrator_channel_upstream_5xx`
  - Upstream returned 5xx response.
- `orchestrator_channel_request_failed`
  - Upstream returned non-success response outside normal 4xx/5xx grouping.
