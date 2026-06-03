# DATABASE_SERVICE_ENDPOINTS

Endpoint classification for `services/database_service`.

Source of truth: `services/database_service/database_service/urls.py`.

## 1. Read-only endpoints

- `GET /api/v1/inventory/rows/`
- `GET /api/v1/ean-pool/stats/`
- `GET /api/v1/ean-pool/{ean}/usage/`
- `GET /api/v1/kids/{kid_id}/order-ids/`
- `GET /api/v1/kids/{kid_id}/ean-summary/`
- `GET /api/v1/afterbuy/items/search/`
- `GET /api/v1/afterbuy/items/search-web/`
- `GET /api/v1/kaufland/{ean}/{site}/`
- `GET /api/v1/marketplace/kaufland/health/`
- `GET /api/v1/marketplace/hood/health/`
- `GET /api/v1/healthz`
- `GET /api/v1/hood/items/by-ean/{ean}/`
- `GET /api/v1/openapi.json`

Legacy read-only mirrors (non-v1):

- `GET /api/inventory/rows/`
- `GET /api/ean-pool/stats/`
- `GET /api/ean-pool/{ean}/usage/`
- `GET /api/kids/{kid_id}/order-ids/`
- `GET /api/kids/{kid_id}/ean-summary/`
- `GET /api/afterbuy/items/search/`
- `GET /api/afterbuy/items/search-web/`
- `GET /api/hood/items/by-ean/{ean}/`
- `GET /api/marketplace/{kaufland|hood}/health[/]`
- `GET /healthz[/]`

## 2. Write-safe endpoints (internal DB state only)

- `POST /api/v1/kids/`
- `PATCH/PUT /api/v1/kids/{pk}/`
- `PATCH/POST /api/v1/kids/bulk-update/`
- `POST /api/v1/orders/`
- `PATCH/PUT /api/v1/orders/{pk}/`
- `POST /api/v1/afterbuy/orders/create/`

Legacy mirrors:

- `POST /api/kids/`
- `PATCH/PUT /api/kids/{pk}/`
- `PATCH/POST /api/kids/bulk-update/`
- `POST /api/orders/`
- `PATCH/PUT /api/orders/{pk}/`
- `POST /api/afterbuy/orders/create/`

## 3. Dangerous write endpoints (external side effects / marketplace / file IO)

- `POST /api/v1/uploads/images/` (FTP/media write)
- `POST /api/v1/ean-pool/import/`
- `POST /api/v1/ean-pool/take-next-free/`
- `POST /api/v1/ean-pool/reserve/`
- `POST /api/v1/ean-pool/mark-used/`
- `POST /api/v1/kaufland/products/create/`
- `POST /api/v1/kaufland/products/ean/change/`
- `POST /api/v1/kaufland/products/delete/`

Legacy mirrors:

- `POST /api/uploads/images/`
- `POST /api/ean-pool/import/`
- `POST /api/ean-pool/take-next-free/`
- `POST /api/ean-pool/reserve/`
- `POST /api/ean-pool/mark-used/`
- `POST /api/kaufland/products/create/`
- `POST /api/kaufland/products/ean/change/`
- `POST /api/kaufland/products/delete/`

Split XL/JV write paths (legacy namespace, high risk):

- `POST /api/{xl|jv}/products/create-and-push/`
- `PATCH /api/{xl|jv}/products/update-by-ean/{ean}/`
- `POST /api/{xl|jv}/products/sync-by-ean/{ean}/`
- `POST /api/{xl|jv}/batch/update-by-ean/{ean}/apply/`

## 4. Plan-only endpoints (non-destructive planning)

- `POST /api/{xl|jv}/batch/update-by-ean/{ean}/plan/`

## 5. Otto endpoints (controlled)

- `POST /api/otto/products/upsert/`
- `POST /api/otto/{profile}/products/upsert/`
- `GET /api/otto/products/`
- `GET /api/otto/{profile}/products/`
- `GET /api/otto/products/{pk}/`
- `GET /api/otto/{profile}/products/{pk}/`

## 6. Notes for roadmap migration

- Prefer `/api/v1/*` for frontend read flows.
- Legacy `/api/*` endpoints remain for compatibility and should be tracked for deprecation.
- Dangerous writes should be progressively moved behind orchestrator-controlled jobs.
