# Aftercool JV–XL mapping

## Admin Users

Admin Users includes an Aftercool EAN synchronization panel. Its authenticated
`GET /api/v1/jv/gallery-mapping/` reads configuration and progress;
`POST` queues a full pass with pages of 500 and three readers. Only an admin
database-service session is allowed; POST requires the CSRF token returned by GET.
Credentials stay in server environment.
Mappings are stored separately: this does not update WareHub EAN pool/statuses.

Run a dedicated persistent worker with the same environment and MongoDB:

```sh
venv/bin/python services/database-service/manage.py run_gallery_mapping_worker
```

The UI polls every five seconds. Queued means waiting for the worker, not success.
MongoDB stores the job and all checkpoints; duplicate starts return HTTP 409.
An interrupted job is reclaimed after its ten-minute lease expires. Failed jobs
can be resumed using the button. A completed saved snapshot is not refreshed by
starting again. Stage/prod Compose registers `aftercool_mapping_worker`; deployment
starts it with the service image. Without credentials it stays in standby and
does not import anything. Its process healthcheck also passes in standby;
the Admin Users panel reports missing configuration.
Worker and API must share `AFTERCOOL_*` and `JV_XL_MAPPING_MONGO_*` configuration.
`configured: true` only confirms that required environment values are present;
it does not validate Aftercool login or database permissions. Jobs report the
current phase (storage, login, JV/XL cache, matching) and safe error details.
The worker logs `AFTERCOOL_MAPPING_JOB_FAILED` with job ID and the same safe
message. Raw response bodies, connection URLs and credentials are not logged.

Deployment reads optional GitHub Secrets `AFTERCOOL_USERNAME` and
`AFTERCOOL_PASSWORD` into runtime env (never into images). They can instead be
included in `SHARED_ENV_FILE` / `STAGE_ENV_FILE` / `PROD_ENV_FILE`.
MongoDB defaults to the internal `mongodb:27017` container with separate
`warehub_jv_xl_mapping_stage` and `warehub_jv_xl_mapping_prod` databases.
The templates reuse the environment's existing Mongo credentials; a dedicated
mapping user can be configured through `JV_XL_MAPPING_MONGO_USERNAME/PASSWORD`
in the per-environment secret env file. MongoDB creates collections on first
write; this configuration change does not run an import or modify a server.

Run from `services/database-service` with the service Python environment.
Supply credentials through the process environment, never CLI arguments or Git:

- `AFTERCOOL_USERNAME`
- `AFTERCOOL_PASSWORD`
- `JV_XL_MAPPING_MONGO_URI` (required only for writes)
- `JV_XL_MAPPING_MONGO_DATABASE` (required only for writes)
- `JV_XL_MAPPING_MONGO_USERNAME` and `JV_XL_MAPPING_MONGO_PASSWORD` (optional
  separate authentication fields; set both together, avoiding URI escaping).

Read-only sample, no MongoDB connection:

```sh
python manage.py map_jv_xl_gallery --max-products 10
```

After confirming the destination database, cache ALL JV and XL and map a small JV sample:

```sh
python manage.py map_jv_xl_gallery --write --max-products 10
```

Continue through the remaining catalogue:

```sh
python manage.py map_jv_xl_gallery --write --max-products 0 --page-size 500 --workers 3
```

`jv_xl_product_mapping` stores every source JV row, even without an EAN or image.
XL is linked only when exactly one candidate has an identical GalleryURL string
and both EANs exist. Image bytes are not compared. Multiple rows count as ambiguous
even if they contain the same XL EAN. URLs are not normalized.

Write mode first saves all JV rows to `jv_xl_product_mapping` with `xl_ean: null`
and `lookup_pending`, then loads XL into `jv_xl_gallery_cache` in pages of 500
(adjust with `--page-size 1..500`). Once both caches are complete it reads saved JV pages and matches
locally through a binary-collation GalleryURL index. One aggregate query counts
XL matches for all URLs in the JV page; duplicates remain ambiguous. The next
API pages are fetched with up to three independent HTTP sessions (`--workers
1..3`, default 3). Results are committed in offset order, with at most three
pages pending. A short non-final page stops processing instead of skipping rows.
Write mode has no fixed inter-page
sleep. No per-JV Aftercool lookup occurs in write mode.
The read-only sample still uses direct API lookups and does not build a cache.

`jv_xl_product_mapping_progress` stores JV loading, XL loading, and local matching offsets after
successful bulk writes. Failed writes do not advance the checkpoint. Retrying
replays the page idempotently. The cache is retained for resume; this command
does not refresh a completed XL snapshot automatically. A lease
prevents concurrent workers for the same source/dataset; after a hard crash it
expires after ten minutes. A normal exit releases it.

Start offset is zero. Keep Aftercool imports unchanged during a run: offset
pagination is not a snapshot, so source insertion/reordering can cause gaps.
Completion describes the traversed dataset, not an atomic catalogue snapshot.
The matching checkpoint is `jv_first_next_offset`; the former XL-first checkpoint
is retained but not reused, so it cannot skip newly cached JV rows.
No WareHub EAN/status tables or marketplace listings are changed by this command.

Validation: `PYTHONPATH=. python -m unittest jv_services.tests_gallery_mapping`.
Mongo writes still require an integration check against the chosen database.
# Product Editor lookup

`GET /api/v1/jv/gallery-mapping/lookup/?ean=...` resolves either JV or XL EAN in the saved `lister` mapping. It requires an authenticated user session or the existing trusted service authentication. Lookup does not call Aftercool or write mappings.

The response includes `status` (`matched`, `jv_only`, `not_found`, `ambiguous`) and `ean_by_tab`. JV and XL sites, plus JV marketplace accounts, use the JV EAN. Hood XL, OTTO XL and Kaufland XL use the XL EAN. Missing XL pairs leave those marketplace tabs unsearched. Multiple distinct pairs stop discovery; Mongo failures return 503. If no mapping exists, the editor explicitly warns and searches the entered identifier without inventing a pair.

eBay tabs and discovery requests are removed from Product Editor. Create Product and existing eBay service APIs remain unchanged.
