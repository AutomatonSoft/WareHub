import assert from "node:assert/strict";
import test from "node:test";

import {
  applyReservedOttoIdentity,
  applyOttoAttributeSuggestions,
  applyOttoDefaultAttributes,
  buildOttoPayloadAttributes,
  extractOttoMediaUrls,
  isOttoProductLineValid,
  OTTO_PRODUCT_LINE_MAX_LENGTH,
} from "../app/create-product/otto-create-product-model.mjs";

test("OTTO defaults use category IDs, replace source templates and preserve manual edits, blanks and removals", () => {
  const draft = { additionalAttributes: { care: "Custom care", blank: "" }, attributeOverrides: {}, attributeNames: {}, removedAttributeIds: ["removed"] };
  const source = [{ attributeId: "source-brand", name: "Marke laut BattVO", values: ["XLMOEBEL"] }];
  const defaults = [
    { id: "category-brand", name: "Marke laut BattVO", defaultValue: "JVMOEBEL" },
    { id: "care", name: "Pflegehinweise", defaultValue: "Default care" },
    { id: "blank", name: "Farbhinweise", defaultValue: "Default color" },
    { id: "removed", name: "Geschlecht", defaultValue: "Unisex" },
    { id: "weee", name: "WEEE-Reg. Nr.", defaultValue: "46974041" },
    { id: "other", name: "Other attribute" },
  ];
  const next = applyOttoDefaultAttributes(draft, source, defaults);
  assert.equal(next.attributeOverrides["source-brand"], "JVMOEBEL");
  assert.deepEqual(next.additionalAttributes, { care: "Custom care", blank: "", weee: "46974041" });
  assert.deepEqual(draft.attributeOverrides, {});
  assert.equal(applyOttoDefaultAttributes(next, source, defaults), next);
  const payload = buildOttoPayloadAttributes({ ...next, productAttributes: source });
  assert.deepEqual(payload.find(attribute => attribute.name === "Marke laut BattVO").values, ["JVMOEBEL"]);
  assert.equal(payload.filter(attribute => attribute.name === "Marke laut BattVO").length, 1);
});

test("OTTO AI fills only missing attributes and preserves edits and removals", () => {
  const draft = { additionalAttributes: { color: "Weiß" }, attributeOverrides: { width: "100" }, attributeNames: { color: "Farbe", width: "Breite" }, removedAttributeIds: ["material"] };
  const source = [{ attributeId: "width", name: "Breite", values: ["90"] }];
  const result = applyOttoAttributeSuggestions(draft, source, [
    { id: "color", name: "Farbe", value: "Gold" },
    { id: "width", name: "Breite", value: "95" },
    { id: "material", name: "Material", value: "Holz" },
    { id: "height", name: "Höhe", value: "65" },
  ]);
  assert.equal(result.applied, 1);
  assert.deepEqual(result.draft.additionalAttributes, { color: "Weiß", height: "65" });
  assert.deepEqual(result.draft.attributeOverrides, { width: "100" });
  assert.deepEqual(draft.additionalAttributes, { color: "Weiß" });
  assert.equal(applyOttoAttributeSuggestions(result.draft, source, [{ id: "height", name: "Höhe", value: "65" }]).applied, 0);
});

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
