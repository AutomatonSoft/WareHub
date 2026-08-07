import test from "node:test";
import assert from "node:assert/strict";
import {
  mapValidationErrorCodeToLabel,
  buildOrchestratorStatusToastMessage
} from "../app/create-product/create-product-controller-model.mjs";

const labels = {
  validationEanExact13Digits: "ean13",
  validationPriceNumeric: "price",
  validationProductNameMin3: "name",
  orchestratorSuccess: "ok",
  channels: "channels",
  orchestratorPartialSuccess: "partial",
  failedChannels: "failed",
  orchestratorAllUpdatesFailed: "all-failed"
};

test("mapValidationErrorCodeToLabel maps known codes", () => {
  assert.equal(mapValidationErrorCodeToLabel("price_numeric", labels), "price");
  assert.equal(mapValidationErrorCodeToLabel("product_name_min_3", labels), "name");
});

test("buildOrchestratorStatusToastMessage builds success message", () => {
  const result = buildOrchestratorStatusToastMessage({
    labels,
    status: "success",
    totalResults: 3,
    failedCount: 0,
    failureSummary: ""
  });
  assert.deepEqual(result, { tone: "success", message: "ok: 3 channels." });
});

test("buildOrchestratorStatusToastMessage builds failed message with summary", () => {
  const result = buildOrchestratorStatusToastMessage({
    labels,
    status: "failed",
    totalResults: 2,
    failedCount: 2,
    failureSummary: "hood: 500/E1"
  });
  assert.deepEqual(result, { tone: "error", message: "all-failed. hood: 500/E1" });
});
