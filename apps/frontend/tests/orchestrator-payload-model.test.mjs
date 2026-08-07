import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDirectUpdatePayload,
  buildJobUpdatePayload,
  deduplicateOttoAttributes,
} from "../app/create-product/orchestrator-payload-model.mjs";

test("deduplicateOttoAttributes collapses duplicate names and keeps the last value", () => {
  const attributes = deduplicateOttoAttributes([
    { name: "Breite", values: ["80"] },
    { name: "  breite ", values: ["90"] },
    { name: "Höhe", values: ["100"] },
  ]);

  assert.deepEqual(attributes, [
    { name: "Breite", values: ["90"] },
    { name: "Höhe", values: ["100"] },
  ]);
});

test("buildDirectUpdatePayload builds full update payload", () => {
  const payload = buildDirectUpdatePayload({
    ean: "4006381333931",
    productName: "Chair",
    price: "199.99",
    imageUrls: ["https://cdn/1.jpg", "https://cdn/2.jpg"]
  });

  assert.equal(payload.productReference, "4006381333931-AUTO");
  assert.equal(payload.ean, "4006381333931");
  assert.deepEqual(payload.picture_urls, ["https://cdn/1.jpg", "https://cdn/2.jpg"]);
  assert.deepEqual(payload.mediaAssets, [
    { url: "https://cdn/1.jpg", role: "MAIN" },
    { url: "https://cdn/2.jpg", role: "ALT" }
  ]);
});

test("buildJobUpdatePayload keeps only job-required fields", () => {
  const payload = buildJobUpdatePayload({
    ean: "4006381333931",
    productName: "Table",
    price: "89.00",
    imageUrls: ["https://cdn/table.jpg"]
  });

  assert.equal(payload.productReference, undefined);
  assert.equal(payload.ean, undefined);
  assert.equal(payload.title, "Table");
  assert.equal(payload.description, "Table");
  assert.equal(payload.price, "89.00");
  assert.deepEqual(payload.images, ["https://cdn/table.jpg"]);
});

test("buildJobUpdatePayload preserves Hood marketplace fields", () => {
  const payload = buildJobUpdatePayload({
    ean: "4006381333931",
    productName: "Table",
    price: "89.00",
    imageUrls: [],
    additionalPayload: { categoryID: "2412", condition: "new", itemMode: "shopProduct" }
  });

  assert.equal(payload.categoryID, "2412");
  assert.equal(payload.condition, "new");
  assert.equal(payload.itemMode, "shopProduct");
});
