import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const proxySource = readFileSync(new URL("../app/api/v1/orchestrator/[...path]/route.ts", import.meta.url), "utf8");
const proxyCode = ts.transpileModule(proxySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function loadProxy(fetch) {
  class NextResponse extends Response {
    static json(body, init) { return new NextResponse(JSON.stringify(body), init); }
  }
  const exports = {};
  runInNewContext(proxyCode, { exports, fetch, Buffer, Response, require: (name) => {
    if (name === "next/server") return { NextResponse };
    if (name.endsWith("/request-id")) return { createRequestId: () => "test-request" };
    if (name.endsWith("/upstream-base")) return {
      resolveBackendApiBaseCandidates: () => ["http://backend/api/v1"],
      resolveOrchestratorApiBaseCandidates: () => ["http://orchestrator/api/v1"],
    };
    throw new Error(name);
  } });
  return exports;
}

for (const path of [["jobs"], ["jobs", ""], ["jobs", "batch"], ["jobs", "batch", ""], ["products", "4071489368567", "update"], ["products", "4071489368567", "update", ""]]) {
  test(`publication proxy verifies actor for ${path.join("/")} and ignores forged headers`, async () => {
    const calls = [];
    const proxy = loadProxy(async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(url.endsWith("/auth/me") ? { login: "eugen", first_name: "Eugen", last_name: "Tryrshkin" } : { job_id: "job-1" }));
    });
    const response = await proxy.POST({ method: "POST", nextUrl: { search: "" }, headers: new Headers({ authorization: "Bearer verified", "x-warehub-actor-login": "forged", "idempotency-key": "retry-safe-create" }), arrayBuffer: async () => new ArrayBuffer(0) }, { params: Promise.resolve({ path }) });
    assert.equal(response.status, 200);
    assert.equal(calls[0].init.headers.Authorization, "Bearer verified");
    assert.equal(calls[1].init.headers["x-warehub-actor-login"], "eugen");
    assert.equal(calls[1].init.headers["x-warehub-actor-name"], "Eugen Tryrshkin");
    assert.equal(calls[1].init.headers["idempotency-key"], "retry-safe-create");
  });
}

test("publication without a verified actor is not queued anonymously", async () => {
  let calls = 0;
  const proxy = loadProxy(async () => { calls += 1; return new Response("{}", { status: 401 }); });
  const response = await proxy.POST({ method: "POST", nextUrl: { search: "" }, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) }, { params: Promise.resolve({ path: ["jobs"] }) });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("history labels a submission without claiming the listing is live and displays its EAN", () => {
  const source = readFileSync(new URL("../components/dashboard/inventory-change-history.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("history.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let actionLabel;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "actionLabel") actionLabel = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(actionLabel);
  const code = ts.transpileModule(`const label = ${actionLabel.getText(tree)}; label(entry);`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const label = runInNewContext(code, { lang: "ru", entry: { action: "marketplace_product_submitted", metadata: { channel: "OTTO XL" } } });
  assert.equal(label, "отправил товар в OTTO XL через Create Product");
  assert.match(source, /EAN: \{String\(entry\.metadata\.ean/);
});
