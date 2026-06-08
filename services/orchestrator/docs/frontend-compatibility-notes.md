# Frontend Compatibility Notes (Orchestrator v1)

Status date: 2026-05-14

## Request contract notes

1. Frontend should send `operation` explicitly.
2. Current active operation is `update`.
3. If `operation` is omitted, backend defaults to `update` for backward compatibility.

## Current operation behavior

1. `update`:
   - Active runtime path.
   - Channels are dispatched to adapters.
2. `publish`, `unpublish`, `relist`:
   - Accepted by schema.
   - Return per-channel failure with:
     - `status_code = 501`
     - `error.code = orchestrator_operation_not_supported`

## Error handling requirements in frontend

1. Treat `orchestrator_operation_not_supported` as a planned capability gap (not a transport failure).
2. Keep generic fallback for unknown future error codes.
3. Preserve `request_id` in UI diagnostics/logging for support.
