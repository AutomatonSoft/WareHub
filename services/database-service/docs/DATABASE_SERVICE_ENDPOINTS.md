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
- `GET /api/v1/readyz`
- `GET /api/v1/hood/items/by-ean/{ean}/`
- `GET /api/v1/openapi.json`

## 2. Write-safe endpoints (internal DB state only)

- `POST /api/v1/kids/`
- `PATCH/PUT /api/v1/kids/{pk}/`
- `PATCH/POST /api/v1/kids/bulk-update/`
- `POST /api/v1/orders/`
- `PATCH/PUT /api/v1/orders/{pk}/`
- `POST /api/v1/afterbuy/orders/create/`

## 3. Dangerous write endpoints (external side effects / marketplace / file IO)

- `POST /api/v1/uploads/images/` (FTP/media write)
- `POST /api/v1/ean-pool/import/`
- `POST /api/v1/ean-pool/take-next-free/`
- `POST /api/v1/ean-pool/reserve/`
- `POST /api/v1/ean-pool/mark-used/`
- `POST /api/v1/kaufland/products/create/`
- `POST /api/v1/kaufland/products/ean/change/`
- `POST /api/v1/kaufland/products/delete/`

Split XL/JV write paths:

- `POST /api/v1/{xl|jv}/products/create-and-push/`
- `PATCH /api/v1/{xl|jv}/products/update-by-ean/{ean}/`
- `POST /api/v1/{xl|jv}/products/sync-by-ean/{ean}/`
- `POST /api/v1/{xl|jv}/batch/update-by-ean/{ean}/apply/`

JV identifier aliases:

- `GET /api/v1/jv/products/by-artikelnr/{artikelnr}/`
- `GET /api/v1/jv/sites/by-artikelnr/{artikelnr}/`
- `GET /api/v1/jv/products/local-by-artikelnr/{artikelnr}/`
- `PATCH /api/v1/jv/products/update-by-artikelnr/{artikelnr}/`
- `POST /api/v1/jv/products/sync-by-artikelnr/{artikelnr}/`
- `POST /api/v1/jv/batch/update-by-artikelnr/{artikelnr}/apply/`
- `POST /api/v1/jv/batch/update-by-artikelnr/{artikelnr}/plan/`

Legacy compatibility:

- The existing JV `*-by-ean` routes remain supported, but for JV they now resolve by `artikelnr` / `source_model`.

## 4. Plan-only endpoints (non-destructive planning)

- `POST /api/v1/{xl|jv}/batch/update-by-ean/{ean}/plan/`

## 5. Otto endpoints (controlled)

- `POST /api/v1/otto/{profile}/products/upsert/`
- `GET /api/v1/otto/{profile}/products/`
- `GET /api/v1/otto/{profile}/products/by-sku/{sku}/` (fetches from OTTO API and synchronizes the local cache)
- `GET /api/v1/otto/{profile}/products/{pk}/`

`{profile}` is required and accepts only `jv` or `xl`.

## 6. Notes for roadmap migration

- Prefer `/api/v1/*` for frontend read flows.
- Dangerous writes should be progressively moved behind orchestrator-controlled jobs.
