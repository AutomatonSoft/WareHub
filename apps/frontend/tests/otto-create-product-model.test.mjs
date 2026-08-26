import assert from "node:assert/strict";
import test from "node:test";

import {
  applyReservedOttoIdentity,
  buildOttoPayloadAttributes,
  extractOttoMediaUrls,
  isOttoProductLineValid,
  OTTO_PRODUCT_LINE_MAX_LENGTH,
} from "../app/create-product/otto-create-product-model.mjs";

test("reserved OTTO EAN replaces SKU and EAN without changing product reference", () => {
  assert.deepEqual(
    applyReservedOttoIdentity(
      { productReference: "old-reference", sku: "old-sku", ean: "old-ean", productLine: "Chair" },
      "4260123456789",
    ),
    { productReference: "old-reference", sku: "4260123456789", ean: "4260123456789", productLine: "Chair" },
  );
});

test("OTTO product line is limited to 70 characters", () => {
  assert.equal(OTTO_PRODUCT_LINE_MAX_LENGTH, 70);
  assert.equal(isOttoProductLineValid("x".repeat(70)), true);
  assert.equal(isOttoProductLineValid("x".repeat(71)), false);
});

test("OTTO payload retains untouched attributes while applying changes and removals", () => {
  const attributes = buildOttoPayloadAttributes({
    productAttributes: [
      { attributeId: "width", name: "Breite", values: ["90"] },
      { attributeId: "colour", name: "Farbe", values: ["Weiß", "Schwarz"] },
      { attributeId: "removed", name: "Material", values: ["Holz"] },
    ],
    attributeOverrides: { width: "100" },
    additionalAttributes: { height: "60" },
    attributeNames: { width: "Breite", height: "Höhe" },
    removedAttributeIds: ["removed"],
  });

  assert.deepEqual(attributes, [
    { name: "Breite", values: ["100"] },
    { name: "Farbe", values: ["Weiß", "Schwarz"] },
    { name: "Höhe", values: ["60"] },
  ]);
});

test("OTTO media URLs include external assets and the resolved primary image", () => {
  assert.deepEqual(
    extractOttoMediaUrls({
      imageUrl: "https://i.otto.de/i/otto/primary.jpg",
      mediaAssets: [
        { filename: "not-a-url.jpg" },
        { location: "https://cdn.example.test/gallery.jpg" },
        { url: "https://cdn.example.test/gallery.jpg" },
      ],
    }),
    ["https://i.otto.de/i/otto/primary.jpg", "https://cdn.example.test/gallery.jpg"],
  );
});
