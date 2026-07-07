import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveBackendApiBaseCandidates,
  resolveOrchestratorApiBaseCandidates,
  resolveServicesApiBaseCandidates
} from "../lib/api/upstream-base.ts";

test("services upstream candidates prefer explicit internal Docker base before local fallbacks", () => {
  const candidates = resolveServicesApiBaseCandidates({
    SERVICES_INTERNAL_API_BASE_URL: "http://services:8000/api/v1",
    SERVICES_ORIGIN: "http://services:8000",
    SERVICES_API_BASE_URL: "http://localhost:8934/api/v1"
  });

  assert.deepEqual(candidates.slice(0, 2), [
    "http://services:8000/api/v1",
    "http://localhost:8934/api/v1"
  ]);
});

test("backend upstream candidates normalize api-v1 and keep Docker backend first when configured", () => {
  const candidates = resolveBackendApiBaseCandidates({
    BACKEND_INTERNAL_API_BASE_URL: "http://backend:8932/api/v1",
    BACKEND_ORIGIN: "http://backend:8932",
    BACKEND_API_BASE_URL: "http://localhost:8932/api/v1"
  });

  assert.equal(candidates[0], "http://backend:8932");
  assert.ok(candidates.includes("http://localhost:8932"));
});

test("orchestrator upstream candidates support origin-style envs and Docker fallback", () => {
  const candidates = resolveOrchestratorApiBaseCandidates({
    ORCHESTRATOR_ORIGIN: "http://orchestrator:8011",
    ORCHESTRATOR_API_BASE_URL: "http://localhost:8935/api/v1"
  });

  assert.equal(candidates[0], "http://orchestrator:8011/api/v1");
  assert.ok(candidates.includes("http://localhost:8935/api/v1"));
});
