import test from "node:test";
import assert from "node:assert/strict";
import { ebayListingTextErrors, ebayImageUrlsError, ebayCategoryAspectErrors } from "../app/create-product/create-product-model.ts";

test("eBay title and subtitle boundaries reject empty and oversized imported text", () => {
  assert.deepEqual(ebayListingTextErrors("x".repeat(80), "x".repeat(55)), {});
  assert.ok(ebayListingTextErrors("x".repeat(81), "").title);
  assert.ok(ebayListingTextErrors("Title", "x".repeat(56)).subtitle);
  assert.ok(ebayListingTextErrors(" ", "").title);
});

test("standard eBay image validation requires 1–24 absolute HTTPS URLs", () => {
  assert.equal(ebayImageUrlsError(["https://example.com/image.jpg"]), null);
  assert.equal(ebayImageUrlsError(Array.from({ length: 24 }, (_, index) => `https://example.com/${index}.jpg`)), null);
  for (const urls of [[], Array(25).fill("https://example.com/image.jpg"), ["http://example.com/image.jpg"], ["/image.jpg"], ["invalid"]]) {
    assert.ok(ebayImageUrlsError(urls));
  }
});

test("eBay aspects enforce required, cardinality, selection and category length constraints", () => {
  const aspects = [
    { localizedAspectName: "Produktart", aspectConstraint: { aspectRequired: true, itemToAspectCardinality: "SINGLE", aspectMode: "SELECTION_ONLY" }, aspectValues: [{ localizedValue: "Sessel" }] },
    { localizedAspectName: "Details", aspectConstraint: { aspectMaxLength: 200 } },
  ];
  assert.ok(ebayCategoryAspectErrors(aspects, {}).Produktart);
  assert.ok(ebayCategoryAspectErrors(aspects, { Produktart: ["Unknown"] }).Produktart);
  assert.ok(ebayCategoryAspectErrors(aspects, { Produktart: ["Sessel", "Sessel"] }).Produktart);
  assert.deepEqual(ebayCategoryAspectErrors(aspects, { Produktart: ["Sessel"], Details: ["x".repeat(200)], Custom: ["x".repeat(65)] }), {});
  assert.ok(ebayCategoryAspectErrors(aspects, { Produktart: ["Sessel"], Details: ["x".repeat(201)] }).Details);
  assert.ok(ebayCategoryAspectErrors([], { Custom: ["x".repeat(66)] }).Custom);
  assert.ok(ebayCategoryAspectErrors([], { Custom: [""] }).Custom);
});
