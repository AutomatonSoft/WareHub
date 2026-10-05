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
    primaryActionLoading: false,
    publishingBatchRef: { current: false },
    setPublishingBatch: () => {},
    XL_MARKETPLACE_SITE_IDS: [],
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
  await handler("confirmPublishSites", context)();
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
  await handler("confirmPublishSites", context)();
  assert.equal(context.open, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /EBAY XL/);
  assert.equal(calls[0][1], "error");
});

function publicationContext(activeTab = "xl") {
  const calls = [];
  const sites = [
    { id: "xlmoebel_de", family: "XL", kind: "XL", name: "XL DE" },
    { id: "xlmoebel_ch", family: "XL", kind: "XL", name: "XL CH" },
    { id: "jvmoebel-de", family: "JVMOEBEL", kind: "JV", name: "JV DE" },
    ...["HOOD", "KAUFLAND", "OTTO", "EBAY"].flatMap(family => ["JV", "XL"].map(kind => ({ id: `${family.toLowerCase()}-${kind.toLowerCase()}`, family, kind, name: `${family} ${kind}` }))),
  ];
  const snapshots = family => ({ current: Object.fromEntries(["jv", "xl"].map(account => [
    `${family}_${account}`, { sourceKey: family === "hood" ? `kid-42:HOOD_${account.toUpperCase()}` : "kid-42", draft: { name: `${family}-${account}`, title: `${family}-${account}`, ean: account, fields: {} } },
  ])) });
  const context = {
    allMarketplaceSites: sites, selectedPublishSiteIds: new Set(sites.map(site => site.id)),
    activeTab, activeDraftContextKey: "kid-42", primaryActionLoading: false,
    publishingBatchRef: { current: false },
    JV_SITE_KEY_BY_MARKETPLACE_SITE_ID: { "jvmoebel-de": "JV_DE" }, XL_MARKETPLACE_SITE_IDS: ["xlmoebel_de", "xlmoebel_ch"],
    ebayDraftRefByTab: snapshots("ebay"), hoodDraftRefByTab: snapshots("hood"), kauflandDraftRefByTab: snapshots("kaufland"), ottoDraftRefByTab: snapshots("otto"),
    xlDraftRefByTab: { current: { xl: { sourceKey: "kid-42", sourceCurrency: "CHF", draft: { name: "XL saved draft" } } } },
    xlPublishingSelectionsRef: { current: { rubricIdsBySite: { XLMOEBEL_DE: [1], XLMOEBEL_CH: [2] }, mainRubricIdBySite: {}, deliveryIdsBySite: { XLMOEBEL_DE: [10], XLMOEBEL_CH: [20] } } },
    hoodPublishDraftRef: { current: null },
    tabGalleryItemsByTab: Object.fromEntries(["xl", "hood_jv", "hood_xl", "kaufland_jv", "kaufland_xl", "ebay_jv", "ebay_xl"].map(tab => [tab, [{ src: `https://photos.example/${tab}.jpg`, isLocal: false }]])),
    getLocalImageFilesForTab: tab => [tab],
    setIsPublishSitesDialogOpen: value => { context.open = value; },
    setPublishingBatch: value => { context.busy = value; },
    feedback: { report: error => String(error) },
    showToast: (...args) => calls.push({ kind: "toast", args }),
    handleSendToAllJvSites: async keys => calls.push({ kind: "JV", keys }),
    submitOttoCreate: async (ids, tab) => calls.push({ kind: "OTTO", ids, tab }),
    submitKauflandCreate: async (ids, tab, draft) => calls.push({ kind: "KAUFLAND", ids, tab, draft }),
    controller: {
      handleCreateProduct: async (_, ids, draft, files) => calls.push({ kind: "EBAY", ids, draft, files }),
      handleCreateProductForHoodSiteIds: async (ids, draft, files) => calls.push({ kind: "HOOD", ids, draft, files }),
      handleCreateProductForXlDefaultSite: async (draft, files, options) => calls.push({ kind: "XL", draft, files, options }),
    },
  };
  return { context, calls };
}

