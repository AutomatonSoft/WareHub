import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(path, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, URLSearchParams, Headers, Buffer, ...globals, require: name => dependencies[name] ?? require(name) });
  return exports;
}

function client(reply) {
  const requests = [];
  const api = compile("../components/reviews/product-review-api.ts", {
    "../../app/client-api-shared": { authorizedFetch: async (url, init) => { requests.push({ url, init }); return reply; } },
    "../../lib/api/request-id": { ensureRequestIdHeader: input => { const headers = new Headers(input); headers.set("x-request-id", "review-request"); return headers; } },
  });
  return { api, requests };
}

test("review client sends the exact edited snapshot with the original identity and retry key", async () => {
  const { api, requests } = client({ ok: true, json: async () => ({ job_id: "retry-job" }) });
  const draft = { item: { job_id: "original", target: "otto,profile=jv", ean: "4071489368673" }, payload: { sku: "4071489368673", ean: "4071489368673", productReference: "stable", productDescription: { description: "Corrected" } } };
  await api.retryReview(draft, "same-key");
  await api.retryReview(draft, "same-key");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "/api/v1/orchestrator/jobs");
  assert.equal(requests[0].init.headers.get("idempotency-key"), "same-key");
  assert.equal(requests[0].init.headers.get("x-request-id"), "review-request");
  const body = JSON.parse(requests[0].init.body);
  assert.deepEqual(body.review.payload, draft.payload);
  assert.equal(body.review.source_job_id, "original");
  assert.equal(body.review.target, "otto,profile=jv");
  assert.equal(body.command.channels.length, 0);
  assert.equal(requests[0].init.body, requests[1].init.body);
});

test("review reads preserve cancellation and encode the selected target", async () => {
  const { api, requests } = client({ ok: true, json: async () => ({ items: [] }) });
  const signal = new AbortController().signal;
  await api.fetchReviews(50, "KID 123", signal);
  await api.fetchReviewDraft({ job_id: "id/1", target: "hood,account=xl" }, signal);
  assert.equal(requests[0].init.signal, signal);
  assert.match(requests[0].url, /offset=50&limit=50&q=KID\+123/);
  assert.match(requests[1].url, /reviews\/id%2F1\?target=hood%2Caccount%3Dxl/);
});

test("a rejected retry surfaces the error and is never automatically repeated", async () => {
  const { api, requests } = client({ ok: false, status: 409, json: async () => ({ message: "Newer submission exists" }) });
  await assert.rejects(api.retryReview({ item: { ean: "123", job_id: "old", target: "otto,profile=jv" }, payload: {} }, "key"), /Newer submission exists/);
  assert.equal(requests.length, 1);
});

test("review snapshot reads require a verified session at the proxy", async () => {
  const requests = [];
  const route = compile("../app/api/v1/orchestrator/[...path]/route.ts", {
    "next/server": { NextResponse: Response },
    "../../../../../lib/api/request-id": { createRequestId: () => "request-id" },
    "../../../../../lib/api/upstream-base": { resolveBackendApiBaseCandidates: () => ["http://backend/api/v1"], resolveOrchestratorApiBaseCandidates: () => ["http://orchestrator/api/v1"] },
  }, { fetch: async (url, init) => { requests.push({ url, init }); return Response.json(url.endsWith("/auth/me") ? { login: "verified", first_name: "Test" } : { items: [] }); } });
  const params = { params: Promise.resolve({ path: ["reviews"] }) };
  const unauthenticated = await route.GET({ method: "GET", headers: new Headers(), nextUrl: { search: "" } }, params);
  assert.equal(unauthenticated.status, 401);
  assert.equal(requests.length, 0);
  const authenticated = await route.GET({ method: "GET", headers: new Headers({ authorization: "Bearer test-token", "x-warehub-actor-login": "forged" }), nextUrl: { search: "?offset=0" } }, params);
  assert.equal(authenticated.status, 200);
  assert.equal(requests[1].url, "http://orchestrator/api/v1/orchestrator/reviews?offset=0");
  assert.equal(requests[1].init.headers["x-warehub-actor-login"], "verified");
  const gateway = readFileSync(new URL("../../../infra/gateway/conf.d/default.conf.template", import.meta.url), "utf8");
  assert.match(gateway, /location ~ \^\/api\/v1\/orchestrator\/reviews\(\?:\/\|\$\)\s*\{\s*proxy_pass http:\/\/frontend_upstream;/);
});

test("review editor renders immutable identifiers and structured attributes without flattening values", () => {
  const labels = compile("../components/reviews/product-review-labels.ts").reviewLabels.en;
  const primitive = tag => function Primitive(props) { return React.createElement(tag, props); };
  const { ProductReviewPayloadEditor } = compile("../components/reviews/product-review-payload-editor.tsx", {
    "../../app/create-product/otto-create-product-panel": { AttributeInput: primitive("input") },
    "../../app/create-product/otto-categories-api": { fetchOttoCategories: async () => [], fetchOttoCategoryAttributes: async () => [] },
    "../../app/create-product/otto-create-product-model.mjs": { normalizeOttoAttributeValues: value => value },
    "../product-editor/product-editor-content-sections": { ProductEditorDescriptionEditor: ({ value }) => React.createElement("textarea", { defaultValue: value }) },
    "../ui/button": { Button: primitive("button") }, "../ui/checkbox": { Checkbox: primitive("input") },
    "../ui/input": { Input: primitive("input") }, "../ui/textarea": { Textarea: primitive("textarea") },
  });
  const draft = { item: { marketplace: "hood", account: "jv" }, locked_fields: ["itemNumber"], payload: { itemNumber: "4071489368673", quantity: 1, description: "<p>Corrected</p>", productProperties: [{ name: "Farbe", value: "beige" }] } };
  const html = renderToStaticMarkup(React.createElement(ProductReviewPayloadEditor, { draft, labels, onChange: () => {} }));
  assert.match(html, /readOnly="" aria-readonly="true" value="4071489368673"/i);
  assert.match(html, /type="number"/);
  assert.match(html, /value="Farbe"/);
  assert.match(html, /value="beige"/);
  assert.match(html, /&lt;p&gt;Corrected&lt;\/p&gt;/);
});
