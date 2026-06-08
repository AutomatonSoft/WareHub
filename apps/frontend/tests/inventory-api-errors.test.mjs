import test from "node:test";
import assert from "node:assert/strict";
import { formatApiErrorText } from "../components/inventory/inventory-api-errors.mjs";

test("inventory api errors: formats message with status and suffix", () => {
  const text = formatApiErrorText(409, "{\"code\":\"ean_pool_empty\"}", "Take next EAN failed.");
  assert.equal(text, "Take next EAN failed. HTTP 409 - {\"code\":\"ean_pool_empty\"}");
});

test("inventory api errors: omits suffix when empty", () => {
  const text = formatApiErrorText(500, "", "Reserve EAN failed.");
  assert.equal(text, "Reserve EAN failed. HTTP 500");
});
