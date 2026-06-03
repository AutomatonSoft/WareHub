# Frontend Observability (Sentry)

## Цель
Быстро находить фронтовые регрессии по ошибкам и латентности UI-потоков.

## Что уже инструментировано
- `telemetry_type=ui_event`
- `telemetry_type=ui_error`
- `telemetry_type=latency`
- Общие теги:
  - `app_env`
  - `app_release`
  - `route`

Ключевые события:
- `inventory_table_fetch` (latency)
- `sofort_list_fetch` (latency)
- `marketplace_status_fetch` (latency)
- `inventory_table_fetch_failed` (ui_error)
- `sofort_list_fetch_failed` (ui_error)
- `marketplace_status_fetch_failed` (ui_error)
- `marketplace_manual_sync_clicked` (ui_event)

## Recommended Sentry Dashboard Widgets

1. `Frontend Errors by Route (24h)`
- Dataset: Errors
- Query: `telemetry_type:ui_error`
- Group by: `route`

2. `Top UI Error Types (24h)`
- Dataset: Errors
- Query: `telemetry_type:ui_error`
- Group by: `ui_error`

3. `Inventory Fetch P95 (24h)`
- Dataset: Logs/Events
- Query: `telemetry_type:latency latency_name:inventory_table_fetch`
- Display: `p95(latency_payload.duration_ms)`

4. `Sofort List Fetch P95 (24h)`
- Dataset: Logs/Events
- Query: `telemetry_type:latency latency_name:sofort_list_fetch`
- Display: `p95(latency_payload.duration_ms)`

5. `Marketplace Health Fetch P95 (24h)`
- Dataset: Logs/Events
- Query: `telemetry_type:latency latency_name:marketplace_status_fetch`
- Display: `p95(latency_payload.duration_ms)`

6. `Release Regression Watch`
- Dataset: Errors
- Query: `telemetry_type:ui_error`
- Group by: `app_release`

## Alert Rules (Recommended)

1. `Spike in UI Errors`
- Condition: `count(telemetry_type:ui_error)` > baseline x2 (15m window)
- Scope: `app_env:production`

2. `Inventory Latency Degradation`
- Condition: `p95(latency_payload.duration_ms)` for `latency_name:inventory_table_fetch` > 2500ms
- Scope: `app_env:production`

3. `Sofort List Latency Degradation`
- Condition: `p95(latency_payload.duration_ms)` for `latency_name:sofort_list_fetch` > 2500ms
- Scope: `app_env:production`

## Operational Notes
- Для корректной группировки релизов должен быть задан `NEXT_PUBLIC_APP_VERSION`.
- Для разделения стендов должен быть задан `NEXT_PUBLIC_APP_ENV`.
- При добавлении нового критичного UI-flow обязательно добавлять:
  - `trackLatency(...)`
  - `trackUiError(...)`
  - запись в этот документ.
