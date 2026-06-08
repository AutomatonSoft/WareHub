import test from "node:test";
import assert from "node:assert/strict";
import {
  getHoodPatchPrecheckError,
  getRequiredEanError
} from "../components/hood/hood-write-precheck-model.mjs";

test("getRequiredEanError returns enterEan label for empty value", () => {
  assert.equal(getRequiredEanError("   ", { enterEan: "Enter EAN." }), "Enter EAN.");
});

test("getRequiredEanError returns null for non-empty value", () => {
  assert.equal(getRequiredEanError("4006381333931", { enterEan: "Enter EAN." }), null);
});

test("getHoodPatchPrecheckError validates upload and payload guards", () => {
  const labels = {
    enterEan: "Enter EAN.",
    selectImageFilesForUpload: "Select image files for upload.",
    fillOneFieldOrSelectImages: "Fill at least one field or select image files."
  };

  assert.equal(
    getHoodPatchPrecheckError({
      ean: "",
      uploadOnly: false,
      hasPatchFiles: false,
      payloadFieldCount: 1,
      labels
    }),
    "Enter EAN."
  );

  assert.equal(
    getHoodPatchPrecheckError({
      ean: "4006381333931",
      uploadOnly: true,
      hasPatchFiles: false,
      payloadFieldCount: 0,
      labels
    }),
    "Select image files for upload."
  );

  assert.equal(
    getHoodPatchPrecheckError({
      ean: "4006381333931",
      uploadOnly: false,
      hasPatchFiles: false,
      payloadFieldCount: 0,
      labels
    }),
    "Fill at least one field or select image files."
  );

  assert.equal(
    getHoodPatchPrecheckError({
      ean: "4006381333931",
      uploadOnly: false,
      hasPatchFiles: true,
      payloadFieldCount: 0,
      labels
    }),
    null
  );
});
