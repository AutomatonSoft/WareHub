import test from "node:test";
import assert from "node:assert/strict";
import { extractFailureReason, buildFailureSummary } from "../app/create-product/orchestrator-result-model.mjs";

test("extractFailureReason returns unknown error fallback", () => {
  const msg = extractFailureReason({ marketplace: "hood", status_code: 500 });
  assert.equal(msg, "hood: unknown error");
});

test("extractFailureReason includes upstream code", () => {
  const msg = extractFailureReason({
    marketplace: "kaufland",
    status_code: 400,
    error: { code: "UPSTREAM", details: { upstream_response: { code: "K-401" } } }
  });
  assert.equal(msg, "kaufland: 400/UPSTREAM, upstream=K-401");
});

test("extractFailureReason falls back to upstream detail when code is missing", () => {
  const msg = extractFailureReason({
    marketplace: "otto",
    status_code: 422,
    error: { code: "UPSTREAM", details: { upstream_response: { detail: "invalid payload" } } }
  });
  assert.equal(msg, "otto: 422/UPSTREAM, upstream=invalid payload");
});

test("buildFailureSummary joins only failed results", () => {
  const summary = buildFailureSummary([
    { marketplace: "hood", status: "success", status_code: 200 },
    { marketplace: "xl", status: "failed", status_code: 500, error: { code: "E1", details: {} } },
    { marketplace: "jv", status: "failed", status_code: 502, error: { code: "E2", details: {} } }
  ]);

  assert.equal(summary, "xl: 500/E1; jv: 502/E2");
});

test("buildFailureSummary returns empty string when there are no failed rows", () => {
  const summary = buildFailureSummary([{ marketplace: "hood", status: "success", status_code: 200 }]);
  assert.equal(summary, "");
});
