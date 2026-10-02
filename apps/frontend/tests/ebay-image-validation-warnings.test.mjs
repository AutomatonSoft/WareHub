import test from "node:test";
import assert from "node:assert/strict";
import { excludedEbayImages } from "../components/ebay/image-validation-warnings-model.ts";

const report = { image_validation: { removed_images: [
  { url: "https://images.test/small.jpg", reason: "too_small", width: 492, height: 330 },
  { url: "https://images.test/good.jpg", reason: "duplicate" },
] } };

test("excluded images survive publish, editor and toggle response envelopes", () => {
  for (const payload of [
    { result: { results: [{ target: "ebay,account=dep", data: report }] } },
    { targets: [{ target_id: "EBAY_DEP", data: report }] },
    { results: [{ site_key: "EBAY_DEP", details: { listing: report } }] },
  ]) {
    const images = excludedEbayImages(payload);
    assert.equal(images.length, 2);
    assert.equal(images[0].width, 492);
    assert.match(images[0].target, /dep/i);
    assert.equal(excludedEbayImages(JSON.stringify(payload)).length, 2);
  }
});

test("malformed and unrelated responses do not produce warnings", () => {
  for (const payload of [null, "invalid JSON", {}, { removed_images: [null, {}, { url: "x", reason: "unknown" }] }]) {
    assert.deepEqual(excludedEbayImages(payload), []);
  }
});

test("warnings are deduplicated per account, not across accounts", () => {
  const images = excludedEbayImages({ results: [
    { target_id: "EBAY_JV", data: report, details: report },
    { target_id: "EBAY_XL", data: report },
  ] });
  assert.equal(images.length, 4);
});
