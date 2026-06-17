import test from "node:test";
import assert from "node:assert/strict";

import { buildMergedOpenApiResponse, buildOpenApiProxyFailureResponse } from "../app/api/v1/docs/openapi/openapi-merge.ts";

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
