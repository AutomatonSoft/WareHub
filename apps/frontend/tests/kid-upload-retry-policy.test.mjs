import test from "node:test";
import assert from "node:assert/strict";
import {
  KID_UPLOAD_RETRY_MAX_ATTEMPTS,
  canRetryKidUpload,
  getKidUploadRetryCooldownMs,
} from "../components/inventory/kid-upload-retry-policy.mjs";

test("getKidUploadRetryCooldownMs uses exponential backoff with cap", () => {
  assert.equal(getKidUploadRetryCooldownMs(0), 0);
  assert.equal(getKidUploadRetryCooldownMs(1), 2000);
  assert.equal(getKidUploadRetryCooldownMs(2), 4000);
  assert.equal(getKidUploadRetryCooldownMs(3), 8000);
  assert.equal(getKidUploadRetryCooldownMs(10), 30000);
});

test("canRetryKidUpload enforces max attempts", () => {
  assert.equal(canRetryKidUpload(0), true);
  assert.equal(canRetryKidUpload(KID_UPLOAD_RETRY_MAX_ATTEMPTS - 1), true);
  assert.equal(canRetryKidUpload(KID_UPLOAD_RETRY_MAX_ATTEMPTS), false);
});
