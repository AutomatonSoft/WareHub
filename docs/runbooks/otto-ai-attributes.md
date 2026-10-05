# OTTO AI attribute filling

Create Product and Product Editor share the OTTO attribute form. Select an OTTO
category, then use **Fill attributes with OpenAI**. This updates only the draft;
it does not create a marketplace job or publish a product.

The request includes source product data and current product text, bullet points
and attributes. The server forwards only allowlisted product fields to OpenAI,
not credentials, account settings, prices or delivery configuration. Images are
not analyzed. Category attributes come from the server's OTTO cache, refreshed
from the external taxonomy API when absent.

Required runtime configuration: existing `OPENAI_API_KEY` and OTTO category-cache
configuration. The model uses `OPENAI_TRANSLATION_MODEL`, falling back to
`gpt-5-mini`. No new deployment secrets are required.

The server accepts only known attribute IDs, matching allowed values and evidence
quoted from the supplied product data. Unsupported numbers and invalid numeric
types are rejected. Existing populated values and removed attributes stay intact.
The UI ignores results for a different product/category and preserves edits made
while the request is running.

Review all generated values before publication: quoted evidence and schema
validation do not guarantee that every semantic interpretation is correct.
Missing information is omitted, not invented. A request is limited to 60000
product JSON characters and 200 category attributes. Failures leave the draft
unchanged and display an error; the user may retry explicitly.

Local checks: `otto_service.tests_attribute_suggestions`,
`apps/frontend/tests/otto-create-product-model.test.mjs` and frontend typecheck.
Live OpenAI generation and deployed browser behavior require a separate check.
