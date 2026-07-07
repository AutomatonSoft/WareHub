import test from "node:test";
import assert from "node:assert/strict";

import { buildMergedOpenApiResponse, buildOpenApiProxyFailureResponse } from "../app/api/v1/docs/openapi/openapi-merge.ts";
import { resolveDocsOrigin } from "../app/api/v1/docs/openapi/route.ts";

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
