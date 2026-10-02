# XL DE / CH / AT publishing

Create Product selects XL DE, CH and AT by default in the publication dialog.
Categories and delivery (OpenCart manufacturer) must be selected for each site.
Only selected sites are submitted. Each site uploads images to its own FTP and
receives its own category and manufacturer IDs. A failed site is reported without
undoing successful sites; other selected sites are still attempted. Retrying an
existing EAN uses the existing create-conflict/update path.

Product Editor discovers and loads these three source sites. Updates target found
sites and preserve independent `categories_by_site_key` and
`manufacturer_id_by_site_key` selections. A price edit uses the baseline currency:
DE/AT EUR, CH CHF. The XL backend performs conversion using the existing FX service;
the browser does not calculate exchange rates.

## Runtime configuration

Configure the database service separately for each environment. CH and AT never
fall back to the generic DE database or generic FTP credentials.

For each `XLMOEBEL_CH` and `XLMOEBEL_AT`, configure:

- `XL_SOURCE_<SITE_KEY>_DB_HOST`
- `XL_SOURCE_<SITE_KEY>_DB_USER`
- `XL_SOURCE_<SITE_KEY>_DB_PASSWORD`
- `XL_SOURCE_<SITE_KEY>_DB_NAME`
- Optional `XL_SOURCE_<SITE_KEY>_DB_PORT` and `_DB_PREFIX`
- `<SITE_KEY>_FTP_HOST`, `_FTP_USER`, `_FTP_PASSWORD`
- Site-specific FTP root/public URL where needed by the hosting layout

DE retains its existing generic `XL_SOURCE_XL_DB_*` fallback. No migrations are
needed. Missing site configuration must be resolved before real publication.

Store the CH/AT DB and FTP assignments in the `XL_MULTISITE_ENV_FILE` GitHub
Environment secret separately for `stage` and `production`. The deploy workflows
append this block after `STAGE_ENV_FILE` / `PROD_ENV_FILE`, preserving other
runtime settings. Do not replace the existing full env-file secrets with this
partial block. Workflow changes must be merged before this secret is consumed.
The optional server `.env.xl.local` overrides `.env`; keep its CH/AT values
consistent with the GitHub secret if it exists.

## Verification

Run `xl_services.tests_smoke`, `database.tests_upload_images`, orchestrator
`tests/test_product_editor_api.py`, frontend typechecking and
`e2e/xl-multisite-publishing.spec.ts` with mocked APIs. Live acceptance requires
checking category, delivery, converted price and images on all three sites after
an explicitly authorized publication/update; mock results are not proof of live
publication.
