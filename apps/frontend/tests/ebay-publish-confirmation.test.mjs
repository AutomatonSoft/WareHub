import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/create-product/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name, context) {
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(found, `Missing ${name}`);
  const compiled = ts.transpileModule(found.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(`${compiled}\n${name}`, context);
}

test("eBay requires confirmation and publishes each account with its own draft and images", async () => {
  const calls = [];
  const sites = ["JV", "XL", "DEP"].map((kind) => ({ id: `ebay-${kind.toLowerCase()}`, family: "EBAY", kind, name: `EBAY ${kind}` }));
  const context = {
    allMarketplaceSites: sites,
    activeTab: "ebay_dep",
    isEbayMarketplace: true,
    activeMarketplaceSiteIds: ["ebay-dep"],
    activeDraftContextKey: "kid-42",
    JV_SITE_KEY_BY_MARKETPLACE_SITE_ID: {},
    ebayDraftRefByTab: { current: Object.fromEntries(sites.map((site) => [
      `ebay_${site.kind.toLowerCase()}`,
      { sourceKey: "kid-42", draft: { paymentPolicyId: `policy-${site.kind}` } },
    ])) },
    tabGalleryItemsByTab: Object.fromEntries(sites.map((site) => [
      `ebay_${site.kind.toLowerCase()}`, [{ src: `https://example.test/${site.kind}.jpg`, isLocal: false }],
    ])),
    getLocalImageFilesForTab: (tab) => [tab],
    setSelectedPublishSiteIds: (ids) => { context.selectedPublishSiteIds = ids; },
    setIsPublishSitesDialogOpen: (open) => { context.open = open; },
    showToast: (...args) => calls.push(args),
    controller: { handleCreateProduct: async (...args) => calls.push(args) },
  };
  handler("openPublishSitesDialog", context)();
  assert.equal(context.open, true);
  assert.deepEqual([...context.selectedPublishSiteIds], ["ebay-dep"]);
  assert.equal(calls.length, 0);
  context.selectedPublishSiteIds = new Set(sites.map((site) => site.id));
  handler("confirmPublishSites", context)();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.open, false);
  assert.equal(calls.length, 3);
  calls.forEach((call, index) => {
    assert.equal(call[1][0], sites[index].id);
    assert.equal(call[2].ebayFields.paymentPolicyId, `policy-${sites[index].kind}`);
    assert.equal(call[2].ebayImageUrls[0], `https://example.test/${sites[index].kind}.jpg`);
  });
  calls.length = 0;
  context.ebayDraftRefByTab.current.ebay_xl.sourceKey = "previous-kid";
  context.open = true;
  handler("confirmPublishSites", context)();
  assert.equal(context.open, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /EBAY XL/);
  assert.equal(calls[0][1], "error");
});
