import test from "node:test";
import assert from "node:assert/strict";
import { normalizeJobId, parseJobEventsSummary } from "../app/create-product/job-status-model.mjs";

test("normalizeJobId trims whitespace", () => {
  assert.equal(normalizeJobId("  job-123  "), "job-123");
});

test("parseJobEventsSummary counts total and failed/error events", () => {
  const summary = parseJobEventsSummary(
    JSON.stringify({
      events: [
        { event: "queued" },
        { event: "update_failed" },
        { type: "error" },
        { event: "done" }
      ]
    })
  );

  assert.deepEqual(summary, { totalEvents: 4, failedOrErrorEvents: 2 });
});

test("parseJobEventsSummary returns null for invalid json", () => {
  assert.equal(parseJobEventsSummary("not-json"), null);
});
