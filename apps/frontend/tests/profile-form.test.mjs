import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AVATAR_BYTES,
  normalizeEmail,
  validateAvatarFile,
  validateNewPassword
} from "../app/profile/profile-form-logic.mjs";

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  USER@Example.COM "), "user@example.com");
});

test("validateAvatarFile rejects non-image file", () => {
  const result = validateAvatarFile({ type: "application/pdf", size: 1024 });
  assert.equal(result, "Avatar must be an image file.");
});

test("validateAvatarFile rejects oversized file", () => {
  const result = validateAvatarFile({ type: "image/png", size: MAX_AVATAR_BYTES + 1 });
  assert.equal(result, "Avatar file must be up to 5 MB.");
});

test("validateAvatarFile rejects unsupported image format", () => {
  const result = validateAvatarFile({ type: "image/bmp", size: 1024 });
  assert.equal(result, "Avatar format must be JPG, PNG, WEBP, or GIF.");
});

test("validateNewPassword validates confirm", () => {
  assert.equal(validateNewPassword("abcdefgh", "abcxxxxx"), "New passwords do not match.");
  assert.equal(validateNewPassword("abcdefgh", "abcdefgh"), null);
});
