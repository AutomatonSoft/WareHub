import test from "node:test";
import assert from "node:assert/strict";

import { missingRequiredEbayAspects } from "../app/create-product/create-product-model.ts";

const categoryAspects = [
  { localizedAspectName: "Produktart", aspectConstraint: { aspectRequired: true } },
  { localizedAspectName: "Marke", aspectConstraint: { aspectRequired: true } },
  { localizedAspectName: "Farbe", aspectConstraint: { aspectRequired: false } },
];

test("eBay preflight lists only missing required category aspects", () => {
  assert.deepEqual(missingRequiredEbayAspects(categoryAspects, { Marke: ["Depotum"], Produktart: [" "] }), ["Produktart"]);
});

test("eBay preflight accepts a non-empty value in each required aspect", () => {
  assert.deepEqual(missingRequiredEbayAspects(categoryAspects, { Marke: ["Depotum"], Produktart: ["Sessel"] }), []);
});
