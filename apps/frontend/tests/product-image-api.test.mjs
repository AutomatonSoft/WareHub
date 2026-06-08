import test from "node:test";
import assert from "node:assert/strict";
import { extractUploadedImageUrls } from "../components/editor/product-image-api.mjs";

test("extractUploadedImageUrls returns normalized urls only", () => {
  const urls = extractUploadedImageUrls({
    uploaded_image_urls: [" https://cdn/a.jpg ", "", null, "https://cdn/b.jpg"]
  });
  assert.deepEqual(urls, ["https://cdn/a.jpg", "https://cdn/b.jpg"]);
});

test("extractUploadedImageUrls returns empty list for invalid payload", () => {
  assert.deepEqual(extractUploadedImageUrls(null), []);
  assert.deepEqual(extractUploadedImageUrls({ uploaded_image_urls: "bad" }), []);
});

