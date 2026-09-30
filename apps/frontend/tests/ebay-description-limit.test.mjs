import test from "node:test";
import assert from "node:assert/strict";
import { ebayInventoryDescriptionError } from "../app/create-product/create-product-model.ts";

test("eBay Inventory description requires 1–4000 characters including HTML", () => {
  assert.ok(ebayInventoryDescriptionError(" \n "));
  assert.equal(ebayInventoryDescriptionError("a"), null);
  assert.equal(ebayInventoryDescriptionError(` ${"a".repeat(4000)} `), null);
  assert.match(ebayInventoryDescriptionError("a".repeat(4001)), /4001.*4000/);
  assert.match(ebayInventoryDescriptionError(`<p>${"a".repeat(3994)}</p>`), /4001/);
  assert.match(ebayInventoryDescriptionError("a".repeat(7383)), /7383/);
});
