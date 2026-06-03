import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCreateProductApiError,
  extractErrorTextFromBody,
  normalizeCreateProductRuntimeError
} from "../app/create-product/create-product-api-errors.mjs";

test("create product api errors: formats message with status and suffix", () => {
  const text = formatCreateProductApiError(502, "upstream timeout", "Orchestrator job create failed.");
  assert.equal(text, "Orchestrator job create failed. HTTP 502 - upstream timeout");
});

test("create product api errors: extracts message/code from body", () => {
  assert.equal(extractErrorTextFromBody({ message: "bad request" }), "bad request");
  assert.equal(extractErrorTextFromBody({ code: "invalid_payload" }), "invalid_payload");
  assert.equal(extractErrorTextFromBody({}), "");
});

test("create product api errors: normalizes runtime errors", () => {
  assert.equal(normalizeCreateProductRuntimeError(new Error("boom"), "fallback"), "boom");
  assert.equal(normalizeCreateProductRuntimeError(null, "fallback"), "fallback");
});
