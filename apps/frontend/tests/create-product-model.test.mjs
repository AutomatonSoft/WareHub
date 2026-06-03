import test from "node:test";
import assert from "node:assert/strict";
import {
  parseImageUrlsFromText,
  validateCreateProductInput,
  normalizeCreateProductInput
} from "../app/create-product/create-product-model.mjs";

test("parseImageUrlsFromText trims and removes empty lines", () => {
  const urls = parseImageUrlsFromText("  https://cdn/1.jpg  \n\nhttps://cdn/2.jpg\r\n");
  assert.deepEqual(urls, ["https://cdn/1.jpg", "https://cdn/2.jpg"]);
});

test("validateCreateProductInput returns errors for invalid values", () => {
  const result = validateCreateProductInput({ ean: "123", price: "abc", productName: "ab", imagesText: "" });
  assert.equal(result.isValid, false);
  assert.equal(result.errors.ean, "ean_exactly_13_digits");
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
