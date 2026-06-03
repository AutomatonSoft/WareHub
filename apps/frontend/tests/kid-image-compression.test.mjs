import test from "node:test";
import assert from "node:assert/strict";
import { KID_IMAGE_COMPRESSION_THRESHOLD_BYTES, shouldCompressKidImage } from "../components/inventory/kid-image-compression.mjs";

test("shouldCompressKidImage returns true for compressible type above threshold", () => {
  const result = shouldCompressKidImage({
    type: "image/jpeg",
    size: KID_IMAGE_COMPRESSION_THRESHOLD_BYTES + 1,
  });
  assert.equal(result, true);
});

test("shouldCompressKidImage returns false for non-compressible type", () => {
  const result = shouldCompressKidImage({
    type: "image/gif",
    size: KID_IMAGE_COMPRESSION_THRESHOLD_BYTES + 1,
  });
  assert.equal(result, false);
});

test("shouldCompressKidImage returns false below threshold", () => {
  const result = shouldCompressKidImage({
    type: "image/png",
    size: KID_IMAGE_COMPRESSION_THRESHOLD_BYTES - 1,
  });
  assert.equal(result, false);
});
