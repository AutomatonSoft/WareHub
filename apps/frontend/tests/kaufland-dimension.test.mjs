import test from "node:test";
import assert from "node:assert/strict";

import { normalizeKauflandDimension } from "../app/create-product/create-product-model.ts";

test("Kaufland dimensions remove centimeter units and normalize decimal commas", () => {
  assert.equal(normalizeKauflandDimension("65 cm"), "65");
  assert.equal(normalizeKauflandDimension("160 CM"), "160");
  assert.equal(normalizeKauflandDimension("80,5 cm"), "80.5");
});

test("Kaufland dimensions retain invalid values for validation", () => {
  assert.equal(normalizeKauflandDimension("160 x 80 cm"), "160 x 80 cm");
  assert.equal(normalizeKauflandDimension(""), "");
});
