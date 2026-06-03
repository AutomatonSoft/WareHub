import test from "node:test";
import assert from "node:assert/strict";
import { buildUploadFileListPreview } from "../components/inventory/upload-file-list-preview.mjs";

test("buildUploadFileListPreview keeps full list when below limit", () => {
  const result = buildUploadFileListPreview(["a.jpg", "b.jpg"], 5);
  assert.deepEqual(result, { visibleNames: ["a.jpg", "b.jpg"], hiddenCount: 0 });
});

test("buildUploadFileListPreview truncates and returns hidden count", () => {
  const result = buildUploadFileListPreview(["a.jpg", "b.jpg", "c.jpg", "d.jpg"], 2);
  assert.deepEqual(result, { visibleNames: ["a.jpg", "b.jpg"], hiddenCount: 2 });
});
