import test from "node:test";
import assert from "node:assert/strict";
import { buildWriteConfirmMessage, getRequiredEanError } from "../components/shared/write-guardrails-model.mjs";

test("getRequiredEanError returns label for empty ean", () => {
  assert.equal(getRequiredEanError(" ", { enterEan: "Enter EAN." }), "Enter EAN.");
});

test("buildWriteConfirmMessage builds stable message format", () => {
  const message = buildWriteConfirmMessage({
    actionLabel: "Send",
    entityLabel: "XL/JV item",
    entityId: " 4006381333931 ",
    confirmTail: "This action cannot be undone."
  });
  assert.equal(message, "Send XL/JV item 4006381333931? This action cannot be undone.");
});
