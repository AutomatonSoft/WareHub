import test from "node:test";
import assert from "node:assert/strict";
import { formatUploadBytes } from "../components/inventory/upload-batch-summary.mjs";

test("formatUploadBytes formats byte ranges", () => {
  assert.equal(formatUploadBytes(0), "0 B");
  assert.equal(formatUploadBytes(512), "512 B");
  assert.equal(formatUploadBytes(1536), "1.5 KB");
  assert.equal(formatUploadBytes(5 * 1024 * 1024), "5.00 MB");
});
