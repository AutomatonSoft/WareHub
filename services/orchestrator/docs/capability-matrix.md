# Orchestrator Capability Matrix (v1)

Status date: 2026-05-14

## Operations

- `publish`
- `update`
- `unpublish`
- `relist`

## Current execution support

| Marketplace | publish | update | unpublish | relist | Notes |
|---|---|---|---|---|---|
| hood | planned | active | planned | planned | Runtime path currently executes update flow. |
| kaufland | planned | active | planned | planned | Runtime path currently executes update flow. |
| otto | planned | active | planned | planned | Runtime path currently executes update flow. |
| jv/xl (xljv target) | planned | active | planned | planned | Runtime path currently executes update flow with split `/api/jv/*` and `/api/xl/*` endpoints. |

## Contract policy

1. `operation` is part of request contract and defaults to `update` for backward compatibility.
2. Unknown operation values are rejected as request validation errors.
3. Runtime execution path currently supports only `update`; other operations return per-channel `orchestrator_operation_not_supported`.
4. New operation behavior must be additive and documented before activation per marketplace.
