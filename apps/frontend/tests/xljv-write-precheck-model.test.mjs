import test from "node:test";
import assert from "node:assert/strict";
import {
  getRequiredEanError,
  getSendToSelectedSitesPrecheckError
} from "../components/xljv/xljv-write-precheck-model.mjs";

test("getRequiredEanError returns enterEan label for empty value", () => {
  const result = getRequiredEanError("   ", { enterEan: "Enter EAN" });
  assert.equal(result, "Enter EAN");
});

test("getRequiredEanError returns null for valid ean", () => {
  const result = getRequiredEanError("4006381333931", { enterEan: "Enter EAN" });
  assert.equal(result, null);
});

test("getSendToSelectedSitesPrecheckError validates in strict order", () => {
  const labels = {
    enterEan: "Enter EAN",
    createOrderDraftFirst: "Create draft first",
    chooseOneTargetSite: "Choose target site",
    chooseTemplateSite: "Choose template site"
  };

  assert.equal(
    getSendToSelectedSitesPrecheckError({
      ean: "",
      hasOrderDraft: false,
      selectedSiteKeys: [],
      templateSiteKey: "",
      labels
    }),
    "Enter EAN"
  );

  assert.equal(
    getSendToSelectedSitesPrecheckError({
      ean: "4006381333931",
      hasOrderDraft: false,
      selectedSiteKeys: [],
      templateSiteKey: "",
      labels
    }),
    "Create draft first"
  );

  assert.equal(
    getSendToSelectedSitesPrecheckError({
      ean: "4006381333931",
      hasOrderDraft: true,
      selectedSiteKeys: [],
      templateSiteKey: "",
      labels
    }),
    "Choose target site"
  );

  assert.equal(
    getSendToSelectedSitesPrecheckError({
      ean: "4006381333931",
      hasOrderDraft: true,
      selectedSiteKeys: ["XL_AU"],
      templateSiteKey: "",
      labels
    }),
    "Choose template site"
  );

  assert.equal(
    getSendToSelectedSitesPrecheckError({
      ean: "4006381333931",
      hasOrderDraft: true,
      selectedSiteKeys: ["XL_AU"],
      templateSiteKey: "XL_AU",
      labels
    }),
    null
  );
});
