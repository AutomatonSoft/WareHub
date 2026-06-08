import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_KID_IMAGE_BYTES,
  MAX_KID_UPLOAD_BATCH_FILES,
  dedupeKidUploadFiles,
  validateKidUploadFiles,
} from "../components/inventory/kid-upload-validation.mjs";

test("validateKidUploadFiles rejects non-image file", () => {
  const result = validateKidUploadFiles([{ type: "application/pdf", size: 1024 }]);
  assert.equal(result, "not_image");
});

test("validateKidUploadFiles rejects unsupported image format", () => {
  const result = validateKidUploadFiles([{ type: "image/bmp", size: 1024 }]);
  assert.equal(result, "unsupported_format");
});

test("validateKidUploadFiles rejects empty files", () => {
  const result = validateKidUploadFiles([{ type: "image/png", size: 0 }]);
  assert.equal(result, "empty_file");
});

test("validateKidUploadFiles rejects oversized file", () => {
  const result = validateKidUploadFiles([{ type: "image/png", size: MAX_KID_IMAGE_BYTES + 1 }]);
  assert.equal(result, "too_large");
});

test("validateKidUploadFiles accepts valid files", () => {
  const result = validateKidUploadFiles([
    { type: "image/png", size: 1024 },
    { type: "image/jpeg", size: MAX_KID_IMAGE_BYTES },
  ]);
  assert.equal(result, null);
});

test("validateKidUploadFiles rejects too many files", () => {
  const files = Array.from({ length: MAX_KID_UPLOAD_BATCH_FILES + 1 }, (_, idx) => ({
    name: `file-${idx}.png`,
    type: "image/png",
    size: 1024,
    lastModified: idx,
  }));
  const result = validateKidUploadFiles(files);
  assert.equal(result, "too_many_files");
});

test("dedupeKidUploadFiles removes local duplicates by file signature", () => {
  const files = [
    { name: "a.png", type: "image/png", size: 100, lastModified: 1 },
    { name: "a.png", type: "image/png", size: 100, lastModified: 1 },
    { name: "b.png", type: "image/png", size: 200, lastModified: 2 },
  ];
  const result = dedupeKidUploadFiles(files);
  assert.equal(result.files.length, 2);
  assert.equal(result.skippedCount, 1);
});
