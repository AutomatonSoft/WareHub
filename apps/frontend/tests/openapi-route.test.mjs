import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import { buildMergedOpenApiResponse, buildOpenApiProxyFailureResponse } from "../app/api/v1/docs/openapi/openapi-merge.ts";
import { resolveDocsOrigin } from "../app/api/v1/docs/openapi/docs-origin.ts";

test("OpenAPI route exports only its HTTP handler and supported runtime config; cache still expires", async () => {
  const source = readFileSync(new URL("../app/api/v1/docs/openapi/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  let now = 0;
  let fetchCount = 0;
  class Clock extends Date { static now() { return now; } }
  runInNewContext(compiled, {
    exports, Response, AbortController, setTimeout, clearTimeout, Date: Clock, process: { env: {} },
    fetch: async () => { fetchCount += 1; return Response.json({ paths: {} }); },
    require: name => {
      if (name === "./docs-origin") return { resolveDocsOrigin };
      assert.equal(name, "./openapi-merge");
      return {
        buildOpenApiSourceSpecs: () => [{ source: "backend", candidates: ["http://backend/api/v1"], timeoutMs: 100 }],
        buildMergedOpenApiResponse: (_docs, origin) => Response.json({ paths: {}, servers: [{ url: origin }] }),
        buildOpenApiProxyFailureResponse: () => Response.json({}, { status: 502 }),
      };
    },
  });
  assert.deepEqual(Object.keys(exports).sort(), ["GET", "runtime"]);
  const first = await exports.GET(new Request("https://first.example/api/v1/docs/openapi"));
  assert.equal(first.status, 200);
  const cached = await exports.GET(new Request("https://second.example/api/v1/docs/openapi"));
  assert.equal(fetchCount, 1);
  assert.equal((await cached.json()).servers[0].url, "https://second.example");
  now = 30_001;
  await exports.GET(new Request("https://first.example/api/v1/docs/openapi"));
  assert.equal(fetchCount, 2);
});

test("openapi route helper: merge error returns HTTP 502 JSON without leaking env values", async () => {
  const response = buildMergedOpenApiResponse(
    [
      {
        source: "backend",
        doc: {
          paths: {
            "/api/v1/auth/me": {
              get: {
                responses: {
                  "200": {
                    content: {
                      "application/json": {
                        schema: { $ref: "#/components/schemas/MissingUser/properties/id" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ],
    "https://docs.example.com"
  );
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.detail, "OpenAPI schema merge failed");
  assert.equal(body.code, "unresolved_local_ref");
  assert.equal(JSON.stringify(body).includes("user:pass"), false);
  assert.equal(JSON.stringify(body).includes("backend.internal"), false);
});

test("openapi route helper: upstream fetch failure response does not expose candidate URLs", async () => {
  const response = buildOpenApiProxyFailureResponse([
    { source: "backend" },
    { source: "services" },
    { source: "orchestrator" }
  ]);
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.deepEqual(body.sources, ["backend", "services", "orchestrator"]);
  assert.equal(JSON.stringify(body).includes("secret-backend.internal"), false);
});

test("openapi route helper: successful document uses request origin as servers[0].url", async () => {
  const response = buildMergedOpenApiResponse(
    [
      {
        source: "backend",
        doc: {
          paths: {
            "/api/v1/auth/login": {
              post: {
                responses: {
                  "200": {
                    description: "ok"
                  }
                }
              }
            }
          }
        }
      }
    ],
    "https://docs.warehub.example"
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.servers[0].url, "https://docs.warehub.example");
});

test("openapi docs origin: prefers forwarded public host and proto over internal bind url", () => {
  const request = new Request("http://0.0.0.0:8931/api/v1/docs/openapi", {
    headers: {
      "x-forwarded-host": "warehub.automatonsoft.de",
      "x-forwarded-proto": "https",
      "x-forwarded-port": "443"
    }
  });

  assert.equal(resolveDocsOrigin(request), "https://warehub.automatonsoft.de");
});

test("openapi docs origin: normalizes local localhost origin to 127.0.0.1", () => {
  const request = new Request("http://localhost:8931/api/v1/docs/openapi");
  assert.equal(resolveDocsOrigin(request), "http://127.0.0.1:8931");
});

test("openapi route helper: unresolved security scheme returns HTTP 502 JSON", async () => {
  const response = buildMergedOpenApiResponse(
    [
      {
        source: "backend",
        doc: {
          paths: {
            "/api/v1/auth/me": {
              get: {
                security: [{ MissingAuth: [] }],
                responses: {
                  "200": {
                    description: "ok"
                  }
                }
              }
            }
          }
        }
      }
    ],
    "https://docs.example.com"
  );
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.code, "unresolved_security_scheme");
  assert.equal(body.scheme, "MissingAuth");
  assert.equal(body.location, "/api/v1/backend/auth/me");
  assert.equal(body.method, "GET");
});
