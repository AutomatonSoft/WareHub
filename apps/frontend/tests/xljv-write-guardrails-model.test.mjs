import test from "node:test";
import assert from "node:assert/strict";
import { buildXLJVWriteConfirmMessage } from "../components/xljv/xljv-write-guardrails-model.mjs";

test("buildXLJVWriteConfirmMessage builds sync confirmation", () => {
  const msg = buildXLJVWriteConfirmMessage({
    action: "sync",
    ean: " 4006381333931 ",
    labels: { sync: "Sync", deleteUserConfirmTail: "This action cannot be undone." }
  });
  assert.equal(msg, "Sync XL/JV 4006381333931? This action cannot be undone.");
});

test("buildXLJVWriteConfirmMessage builds send-to-all confirmation", () => {
  const msg = buildXLJVWriteConfirmMessage({
    action: "send_all_sites",
    ean: "4006381333931",
    labels: { sendToAllSites: "Send to all sites", deleteUserConfirmTail: "Cannot be undone." }
  });
  assert.equal(msg, "Send to all sites XL/JV 4006381333931? Cannot be undone.");
});
