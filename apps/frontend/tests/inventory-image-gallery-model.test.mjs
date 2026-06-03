import test from "node:test";
import assert from "node:assert/strict";
import { buildKidImageGalleryModel, mergeUniqueImageUrls } from "../components/inventory/image-gallery-model.mjs";

test("gallery model: builds ordered items and marks main image", () => {
  const model = buildKidImageGalleryModel([
    "https://cdn.example.com/a.jpg",
    "/media/b.jpg"
  ]);

  assert.equal(model.mainImageUrl, "https://cdn.example.com/a.jpg");
  assert.equal(model.items.length, 2);
  assert.equal(model.items[0].isMain, true);
  assert.equal(model.items[1].order, 1);
  assert.equal(model.items[1].source, "ftp");
});

test("gallery model: marks invalid URLs for retry", () => {
  const model = buildKidImageGalleryModel(["not-a-url"]);
  assert.equal(model.items[0].status, "invalid");
  assert.equal(model.items[0].retryState, "required");
});

test("gallery model: merges urls without duplicates and preserves order", () => {
  const merged = mergeUniqueImageUrls(
    ["https://a.example/1.jpg", "https://a.example/2.jpg"],
    ["https://a.example/2.jpg", "https://a.example/3.jpg"]
  );
  assert.deepEqual(merged, [
    "https://a.example/1.jpg",
    "https://a.example/2.jpg",
    "https://a.example/3.jpg"
  ]);
});
