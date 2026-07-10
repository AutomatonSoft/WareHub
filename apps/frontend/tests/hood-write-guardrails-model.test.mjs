import test from "node:test";
import assert from "node:assert/strict";
import { buildHoodWriteConfirmMessage } from "../components/hood/hood-write-guardrails-model.mjs";

test("buildHoodWriteConfirmMessage builds patch confirmation", () => {
  const msg = buildHoodWriteConfirmMessage({
    action: "patch",
    ean: " 4006381333931 ",
    labels: { patchAction: "Patch", deleteUserConfirmTail: "This action cannot be undone." }
  });
  assert.equal(msg, "Patch HOOD 4006381333931? This action cannot be undone.");
});

test("buildHoodWriteConfirmMessage builds delete image confirmation", () => {
  const msg = buildHoodWriteConfirmMessage({
    action: "delete_image",
    ean: "4006381333931",
    labels: { deleteFromFtp: "Delete from FTP", deleteUserConfirmTail: "Cannot be undone." }
  });
  assert.equal(msg, "Delete from FTP HOOD 4006381333931? Cannot be undone.");
});
