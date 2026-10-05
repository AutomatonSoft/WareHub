# Create Product multi-site publication

Publication routes each selected site by its marketplace and account, not by the
currently visible tab. JV and XL storefronts use their respective site selections;
HOOD, Kaufland, OTTO and eBay use account-specific drafts and galleries.

Before sending, the page checks that selected account drafts belong to the current
product context. Missing drafts keep the selection dialog open and identify the
tab that must be prepared. Existing field validation remains in each sender.
Publication is not atomic across external marketplaces: one failure does not undo
successful publications on other sites.

The page stays busy until every started sender settles, including JV image uploads
and job enqueueing. A synchronous batch guard rejects repeated confirmation clicks.
The controller tracks concurrent submissions with a counter instead of a shared
boolean. eBay accounts retain sequential submission within the batch.

For background jobs, completion of submission is not proof of successful external
publication. Confirm the eventual job result and marketplace state separately.

This change does not alter XL's existing create-conflict/update fallback.

Regression checks:

```sh
cd apps/frontend
node --test tests/ebay-publish-confirmation.test.mjs
npm test
npm run typecheck
npm run build
```
