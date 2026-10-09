import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/api/otto-job-status.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replace(/^import .*;\n/gm, "").replace(/export /g, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const jobId = "c3fbcb90-b794-40a8-ab68-3e57090dcb29";
const load = (context = {}) => runInNewContext(`${compiled}\n({extractOttoJobs, fetchOttoJobStatus})`, { ApiError: Error, ...context });

test("OTTO external jobs use upstream IDs, not internal task IDs, and remain account-specific", () => {
  const { extractOttoJobs } = load();
  const target = controller => ({ marketplace: "otto", data: { profile: controller, upstream_response: { job_id: jobId, task_id: "internal", controller } } });
  const jobs = extractOttoJobs([
    target("jv"), target("xl"), target("jv"),
    { marketplace: "hood", data: target("jv").data },
    { marketplace: "otto", data: { profile: "jv", upstream_response: { task_id: jobId } } },
    { marketplace: "otto", data: { profile: "dep", upstream_response: { job_id: jobId } } },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(jobs)), [{ jobId, controller: "jv" }, { jobId, controller: "xl" }]);
  assert.equal(extractOttoJobs([{ marketplace: "otto", target: "otto,profile=xl", data: { upstream_response: { marketplace_job_id: jobId } } }])[0].controller, "xl");
});

test("click client requests the protected OTTO status endpoint and preserves rejection details", async () => {
  for (const controller of ["jv", "xl"]) {
    const payload = { state: "done", failed: 1, failures: [{ code: "100006", message: "Invalid Grundfarbe" }] };
    let requested;
    const { fetchOttoJobStatus } = load({ apiFetch: async url => { requested = url; return { ok: true, json: async () => payload }; } });
    assert.equal(await fetchOttoJobStatus({ jobId, controller }), payload);
    assert.equal(requested, `/api/v1/services/otto/jobs/${jobId}/?controller=${controller}`);
  }
  const { fetchOttoJobStatus } = load({ apiFetch: async () => ({ ok: false, status: 502, json: async () => ({ detail: "OTTO unavailable" }) }) });
  await assert.rejects(fetchOttoJobStatus({ jobId, controller: "jv" }), /OTTO unavailable/);
});

test("OTTO task identity uses account mapping EAN, not the source EAN or a different SKU", () => {
  const { extractOttoJobs } = load();
  const jobs = extractOttoJobs(["jv", "xl"].map((controller, index) => ({
    marketplace: "otto",
    data: {
      profile: controller, ean: "source-ean",
      upstream_response: { job_id: jobId, controller, skus: [`custom-sku-${controller}`] },
      marketplace_ean_mapping: { status: "confirmed", mapping: { confirmed: true, mapping: {
        kid_number: "568597394", ean: index === 0 ? "4071489360790" : "4071489460902",
      } } },
    },
  })));
  assert.equal(jobs[0].kidNumber, "568597394");
  assert.equal(jobs[0].ean, "4071489360790");
  assert.equal(jobs[1].ean, "4071489460902");
  assert.equal(jobs[0].skus[0], "custom-sku-jv");
  const missing = extractOttoJobs([{ marketplace: "otto", data: { upstream_response: { job_id: jobId, controller: "jv", skus: ["4071489360790"] } } }])[0];
  assert.equal(missing.ean, undefined);
  assert.equal(missing.kidNumber, undefined);
});