test("mixed publication routes every selected site with account-specific drafts, regardless of active tab", async () => {
  for (const activeTab of ["xl", "jv", "otto_xl", "ebay_jv"]) {
    const { context, calls } = publicationContext(activeTab);
    await handler("confirmPublishSites", context)();
    assert.equal(calls.length, 10);
    assert.equal(context.busy, false);
    assert.equal(context.publishingBatchRef.current, false);
    const xl = calls.find(call => call.kind === "XL");
    assert.deepEqual(Array.from(xl.options.siteKeys), ["XLMOEBEL_DE", "XLMOEBEL_CH"]);
    assert.equal(xl.draft.name, "XL saved draft");
    assert.equal(xl.options.sourceCurrency, "CHF");
    for (const family of ["HOOD", "KAUFLAND", "OTTO", "EBAY"]) {
      const publications = calls.filter(call => call.kind === family);
      assert.equal(publications.length, 2);
      assert.deepEqual(publications.map(call => call.ids[0]).sort(), [`${family.toLowerCase()}-jv`, `${family.toLowerCase()}-xl`]);
      for (const publication of publications) {
        const account = publication.ids[0].split("-")[1];
        if (family === "HOOD") {
          assert.equal(publication.draft.ean, account);
          assert.equal(publication.draft.imageUrls[0], `https://photos.example/hood_${account}.jpg`);
        }
        if (family === "KAUFLAND") assert.equal(publication.draft.title, `kaufland-${account}`);
      }
    }
  }
});

test("missing or stale cross-marketplace draft blocks the whole batch before any request", async () => {
  const { context, calls } = publicationContext();
  context.kauflandDraftRefByTab.current.kaufland_xl.sourceKey = "previous-kid";
  await handler("confirmPublishSites", context)();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, "toast");
  assert.match(calls[0].args[0], /KAUFLAND XL/);
  assert.equal(context.publishingBatchRef.current, false);
});

test("batch stays busy after early success or failure and blocks duplicate clicks until the last request settles", async () => {
  const { context, calls } = publicationContext();
  context.selectedPublishSiteIds = new Set(["xlmoebel_de", "kaufland-jv"]);
  let finishXl;
  let failKaufland;
  context.controller.handleCreateProductForXlDefaultSite = () => new Promise(resolve => { finishXl = resolve; calls.push("XL"); });
  context.submitKauflandCreate = () => new Promise((resolve, reject) => { failKaufland = reject; calls.push("KAUFLAND"); });
  const confirm = handler("confirmPublishSites", context);
  const pending = confirm();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.busy, true);
  await confirm();
  assert.equal(calls.length, 2);
  failKaufland(new Error("Kaufland unavailable"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.busy, true);
  assert.equal(context.publishingBatchRef.current, true);
  finishXl();
  await pending;
  assert.equal(context.busy, false);
  assert.equal(context.publishingBatchRef.current, false);
  assert.match(calls[2].args[0], /Kaufland unavailable/);
});

test("controller submission counter keeps concurrent calls busy until all finish", () => {
  const source = readFileSync(new URL("../app/create-product/use-create-product-controller.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("controller.ts", source, ts.ScriptTarget.Latest, true);
  let found;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "setSubmitting") found = node;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(found);
  let count = 0;
  const compiled = ts.transpileModule(found.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const setSubmitting = runInNewContext(`${compiled}\nsetSubmitting`, { setPendingSubmissions: update => { count = update(count); } });
  setSubmitting(true);
  setSubmitting(true);
  setSubmitting(false);
  assert.equal(count, 1);
  setSubmitting(false);
  assert.equal(count, 0);
});

test("JV handler awaits gallery uploads and job submission instead of finishing in the background", async () => {
  let finishUpload;
  let queued = false;
  let finished = false;
  const context = {
    jvDraftRef: { current: { name: "JV lamp", artikelnr: "4067282464896" } },
    controller: { kidContext: {}, sourceSnapshot: {} }, sourcePayload: {},
    asTrimmedString: value => String(value || "").trim(),
    JV_RUBRIC_SITE_TABS: [{ key: "JV_DE", label: "JV DE" }],
    JV_PUBLIC_BASE_BY_SITE_KEY: { JV_DE: "https://www.jvmoebel.de" },
    getEffectiveJvPublishingSelections: () => ({ rubricIds: [1], mainRubricId: 1, deliveryIds: [2] }),
    window: { confirm: () => true },
    t: new Proxy({}, { get: () => "{ean} {count} {jobId}" }),
    setSendAllSitesLoading: () => {}, setSendAllSitesStatus: () => {}, showToast: () => {},
    isMountedRef: { current: true },
    uploadGalleryForSite: () => new Promise(resolve => { finishUpload = resolve; }),
    buildPayloadForSite: () => ({}),
    xljvEnqueueCreateJob: async () => { queued = true; return { response: { ok: true }, payload: { job: { id: 1 } } }; },
    feedback: { report: error => { throw error; } },
  };
  const pending = handler("handleSendToAllJvSites", context)(["JV_DE"]).then(() => { finished = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  assert.equal(queued, false);
  finishUpload([]);
  await pending;
  assert.equal(queued, true);
  assert.equal(finished, true);
});
