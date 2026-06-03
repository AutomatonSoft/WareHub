import test from "node:test";
import assert from "node:assert/strict";
import { isEan13, normalizeEanOrFallback } from "../components/inventory/ean-utils.mjs";

test("inventory ean utils: isEan13 accepts exactly 13 digits", () => {
  assert.equal(isEan13("4006381333931"), true);
  assert.equal(isEan13(" 4006381333931 "), true);
  assert.equal(isEan13("400638133393"), false);
  assert.equal(isEan13("400638133393A"), false);
});

test("inventory ean utils: normalizeEanOrFallback trims and falls back", () => {
  assert.equal(normalizeEanOrFallback(" 4006381333931 "), "4006381333931");
  assert.equal(normalizeEanOrFallback(""), "0000000000000");
  assert.equal(normalizeEanOrFallback("", "N/A"), "N/A");
});
