import test from "node:test";
import assert from "node:assert/strict";
import { resolveServicesApiBase } from "../lib/api/services-base.mjs";

test("services base resolves direct services dev host to local proxy namespace", () => {
  assert.equal(resolveServicesApiBase("http://localhost:8934/api/v1"), "/api/v1/services");
});

test("services base resolves backend api-v1 fallback to local services proxy namespace", () => {
  assert.equal(resolveServicesApiBase("http://localhost:8932/api/v1"), "/api/v1/services");
  assert.equal(resolveServicesApiBase("/api/v1"), "/api/v1/services");
});

test("services base resolves frontend api-v1 drift to local services proxy namespace", () => {
  assert.equal(resolveServicesApiBase("http://localhost:8931/api/v1"), "/api/v1/services");
});
