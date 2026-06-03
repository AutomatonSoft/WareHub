# ORCHESTRATOR_SUPPORT_MATRIX

Operational support matrix for orchestrator-driven marketplace writes.

Scope:
- `sofortbot-services/services/database_service` integration boundary.
- Runtime orchestrator behavior expected by frontend and service owners.

Primary references:
- `services/sb-sofort-orchestrator-service/docs/capability-matrix.md`
- `services/sb-sofort-orchestrator-service/README.md`
- `services/database_service/docs/DATABASE_SERVICE_ENDPOINTS.md`

## 1. Operation status keys

- `ACTIVE`: operation is expected to execute through orchestrator runtime path.
- `PLANNED`: operation exists in API/domain model but runtime path is not activated.
- `BLOCKED`: operation must not be used in production flows until explicit activation.

## 2. Marketplace operation matrix

| Marketplace | update | publish | unpublish | relist | Notes |
| --- | --- | --- | --- | --- | --- |
| hood | ACTIVE | BLOCKED | BLOCKED | BLOCKED | Keep write calls orchestrator-first for updates. |
| kaufland | ACTIVE | BLOCKED | BLOCKED | BLOCKED | Direct legacy endpoints remain compatibility-only. |
| xljv | ACTIVE | BLOCKED | BLOCKED | BLOCKED | Split legacy write endpoints still exist in `database_service`. |
| otto | ACTIVE (controlled profile path) | BLOCKED | BLOCKED | BLOCKED | Use controlled channels only. |
| ebay | PLANNED | BLOCKED | BLOCKED | BLOCKED | Not implemented in current runtime adapters. |

## 3. Runtime guardrail

- Current orchestrator runtime path supports `update` only.
- Requests for `publish`, `unpublish`, `relist` are expected to return channel-level:
  - `error.code = orchestrator_operation_not_supported`
- Frontend and service clients MUST treat this as a known capability gap, not as transport failure.

## 4. Integration policy for database_service

- Dangerous marketplace writes in `database_service` are legacy compatibility paths.
- New production write flows SHOULD route via orchestrator jobs.
- Legacy direct write endpoints MUST be documented and migrated slice-by-slice.

## 5. Activation checklist for new operation per marketplace

Before changing any marketplace operation from `BLOCKED` to `ACTIVE`:

1. Add/verify adapter implementation in orchestrator.
2. Add integration tests for success/failure/timeout/retry behavior.
3. Update orchestrator OpenAPI and docs.
4. Update frontend UX and error handling for the operation.
5. Update this matrix and rollout notes in the same change set.
