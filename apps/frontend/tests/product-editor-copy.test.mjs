import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_EDITOR_PLACEHOLDER_DETAILS,
  PRODUCT_EDITOR_TAB_COPY
} from "../components/product-editor/product-editor-copy.mjs";

test("product editor copy keeps HOOD/JV labels and placeholder guidance", () => {
  assert.equal(PRODUCT_EDITOR_TAB_COPY.HOOD.label, "HOOD");
  assert.equal(PRODUCT_EDITOR_TAB_COPY.JV.label, "JV");
  assert.equal(PRODUCT_EDITOR_PLACEHOLDER_DETAILS.XL.length, 3);
  assert.equal(PRODUCT_EDITOR_PLACEHOLDER_DETAILS.EBAY[1], "No editing or apply actions can be triggered from this tab.");
});
