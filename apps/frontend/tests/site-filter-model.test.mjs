import test from "node:test";
import assert from "node:assert/strict";
import { sortMarketplaceSitesByName, filterMarketplaceSites } from "../app/create-product/site-filter-model.mjs";

test("sortMarketplaceSitesByName sorts by display name", () => {
  const sorted = sortMarketplaceSitesByName([
    { id: "2", name: "Zulu" },
    { id: "1", name: "Alpha" }
  ]);
  assert.deepEqual(sorted.map((x) => x.id), ["1", "2"]);
});

test("filterMarketplaceSites filters by query and selection flag", () => {
  const sites = [
    { id: "hood-de", name: "Hood DE" },
    { id: "kaufland-de", name: "Kaufland DE" },
    { id: "xl-fr", name: "XL FR" }
  ];

  const result = filterMarketplaceSites({
    sites,
    query: "de",
    showSelectedOnly: true,
    selectedSiteIds: ["kaufland-de", "xl-fr"]
  });

  assert.deepEqual(result.map((x) => x.id), ["kaufland-de"]);
});

test("filterMarketplaceSites is case-insensitive and trims query", () => {
  const sites = [
    { id: "hood-de", name: "Hood DE" },
    { id: "kaufland-de", name: "Kaufland DE" }
  ];

  const result = filterMarketplaceSites({
    sites,
    query: "  KAUF  ",
    showSelectedOnly: false,
    selectedSiteIds: []
  });

  assert.deepEqual(result.map((x) => x.id), ["kaufland-de"]);
});
