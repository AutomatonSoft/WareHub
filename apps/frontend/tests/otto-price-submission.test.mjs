import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parseOttoPrice } from "../app/create-product/otto-create-product-model.mjs";

const source = readFileSync(new URL("../app/create-product/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submit;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "submitOttoCreate") submit = node;
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(submit);
const code = ts.transpileModule(`${submit.getText(tree)}\nsubmitOttoCreate(["otto-xl"], "otto_xl");`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test("OTTO price parser accepts decimal comma and dot without serializing NaN", () => {
  for (const price of ["700,50", "700.50", " 700,50 ", 700.5]) assert.equal(parseOttoPrice(price), 700.5);
  for (const price of ["", " ", "abc", "NaN", "Infinity", "-10", "1,2,3", "12.345"]) assert.equal(parseOttoPrice(price), null);
});

for (const price of ["700,50", "700.50", "invalid"]) {
  test(`actual OTTO submit handler ${price === "invalid" ? "blocks invalid price" : `sends numeric price for ${price}`}`, async () => {
    const sent = [];
    const failures = [];
    const draft = { price, quantity: "1", ean: "4071489368840", sku: "4071489368840", productReference: "source_SOFORT_XL", productLine: "Sessel", deliveryTime: "14", shippingProfileId: "shipping", category: "Sessel", description: "Sessel", bulletPoints: [] };
    await runInNewContext(code, {
      parseOttoPrice, activeDraftContextKey: "source", ottoDraftRefByTab: { current: { otto_xl: { sourceKey: "source", draft } } },
      reservedMarketplaceEans: { xl: "4071489368840" }, tabGalleryItemsByTab: {}, EMPTY_GALLERY_ITEMS: [],
      controller: { price: "999", handleCreateProduct: (...args) => sent.push(args) },
      feedback: { report: failure => { failures.push(failure); return "Invalid price"; } }, showToast: () => {},
      t: { validationPriceNumeric: "Enter a valid price" }, isOttoProductLineValid: () => true,
      ottoCategoryByTab: { otto_xl: "category" }, ottoProductsByProfile: {}, readOttoProductAttributes: () => [],
      fetchOttoCategoryAttributes: async () => [], applyOttoDefaultAttributes: value => value,
      deduplicateOttoAttributes: value => value, buildOttoPayloadAttributes: () => [], getLocalImageFilesForTab: () => [],
    });
    if (price === "invalid") {
      assert.equal(sent.length, 0);
      assert.equal(failures[0].field_errors.price, "Enter a valid price");
    } else {
      assert.equal(sent.length, 1);
      const payload = JSON.parse(JSON.stringify(sent[0][2]));
      assert.equal(payload.ottoPrice, "700.5");
      assert.equal(payload.ottoPayload.pricing.standardPrice.amount, 700.5);
      assert.equal(payload.ottoPayload.quantity, 1);
    }
  });
}

test("Product Editor applies a comma-decimal price without losing pricing metadata", () => {
  const source = readFileSync(new URL("../components/product-editor/product-editor-otto-panel.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let apply;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "applyCreateDraft") apply = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(apply);
  const code = ts.transpileModule(`const apply = ${apply.getText(tree)}; apply(next);`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let change;
  runInNewContext(code, {
    parseOttoPrice, next: { price: "700,50", deliveryTime: "14" },
    props: { draft: { pricing: { standardPrice: { amount: 999, currency: "EUR" }, vat: "FULL" }, delivery: {} }, onChange: value => { change = value; } },
    asRecord: value => value, textValue: value => String(value ?? ""), description: {}, sourceAttributes: [], toEditorAttributes: () => [],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(change.pricing)), { standardPrice: { amount: 700.5, currency: "EUR" }, vat: "FULL" });
});
