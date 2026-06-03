import test from "node:test";
import assert from "node:assert/strict";
import { buildJobStatusDetails } from "../app/create-product/job-status-details-model.mjs";

test("buildJobStatusDetails returns null when all payloads are empty", () => {
  assert.equal(
    buildJobStatusDetails({ latestJobId: "", jobStatusJson: "", jobAttemptsJson: "", jobEventsJson: "" }),
    null
  );
});

test("buildJobStatusDetails maps status and counters", () => {
  const details = buildJobStatusDetails({
    latestJobId: "job-1",
    jobStatusJson: JSON.stringify({ job_id: "job-1", request_id: "req-1", status: "queued" }),
    jobAttemptsJson: JSON.stringify({ items: [{}, {}] }),
    jobEventsJson: JSON.stringify({ events: [{}, {}, {}] })
  });

  assert.deepEqual(details, {
    jobId: "job-1",
    requestId: "req-1",
    status: "queued",
    attemptsCount: 2,
    eventsCount: 3
  });
});

test("buildJobStatusDetails supports fallback fields id/state and attempts array", () => {
  const details = buildJobStatusDetails({
    latestJobId: "job-fallback",
    jobStatusJson: JSON.stringify({ id: "job-2", requestId: "req-2", state: "running" }),
    jobAttemptsJson: JSON.stringify({ attempts: [{}, {}, {}] }),
    jobEventsJson: JSON.stringify({})
  });

  assert.deepEqual(details, {
    jobId: "job-2",
    requestId: "req-2",
    status: "running",
    attemptsCount: 3,
    eventsCount: 0
  });
});
