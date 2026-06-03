import test from "node:test";
import assert from "node:assert/strict";
import { isEan13, normalizeEanInputLines } from "../components/editor/ean-input-model.mjs";

test("normalizeEanInputLines trims and removes empty and duplicate values", () => {
  const normalized = normalizeEanInputLines(" 4006381333931 \n\n4006381333932\n4006381333931\n");
  assert.deepEqual(normalized, ["4006381333931", "4006381333932"]);
});

test("isEan13 validates exactly 13 digits", () => {
  assert.equal(isEan13("4006381333931"), true);
  assert.equal(isEan13(" 4006381333931 "), true);
  assert.equal(isEan13("400638133393"), false);
  assert.equal(isEan13("40063813339312"), false);
  assert.equal(isEan13("40063813339AA"), false);
});
