import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKauflandRequiredEanMessage,
  buildKauflandWriteConfirmMessage
} from "../components/channels/kaufland-write-guardrails-model.mjs";

test("buildKauflandWriteConfirmMessage builds delete confirmation", () => {
  const msg = buildKauflandWriteConfirmMessage({
    action: "delete",
    ean: " 4006381333931 ",
    labels: { delete: "Delete", deleteUserConfirmTail: "This action cannot be undone." }
  });
  assert.equal(msg, "Delete Kaufland product 4006381333931? This action cannot be undone.");
});

test("buildKauflandWriteConfirmMessage uses sendUpdate label for change", () => {
  const msg = buildKauflandWriteConfirmMessage({
    action: "change",
    ean: "4006381333931",
    labels: { sendUpdate: "Send update", deleteUserConfirmTail: "Cannot be undone." }
  });
  assert.equal(msg, "Send update Kaufland product 4006381333931? Cannot be undone.");
});

test("buildKauflandRequiredEanMessage returns stable action-specific text", () => {
  assert.equal(buildKauflandRequiredEanMessage("create"), "Create form: EAN is required.");
  assert.equal(buildKauflandRequiredEanMessage("delete"), "Delete form: EAN is required.");
});
