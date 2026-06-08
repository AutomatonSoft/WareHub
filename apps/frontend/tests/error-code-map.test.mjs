import test from "node:test";
import assert from "node:assert/strict";
import { mapApiErrorCodeToMessage } from "../app/error-code-map.mjs";

test("maps known backend error code to standardized UI message", () => {
  const message = mapApiErrorCodeToMessage({ code: "INVALID_CREDENTIALS" });
  assert.equal(message, "Invalid login or password.");
});

test("returns null for unknown error code", () => {
  const message = mapApiErrorCodeToMessage({ code: "SOME_NEW_UNKNOWN_CODE" });
  assert.equal(message, null);
});

test("returns null when payload has no code", () => {
  const message = mapApiErrorCodeToMessage({ message: "raw backend message" });
  assert.equal(message, null);
});
