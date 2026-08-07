import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHoodCreatePayload,
  parseImageUrlsFromText,
  validateHoodCreateFields,
  validateCreateProductInput,
  normalizeCreateProductInput
} from "../app/create-product/create-product-model.mjs";

test("parseImageUrlsFromText trims and removes empty lines", () => {
  const urls = parseImageUrlsFromText("  https://cdn/1.jpg  \n\nhttps://cdn/2.jpg\r\n");
  assert.deepEqual(urls, ["https://cdn/1.jpg", "https://cdn/2.jpg"]);
});

test("Hood create fields validate and build the marketplace payload", () => {
  const fields = {
    description: "A desk",
    quantity: "2",
    condition: "new",
    itemMode: "shopProduct",
    itemNumber: "",
    productPropertiesText: '[{"name":"Material","value":"Wood"}]'
  };

  assert.deepEqual(validateHoodCreateFields(fields), {});
  assert.deepEqual(buildHoodCreatePayload({ ean: "4006381333931", fields }), {
    description: "A desk",
    quantity: 2,
    categoryID: "2412",
    condition: "new",
    itemMode: "shopProduct",
    itemNumber: "4006381333931",
    productProperties: [{ name: "Material", value: "Wood" }]
  });
});

test("validateCreateProductInput does not require a 13-digit EAN", () => {
  const result = validateCreateProductInput({ ean: "123", price: "abc", productName: "ab", imagesText: "" });
  assert.equal(result.isValid, false);
  assert.equal(result.errors.ean, undefined);
  assert.equal(result.errors.price, "price_numeric");
  assert.equal(result.errors.productName, "product_name_min_3");
});

test("normalizeCreateProductInput trims and normalizes decimal separator", () => {
  const normalized = normalizeCreateProductInput({
    ean: " 4006381333931 ",
    price: " 199,99 ",
    productName: "  Chair  ",
    imagesText: "https://cdn/1.jpg\n"
  });

  assert.deepEqual(normalized, {
    ean: "4006381333931",
    price: "199.99",
    productName: "Chair",
    imageUrls: ["https://cdn/1.jpg"]
  });
});

test("validateCreateProductInput accepts valid values", () => {
  const result = validateCreateProductInput({
    ean: "4006381333931",
    price: "199.99",
    productName: "Dining Chair",
    imagesText: ""
  });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, {});
});
