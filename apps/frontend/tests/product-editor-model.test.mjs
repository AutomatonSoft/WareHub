import test from "node:test";
import assert from "node:assert/strict";
import {
  attributesToProductProperties,
  buildHoodChangedFields,
  buildJvChangedFields,
  containsTechnicalDescriptionHtml,
  countFoundTargets,
  createEmptyHoodDraft,
  createEmptyJvDraft,
  getGalleryMainImage,
  getGroupStatusCopy,
  hydrateHoodDraft,
  normalizeHoodProperties,
  normalizeProductAttributes,
  sanitizeDescriptionPreviewHtml
} from "../components/product-editor/product-editor-model.mjs";

test("product editor hood model detects only changed draft fields", () => {
  const initial = {
    ...createEmptyHoodDraft(),
    title: "Desk",
    price: "19.99",
    images: ["https://img/1.jpg", "https://img/2.jpg"]
  };
  const current = {
    ...initial,
    price: "21.50",
    images: ["https://img/1.jpg"]
  };

  assert.deepEqual(buildHoodChangedFields(initial, current), ["price", "images"]);
});

test("product editor hood model marks productProperties as changed", () => {
  const initial = { ...createEmptyHoodDraft(), productProperties: [{ name: "Marke", value: "JV" }] };
  const current = { ...initial, productProperties: [{ name: "Marke", value: "Other" }] };
  assert.equal(buildHoodChangedFields(initial, current).includes("productProperties"), true);
});

test("product editor model counts found targets across groups", () => {
  const groups = [
    { targets: [{ status: "found" }, { status: "missing" }] },
    { targets: [{ status: "found" }, { status: "planned" }] }
  ];

  assert.equal(countFoundTargets(groups), 2);
});

test("product editor model derives group status copy", () => {
  assert.equal(getGroupStatusCopy(null), "Waiting for search");
  assert.equal(getGroupStatusCopy({ unsupported: true, planned: true, read_only: true }), "Unsupported");
  assert.equal(getGroupStatusCopy({ unsupported: false, planned: true, read_only: true }), "Planned");
  assert.equal(getGroupStatusCopy({ unsupported: false, planned: false, read_only: true }), "Read-only");
  assert.equal(getGroupStatusCopy({ unsupported: false, planned: false, read_only: false }), "Active");
});

test("product editor jv model detects scalar and relation changes", () => {
  const initial = createEmptyJvDraft();
  const current = {
    ...initial,
    price: "55.00",
    descriptions: [{ language_id: 1, name: "Desk", description: "<p>Desk</p>" }]
  };

  assert.deepEqual(buildJvChangedFields(initial, current).sort(), ["descriptions", "price"]);
});

test("product editor description detection finds technical html tags", () => {
  assert.equal(containsTechnicalDescriptionHtml("<meta charset='utf-8'><p>Desk</p>"), true);
  assert.equal(containsTechnicalDescriptionHtml("<div><strong>Desk</strong></div>"), false);
});

test("product editor description preview sanitization removes document-level technical html", () => {
  const raw = "<html><head><meta charset='utf-8'><link rel='x'><style>.x{}</style><script>alert(1)</script></head><body><p>Desk</p></body></html>";
  const sanitized = sanitizeDescriptionPreviewHtml(raw);
  assert.equal(sanitized.includes("<meta"), false);
  assert.equal(sanitized.includes("<link"), false);
  assert.equal(sanitized.includes("<style"), false);
  assert.equal(sanitized.includes("<script"), false);
  assert.equal(sanitized.includes("<head"), false);
  assert.equal(sanitized.includes("<body"), false);
  assert.equal(sanitized.includes("<p>Desk</p>"), true);
});

test("product editor description preview sanitization preserves regular product markup", () => {
  const raw = "<p>Desk</p><ul><li>Wood</li></ul><div><span>Ready</span></div>";
  const sanitized = sanitizeDescriptionPreviewHtml(raw);
  assert.equal(sanitized, raw);
});

test("product editor gallery helper prefers selected thumbnail when present", () => {
  const images = ["img-1", "img-2", "img-3"];
  assert.equal(getGalleryMainImage(images, "img-2"), "img-2");
  assert.equal(getGalleryMainImage(images, "img-x"), "img-1");
});

test("product editor attributes normalization supports array and object", () => {
  const fromArray = normalizeProductAttributes([{ name: "Marke", value: "JV" }]);
  assert.deepEqual(fromArray, [{ key: "Marke", label: "Marke", value: "JV" }]);

  const fromObject = normalizeProductAttributes({ color_name: "Brown" });
  assert.deepEqual(fromObject, [{ key: "color_name", label: "Color name", value: "Brown" }]);
});

test("product editor attributes writer keeps key/value shape", () => {
  const attributes = [
    { key: "Marke", label: "Marke", value: "JV" },
    { key: "Farbe", label: "Farbe", value: "Braun" }
  ];
  assert.deepEqual(attributesToProductProperties(attributes), [{ name: "Marke", value: "JV" }, { name: "Farbe", value: "Braun" }]);
});

test("product editor hood properties normalization drops empty names", () => {
  assert.deepEqual(normalizeHoodProperties([{ name: "Marke", value: "JV" }, { name: "", value: "skip" }]), [
    { name: "Marke", value: "JV" }
  ]);
});

test("product editor hood hydrate normalizes incoming productProperties", () => {
  const draft = hydrateHoodDraft(null, {
    ...createEmptyHoodDraft(),
    quantity: 3,
    productProperties: [{ key: "Farbe", value: "Braun" }, { name: "", value: "skip" }]
  });

  assert.deepEqual(draft.productProperties, [{ name: "Farbe", value: "Braun" }]);
  assert.equal(draft.quantity, "3");
});
