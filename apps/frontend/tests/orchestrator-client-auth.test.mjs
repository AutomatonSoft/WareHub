import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function functionSource(path, name) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const node = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, name);
  return node.getText(tree).replace(/^export /, "");
}

const source = [
  functionSource("../app/client-api-shared.ts", "authorizedFetch"),
  functionSource("../lib/api/request-id.ts", "ensureRequestIdHeader"),
  functionSource("../app/create-product/orchestrator-api.ts", "apiFetch"),
].join("\n");
const compiled = ts.transpileModule(`${source}\napiFetch(url, options);`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

for (const token of ["signed-in-token", null]) {
  test(`orchestrator client authenticates submissions ${token ? "with the current token" : "after session bootstrap"} and preserves the request ID`, async () => {
    const requests = [];
    const body = JSON.stringify({ ean: "4071489368819", command: { operation: "publish" } });
    await runInNewContext(compiled, {
      Headers, DEFAULT_API_BASE: "/api/v1", getAccessToken: () => token,
      bootstrapAuthSession: async () => ({ token: "bootstrapped-token" }), createRequestId: () => "generated-id",
      url: "/api/v1/orchestrator/jobs", options: { method: "POST", headers: { "x-request-id": "original-id", "Content-Type": "application/json" }, body },
      fetch: async (url, init) => { requests.push({ url, init }); return { status: 200 }; },
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/v1/orchestrator/jobs");
    assert.equal(requests[0].init.headers.get("authorization"), `Bearer ${token || "bootstrapped-token"}`);
    assert.equal(requests[0].init.headers.get("x-request-id"), "original-id");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.body, body);
  });
}

test("expired authentication refreshes the token without changing submission identity", async () => {
  const requests = [];
  const body = JSON.stringify({ ean: "4071489368819" });
  await runInNewContext(compiled, {
    Headers, DEFAULT_API_BASE: "/api/v1", getAccessToken: () => "expired-token",
    refreshAuthSession: async () => ({ token: "refreshed-token" }),
    createRequestId: () => "generated-id", url: "/api/v1/orchestrator/jobs",
    options: { method: "POST", headers: { "x-request-id": "same-request", "idempotency-key": "same-submission" }, body },
    fetch: async (_url, init) => { requests.push(init); return { status: requests.length === 1 ? 401 : 200 }; },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.get("authorization"), "Bearer expired-token");
  assert.equal(requests[1].headers.get("authorization"), "Bearer refreshed-token");
  for (const request of requests) {
    assert.equal(request.headers.get("x-request-id"), "same-request");
    assert.equal(request.headers.get("idempotency-key"), "same-submission");
    assert.equal(request.body, body);
  }
});
