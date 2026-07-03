import test from "node:test";
import assert from "node:assert/strict";

import {
  OpenApiMergeError,
  mergeSchemas,
  remapPathForFrontendProxy,
  resolveBackendBaseCandidates,
  resolveOrchestratorBaseCandidates,
  resolveServicesBaseCandidates,
  validateOperationIds
} from "../app/api/v1/docs/openapi/openapi-merge.ts";

function buildSchemaDoc(source, schemaKeys = [], pathRef = "#/components/schemas/User", extra = {}) {
  return {
    source,
    doc: {
      paths: {
        "/api/v1/auth/me": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: pathRef }
                  }
                }
              }
            }
          }
        }
      },
      components: {
        schemas: Object.fromEntries(
          schemaKeys.map((key) => [
            key,
            {
              type: "object",
              properties: {
                id: { type: "string" }
              }
            }
          ])
        )
      },
      ...extra
    }
  };
}

function buildSectionCollisionDocs(sectionName) {
  return [
    {
      source: "backend",
      doc: {
        paths: {
          "/api/v1/auth/login": {
            post: {
              responses:
                sectionName === "responses"
                  ? { default: { $ref: "#/components/responses/Shared" } }
                  : { "200": { description: "ok" } },
              parameters: sectionName === "parameters" ? [{ $ref: "#/components/parameters/Shared" }] : undefined,
              requestBody: sectionName === "requestBodies" ? { $ref: "#/components/requestBodies/Shared" } : undefined,
              callbacks: sectionName === "callbacks" ? { lifecycle: { $ref: "#/components/callbacks/Shared" } } : undefined
            }
          }
        },
        components: {
          [sectionName]: {
            Shared:
              sectionName === "headers"
                ? { description: "header" }
                : sectionName === "securitySchemes"
                  ? { type: "http", scheme: "bearer" }
                  : sectionName === "examples"
                    ? { value: { ok: true } }
                    : sectionName === "links"
                      ? { operationId: "test" }
                      : sectionName === "callbacks"
                        ? {
                            "{$request.body#/callbackUrl}": {
                              post: {
                                responses: {
                                  "200": {
                                    description: "ok"
                                  }
                                }
                              }
                            }
                          }
                        : sectionName === "pathItems"
                          ? {
                              get: {
                                responses: {
                                  "200": {
                                    description: "ok"
                                  }
                                }
                              }
                            }
                          : { description: "shared" }
          }
        }
      }
    },
    {
      source: "services",
      doc: {
        paths: {
          "/api/v1/orders/": {
            get: {
              responses:
                sectionName === "responses"
                  ? { default: { $ref: "#/components/responses/Shared" } }
                  : { "200": { description: "ok" } },
              parameters: sectionName === "parameters" ? [{ $ref: "#/components/parameters/Shared" }] : undefined,
              requestBody: sectionName === "requestBodies" ? { $ref: "#/components/requestBodies/Shared" } : undefined,
              callbacks: sectionName === "callbacks" ? { lifecycle: { $ref: "#/components/callbacks/Shared" } } : undefined
            }
          }
        },
        components: {
          [sectionName]: {
            Shared:
              sectionName === "headers"
                ? { description: "header" }
                : sectionName === "securitySchemes"
                  ? { type: "http", scheme: "basic" }
                  : sectionName === "examples"
                    ? { value: { ok: false } }
                    : sectionName === "links"
                      ? { operationId: "other" }
                      : sectionName === "callbacks"
                        ? {
                            "{$request.body#/callbackUrl}": {
                              post: {
                                responses: {
                                  "200": {
                                    description: "ok"
                                  }
                                }
                              }
                            }
                          }
                        : sectionName === "pathItems"
                          ? {
                              post: {
                                responses: {
                                  "202": {
                                    description: "accepted"
                                  }
                                }
                              }
                            }
                          : { description: "shared" }
          }
        }
      }
    }
  ];
}

function buildSecurityDoc(source, schemeKeys = ["BearerAuth"], extra = {}) {
  return {
    source,
    doc: {
      paths: {
        "/api/v1/auth/me": {
          get: {
            security: [
              {
                BearerAuth: []
              }
            ],
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      },
      components: {
        securitySchemes: Object.fromEntries(
          schemeKeys.map((key) => [
            key,
            {
              type: "http",
              scheme: "bearer"
            }
          ])
        )
      },
      ...extra
    }
  };
}

function buildComponentCallbackSecurityDoc(source, extra = {}) {
  return {
    source,
    doc: {
      security: [{ BearerAuth: [] }],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer"
          }
        },
        callbacks: {
          SharedCallback: {
            "{$request.body#/callbackUrl}": {
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
      },
      paths: {
        "/api/v1/auth/me": {
          get: {
            callbacks: {
              shared: {
                $ref: "#/components/callbacks/SharedCallback"
              }
            },
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      },
      ...extra
    }
  };
}

test("openapi remap: backend canonicalization stays idempotent", () => {
  assert.equal(remapPathForFrontendProxy("backend", "/api/v1/healthz"), "/api/v1/backend/healthz");
  assert.equal(remapPathForFrontendProxy("backend", "/api/v1/auth/login"), "/api/v1/backend/auth/login");
  assert.equal(remapPathForFrontendProxy("backend", "/api/v1/backend/auth/login"), "/api/v1/backend/auth/login");
});

test("openapi remap: services canonicalization covers legacy and generic routes", () => {
  assert.equal(remapPathForFrontendProxy("services", "/api/v1/inventory/rows/"), "/api/v1/services/inventory/rows/");
  assert.equal(remapPathForFrontendProxy("services", "/api/v1/jv/sites/"), "/api/v1/services/jv/sites/");
  assert.equal(remapPathForFrontendProxy("services", "/api/v1/xl/items/by-ean/123/"), "/api/v1/services/xl/items/by-ean/123/");
  assert.equal(remapPathForFrontendProxy("services", "/api/v1/hood/items/by-ean/123/"), "/api/v1/services/hood/items/by-ean/123/");
  assert.equal(remapPathForFrontendProxy("services", "/api/v1/telegram/webhook/"), "/api/v1/services/telegram/webhook/");
  assert.equal(remapPathForFrontendProxy("services", "/api/v1/uploads/images/"), "/api/v1/services/uploads/images/");
  assert.equal(remapPathForFrontendProxy("services", "/api/v1/services/orders/"), "/api/v1/services/orders/");
  assert.equal(remapPathForFrontendProxy("services", "api/v1/orders/"), "/api/v1/services/orders/");
});

test("openapi remap: orchestrator canonicalization covers system, jobs and product editor routes", () => {
  assert.equal(remapPathForFrontendProxy("orchestrator", "/api/v1/healthz"), "/api/v1/orchestrator/healthz");
  assert.equal(remapPathForFrontendProxy("orchestrator", "/api/v1/readyz"), "/api/v1/orchestrator/readyz");
  assert.equal(remapPathForFrontendProxy("orchestrator", "/api/v1/metrics"), "/api/v1/orchestrator/metrics");
  assert.equal(remapPathForFrontendProxy("orchestrator", "/api/v1/orchestrator/jobs"), "/api/v1/orchestrator/jobs");
  assert.equal(
    remapPathForFrontendProxy("orchestrator", "/api/v1/orchestrator/product-editor/load/"),
    "/api/v1/orchestrator/product-editor/load/"
  );
});

test("openapi env resolution: server-side candidates use only internal and legacy server envs", () => {
  assert.deepEqual(
    resolveServicesBaseCandidates({
      SERVICES_INTERNAL_API_BASE_URL: "http://services:8000/api/v1",
      SERVICES_API_BASE_URL: "http://localhost:8934/api/v1",
      NEXT_PUBLIC_SERVICES_API_BASE_URL: "https://public-services.example.com/api/v1",
      NEXT_PUBLIC_API_BASE_URL: "https://public-backend.example.com/api/v1"
    }).slice(0, 2),
    ["http://services:8000/api/v1", "http://localhost:8934/api/v1"]
  );

  assert.deepEqual(
    resolveBackendBaseCandidates({
      BACKEND_INTERNAL_API_BASE_URL: "http://backend:8932/api/v1",
      BACKEND_API_BASE_URL: "http://localhost:8932/api/v1",
      NEXT_PUBLIC_API_BASE_URL: "https://public.example.com/api/v1"
    }).slice(0, 2),
    ["http://backend:8932", "http://localhost:8932"]
  );

  assert.deepEqual(
    resolveOrchestratorBaseCandidates({
      ORCHESTRATOR_INTERNAL_API_BASE_URL: "http://orchestrator:8011/api/v1",
      ORCHESTRATOR_API_BASE_URL: "http://localhost:8935/api/v1",
      NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL: "https://public-orchestrator.example.com/api/v1"
    }).slice(0, 2),
    ["http://orchestrator:8011", "http://localhost:8935"]
  );
});

test("openapi merge: generated names remain unique when original generated-looking keys already exist", () => {
  const merged = mergeSchemas([
    buildSchemaDoc("backend", ["User", "backend_User", "backend_User_2"]),
    buildSchemaDoc("services", ["User"]),
    buildSchemaDoc("orchestrator", ["User"])
  ]);

  assert.ok(merged.components.schemas.backend_User_3);
  assert.ok(merged.components.schemas.services_User);
  assert.ok(merged.components.schemas.orchestrator_User);
  assert.equal(
    merged.paths["/api/v1/backend/auth/me"].get.responses["200"].content["application/json"].schema.$ref,
    "#/components/schemas/backend_User_3"
  );
});

test("openapi merge: generated names are deterministic regardless of input order", () => {
  const docs = [
    buildSchemaDoc("backend", ["User", "backend_User"]),
    buildSchemaDoc("services", ["User"]),
    buildSchemaDoc("orchestrator", ["User"])
  ];

  const forward = mergeSchemas(docs);
  const reversed = mergeSchemas([...docs].reverse());

  assert.deepEqual(forward.components.schemas, reversed.components.schemas);
  assert.deepEqual(forward.paths, reversed.paths);
});

test("openapi merge: source ids with spaces, slash and colon are normalized safely", () => {
  const merged = mergeSchemas([
    buildSchemaDoc("backend", ["User"]),
    buildSchemaDoc("services/eu west:1", ["User"])
  ]);

  assert.ok(merged.components.schemas.services_eu_west_1_User);
});

test("openapi merge: duplicate source ids fail with controlled error", () => {
  assert.throws(
    () => mergeSchemas([buildSchemaDoc("backend", ["User"]), buildSchemaDoc("backend", ["Order"])]),
    (error) => {
      assert.ok(error instanceof OpenApiMergeError);
      assert.equal(error.code, "duplicate_source_id");
      return true;
    }
  );
});

test("openapi merge: source ids with the same normalized prefix fail with controlled error", () => {
  assert.throws(
    () => mergeSchemas([buildSchemaDoc("services/eu", ["User"]), buildSchemaDoc("services eu", ["User"])]),
    (error) => {
      assert.ok(error instanceof OpenApiMergeError);
      assert.equal(error.code, "source_prefix_collision");
      assert.deepEqual(error.details.sources, ["services eu", "services/eu"]);
      return true;
    }
  );
});

test("openapi merge: conflicting security schemes rewrite per-source operation security requirements", () => {
  const merged = mergeSchemas([buildSecurityDoc("backend"), buildSecurityDoc("services")]);

  assert.deepEqual(merged.paths["/api/v1/backend/auth/me"].get.security, [{ backend_BearerAuth: [] }]);
  assert.deepEqual(merged.paths["/api/v1/services/auth/me"].get.security, [{ services_BearerAuth: [] }]);
});

test("openapi merge: three sources with the same security scheme get unique names", () => {
  const merged = mergeSchemas([buildSecurityDoc("backend"), buildSecurityDoc("services"), buildSecurityDoc("orchestrator")]);

  assert.ok(merged.components.securitySchemes.backend_BearerAuth);
  assert.ok(merged.components.securitySchemes.services_BearerAuth);
  assert.ok(merged.components.securitySchemes.orchestrator_BearerAuth);
});

test("openapi merge: generated security scheme names stay unique when generated-looking key already exists", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth", "backend_BearerAuth"]),
    buildSecurityDoc("services")
  ]);

  assert.ok(merged.components.securitySchemes.backend_BearerAuth_2);
  assert.deepEqual(merged.paths["/api/v1/backend/auth/me"].get.security, [{ backend_BearerAuth_2: [] }]);
});

test("openapi merge: non-conflicting security scheme stays unchanged", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth"]),
    buildSecurityDoc("services", ["ApiKeyAuth"], {
      paths: {
        "/api/v1/orders/": {
          get: {
            security: [
              {
                ApiKeyAuth: []
              }
            ],
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      }
    })
  ]);

  assert.deepEqual(merged.paths["/api/v1/services/orders/"].get.security, [{ ApiKeyAuth: [] }]);
});

test("openapi merge: multiple schemes in one security requirement object are rewritten", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth", "ApiKeyAuth"], {
      paths: {
        "/api/v1/auth/me": {
          get: {
            security: [
              {
                BearerAuth: [],
                ApiKeyAuth: ["read"]
              }
            ],
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      }
    }),
    buildSecurityDoc("services", ["BearerAuth", "ApiKeyAuth"])
  ]);

  assert.deepEqual(merged.paths["/api/v1/backend/auth/me"].get.security, [
    {
      backend_BearerAuth: [],
      backend_ApiKeyAuth: ["read"]
    }
  ]);
});

test("openapi merge: multiple alternative security requirement objects are rewritten", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth", "ApiKeyAuth"], {
      paths: {
        "/api/v1/auth/me": {
          get: {
            security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      }
    }),
    buildSecurityDoc("services", ["BearerAuth", "ApiKeyAuth"])
  ]);

  assert.deepEqual(merged.paths["/api/v1/backend/auth/me"].get.security, [{ backend_BearerAuth: [] }, { backend_ApiKeyAuth: [] }]);
});

test("openapi merge: security empty array stays public", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth"], {
      security: [{ BearerAuth: [] }],
      paths: {
        "/api/v1/auth/me": {
          get: {
            security: [],
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      }
    })
  ]);

  assert.deepEqual(merged.paths["/api/v1/backend/auth/me"].get.security, []);
});

test("openapi merge: empty security requirement object stays valid", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth"], {
      paths: {
        "/api/v1/auth/me": {
          get: {
            security: [{}],
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      }
    })
  ]);

  assert.deepEqual(merged.paths["/api/v1/backend/auth/me"].get.security, [{}]);
});

test("openapi merge: top-level security is materialized to operations without own security", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth"], {
      security: [{ BearerAuth: [] }],
      paths: {
        "/api/v1/auth/me": {
          get: {
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      }
    }),
    buildSecurityDoc("services")
  ]);

  assert.deepEqual(merged.paths["/api/v1/backend/auth/me"].get.security, [{ backend_BearerAuth: [] }]);
  assert.equal("security" in merged, false);
});

test("openapi merge: operation-level security overrides top-level default", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth", "ApiKeyAuth"], {
      security: [{ BearerAuth: [] }],
      paths: {
        "/api/v1/auth/me": {
          get: {
            security: [{ ApiKeyAuth: [] }],
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      }
    }),
    buildSecurityDoc("services", ["BearerAuth", "ApiKeyAuth"])
  ]);

  assert.deepEqual(merged.paths["/api/v1/backend/auth/me"].get.security, [{ backend_ApiKeyAuth: [] }]);
});

test("openapi merge: top-level security is materialized for webhook operations", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth"], {
      security: [{ BearerAuth: [] }],
      webhooks: {
        orderCreated: {
          post: {
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      }
    }),
    buildSecurityDoc("services")
  ]);

  assert.deepEqual(merged.webhooks.orderCreated.post.security, [{ backend_BearerAuth: [] }]);
});

test("openapi merge: top-level security is materialized for callback operations", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth"], {
      security: [{ BearerAuth: [] }],
      paths: {
        "/api/v1/auth/me": {
          get: {
            callbacks: {
              lifecycle: {
                "{$request.body#/callbackUrl}": {
                  post: {
                    responses: {
                      "200": {
                        description: "ok"
                      }
                    }
                  }
                }
              }
            },
            responses: {
              "200": {
                description: "ok"
              }
            }
          }
        }
      }
    }),
    buildSecurityDoc("services")
  ]);

  assert.deepEqual(
    merged.paths["/api/v1/backend/auth/me"].get.callbacks.lifecycle["{$request.body#/callbackUrl}"].post.security,
    [{ backend_BearerAuth: [] }]
  );
});

test("openapi merge: top-level security is materialized inside components.callbacks", () => {
  const merged = mergeSchemas([buildComponentCallbackSecurityDoc("backend"), buildSecurityDoc("services")]);

  assert.deepEqual(merged.components.callbacks.SharedCallback["{$request.body#/callbackUrl}"].post.security, [{ backend_BearerAuth: [] }]);
});

test("openapi merge: conflicting security schemes are rewritten inside components.callbacks", () => {
  const merged = mergeSchemas([buildComponentCallbackSecurityDoc("backend"), buildComponentCallbackSecurityDoc("services")]);

  assert.deepEqual(merged.components.callbacks.backend_SharedCallback["{$request.body#/callbackUrl}"].post.security, [{ backend_BearerAuth: [] }]);
  assert.deepEqual(merged.components.callbacks.services_SharedCallback["{$request.body#/callbackUrl}"].post.security, [{ services_BearerAuth: [] }]);
});

test("openapi merge: operation-level security inside components.callbacks overrides top-level default", () => {
  const merged = mergeSchemas([
    buildComponentCallbackSecurityDoc("backend", {
      components: {
        securitySchemes: {
          BearerAuth: { type: "http", scheme: "bearer" },
          ApiKeyAuth: { type: "apiKey", in: "header", name: "X-Api-Key" }
        },
        callbacks: {
          SharedCallback: {
            "{$request.body#/callbackUrl}": {
              post: {
                security: [{ ApiKeyAuth: [] }],
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
    }),
    buildSecurityDoc("services")
  ]);

  assert.deepEqual(merged.components.callbacks.SharedCallback["{$request.body#/callbackUrl}"].post.security, [{ ApiKeyAuth: [] }]);
});

test("openapi merge: security empty array stays public inside components.callbacks", () => {
  const merged = mergeSchemas([
    buildComponentCallbackSecurityDoc("backend", {
      components: {
        securitySchemes: {
          BearerAuth: { type: "http", scheme: "bearer" }
        },
        callbacks: {
          SharedCallback: {
            "{$request.body#/callbackUrl}": {
              post: {
                security: [],
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
    })
  ]);

  assert.deepEqual(merged.components.callbacks.SharedCallback["{$request.body#/callbackUrl}"].post.security, []);
});

test("openapi merge: unknown security scheme inside components.callbacks fails with unresolved_security_scheme", () => {
  assert.throws(
    () =>
      mergeSchemas([
        buildComponentCallbackSecurityDoc("backend", {
          components: {
            securitySchemes: {
              BearerAuth: { type: "http", scheme: "bearer" }
            },
            callbacks: {
              SharedCallback: {
                "{$request.body#/callbackUrl}": {
                  post: {
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
        })
      ]),
    (error) => {
      assert.ok(error instanceof OpenApiMergeError);
      assert.equal(error.code, "unresolved_security_scheme");
      assert.equal(error.details.scheme, "MissingAuth");
      assert.equal(error.details.location, "component callback SharedCallback {$request.body#/callbackUrl}");
      assert.equal(error.details.method, "POST");
      return true;
    }
  );
});

test("openapi merge: callback component used through $ref stays valid after callback component rename", () => {
  const merged = mergeSchemas([buildComponentCallbackSecurityDoc("backend"), buildComponentCallbackSecurityDoc("services")]);

  assert.equal(merged.paths["/api/v1/backend/auth/me"].get.callbacks.shared.$ref, "#/components/callbacks/backend_SharedCallback");
  assert.equal(merged.paths["/api/v1/services/auth/me"].get.callbacks.shared.$ref, "#/components/callbacks/services_SharedCallback");
});

test("openapi merge: nested callback inside component callback is also processed", () => {
  const merged = mergeSchemas([
    buildComponentCallbackSecurityDoc("backend", {
      components: {
        securitySchemes: {
          BearerAuth: { type: "http", scheme: "bearer" }
        },
        callbacks: {
          SharedCallback: {
            "{$request.body#/callbackUrl}": {
              post: {
                callbacks: {
                  nested: {
                    "{$request.body#/nestedCallbackUrl}": {
                      trace: {
                        responses: {
                          "200": {
                            description: "ok"
                          }
                        }
                      }
                    }
                  }
                },
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
    })
  ]);

  assert.deepEqual(
    merged.components.callbacks.SharedCallback["{$request.body#/callbackUrl}"].post.callbacks.nested["{$request.body#/nestedCallbackUrl}"].trace.security,
    [{ BearerAuth: [] }]
  );
});

test("openapi merge: unresolved security scheme fails with controlled error", () => {
  assert.throws(
    () =>
      mergeSchemas([
        buildSecurityDoc("backend", ["BearerAuth"], {
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
        })
      ]),
    (error) => {
      assert.ok(error instanceof OpenApiMergeError);
      assert.equal(error.code, "unresolved_security_scheme");
      assert.equal(error.details.scheme, "MissingAuth");
      assert.equal(error.details.location, "/api/v1/backend/auth/me");
      assert.equal(error.details.method, "GET");
      return true;
    }
  );
});

test("openapi merge: identical jsonSchemaDialect is preserved", () => {
  const merged = mergeSchemas([
    buildSecurityDoc("backend", ["BearerAuth"], { jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema" }),
    buildSecurityDoc("services", ["BearerAuth"], { jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema" })
  ]);

  assert.equal(merged.jsonSchemaDialect, "https://json-schema.org/draft/2020-12/schema");
});

test("openapi merge: conflicting jsonSchemaDialect fails with controlled error", () => {
  assert.throws(
    () =>
      mergeSchemas([
        buildSecurityDoc("backend", ["BearerAuth"], { jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema" }),
        buildSecurityDoc("services", ["BearerAuth"], { jsonSchemaDialect: "https://example.com/custom-dialect" })
      ]),
    (error) => {
      assert.ok(error instanceof OpenApiMergeError);
      assert.equal(error.code, "conflicting_json_schema_dialect");
      assert.deepEqual(error.details.dialects, [
        "https://example.com/custom-dialect",
        "https://json-schema.org/draft/2020-12/schema"
      ]);
      return true;
    }
  );
});

test("openapi merge: root and nested schema refs are rewritten with preserved suffix", () => {
  const merged = mergeSchemas([
    buildSchemaDoc("backend", ["User"], "#/components/schemas/User/properties/id"),
    buildSchemaDoc("services", ["User"])
  ]);

  assert.equal(
    merged.paths["/api/v1/backend/auth/me"].get.responses["200"].content["application/json"].schema.$ref,
    "#/components/schemas/backend_User/properties/id"
  );
});

test("openapi merge: escaped nested JSON Pointer suffix is preserved", () => {
  const merged = mergeSchemas([
    {
      source: "backend",
      doc: {
        paths: {
          "/api/v1/errors": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/responses/Error/content/application~1json/schema" }
                    }
                  }
                }
              }
            }
          }
        },
        components: {
          responses: {
            Error: {
              content: {
                "application/json": {
                  schema: { type: "string" }
                }
              }
            }
          }
        }
      }
    },
    {
      source: "services",
      doc: {
        components: {
          responses: {
            Error: {
              content: {
                "application/json": {
                  schema: { type: "number" }
                }
              }
            }
          }
        }
      }
    }
  ]);

  assert.equal(
    merged.paths["/api/v1/backend/errors"].get.responses["200"].content["application/json"].schema.$ref,
    "#/components/responses/backend_Error/content/application~1json/schema"
  );
});

test("openapi merge: refs inside arrays, components, path responses, discriminator mapping and webhooks are rewritten", () => {
  const merged = mergeSchemas([
    {
      source: "backend",
      doc: {
        webhooks: {
          orderCreated: {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      allOf: [{ $ref: "#/components/schemas/User/properties/id" }]
                    }
                  }
                }
              },
              responses: {
                "200": { description: "ok" }
              }
            }
          }
        },
        paths: {
          "/api/v1/auth/me": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/User" }
                    }
                  }
                }
              }
            }
          }
        },
        components: {
          schemas: {
            User: {
              oneOf: [{ $ref: "#/components/schemas/UserPayload" }],
              discriminator: {
                propertyName: "kind",
                mapping: {
                  payload: "#/components/schemas/UserPayload/properties/id"
                }
              }
            },
            UserPayload: {
              type: "object",
              properties: { id: { type: "string" } }
            },
            Wrapper: {
              properties: {
                child: { $ref: "#/components/schemas/User/properties/id" }
              }
            }
          }
        }
      }
    },
    buildSchemaDoc("services", ["User"])
  ]);

  assert.equal(merged.components.schemas.Wrapper.properties.child.$ref, "#/components/schemas/backend_User/properties/id");
  assert.deepEqual(merged.components.schemas.backend_User.oneOf, [{ $ref: "#/components/schemas/UserPayload" }]);
  assert.deepEqual(merged.components.schemas.backend_User.discriminator.mapping, {
    payload: "#/components/schemas/UserPayload/properties/id"
  });
  assert.equal(
    merged.webhooks.orderCreated.post.requestBody.content["application/json"].schema.allOf[0].$ref,
    "#/components/schemas/backend_User/properties/id"
  );
});

test("openapi merge: external refs remain unchanged", () => {
  const merged = mergeSchemas([
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
                      schema: { $ref: "https://example.com/schemas/User.json" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  ]);

  assert.equal(
    merged.paths["/api/v1/backend/auth/me"].get.responses["200"].content["application/json"].schema.$ref,
    "https://example.com/schemas/User.json"
  );
});

test("openapi merge: unresolved nested local refs fail with controlled error", () => {
  assert.throws(
    () =>
      mergeSchemas([
        {
          source: "services",
          doc: {
            paths: {
              "/api/v1/orders/": {
                get: {
                  responses: {
                    "200": {
                      content: {
                        "application/json": {
                          schema: { $ref: "#/components/schemas/MissingOrder/properties/id" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      ]),
    (error) => {
      assert.ok(error instanceof OpenApiMergeError);
      assert.equal(error.code, "unresolved_local_ref");
      assert.deepEqual(error.details.refs, ["#/components/schemas/MissingOrder/properties/id"]);
      return true;
    }
  );
});

for (const sectionName of [
  "schemas",
  "parameters",
  "responses",
  "requestBodies",
  "headers",
  "securitySchemes",
  "examples",
  "links",
  "callbacks",
  "pathItems"
]) {
  test(`openapi merge: collision handling covers component section ${sectionName}`, () => {
    const merged = mergeSchemas(buildSectionCollisionDocs(sectionName));
    assert.ok(merged.components[sectionName][`backend_Shared`]);
    assert.ok(merged.components[sectionName][`services_Shared`]);
  });
}

test("openapi merge: same canonical path with different methods merges successfully", () => {
  const merged = mergeSchemas([
    {
      source: "services",
      doc: {
        paths: {
          "/api/v1/orders/": {
            get: {
              responses: { "200": { description: "ok" } }
            }
          }
        }
      }
    },
    {
      source: "legacy-services",
      doc: {
        paths: {
          "/api/v1/services/orders/": {
            post: {
              responses: { "202": { description: "accepted" } }
            }
          }
        }
      }
    }
  ]);

  assert.ok(merged.paths["/api/v1/services/orders/"].get);
  assert.ok(merged.paths["/api/v1/services/orders/"].post);
});

test("openapi merge: same canonical path and method fails with both source names in error", () => {
  assert.throws(
    () =>
      mergeSchemas([
        {
          source: "services",
          doc: {
            paths: {
              "/api/v1/orders/": {
                get: {
                  responses: { "200": { description: "ok" } }
                }
              }
            }
          }
        },
        {
          source: "legacy-services",
          doc: {
            paths: {
              "/api/v1/services/orders/": {
                get: {
                  responses: { "200": { description: "ok" } }
                }
              }
            }
          }
        }
      ]),
    (error) => {
      assert.ok(error instanceof OpenApiMergeError);
      assert.equal(error.code, "path_method_collision");
      assert.equal(error.details.path, "/api/v1/services/orders/");
      assert.equal(error.details.method, "GET");
      assert.deepEqual(error.details.sources, ["services", "legacy-services"]);
      return true;
    }
  );
});

test("openapi merge: TRACE operation is preserved, tagged and receives x-repository", () => {
  const merged = mergeSchemas([
    {
      source: "backend",
      doc: {
        security: [{ BearerAuth: [] }],
        paths: {
          "/api/v1/diagnostics": {
            trace: {
              responses: {
                "200": {
                  description: "ok"
                }
              }
            }
          }
        },
        components: {
          securitySchemes: {
            BearerAuth: {
              type: "http",
              scheme: "bearer"
            }
          }
        }
      }
    }
  ]);

  const traceOperation = merged.paths["/api/v1/backend/diagnostics"].trace;
  assert.equal(traceOperation["x-repository"], "backend");
  assert.deepEqual(traceOperation.tags, ["Backend / Diagnostics"]);
  assert.deepEqual(traceOperation.security, [{ BearerAuth: [] }]);
});

test("openapi merge: TRACE with unknown security scheme fails with controlled error", () => {
  assert.throws(
    () =>
      mergeSchemas([
        {
          source: "backend",
          doc: {
            paths: {
              "/api/v1/diagnostics": {
                trace: {
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
      ]),
    (error) => {
      assert.ok(error instanceof OpenApiMergeError);
      assert.equal(error.code, "unresolved_security_scheme");
      assert.equal(error.details.location, "/api/v1/backend/diagnostics");
      assert.equal(error.details.method, "TRACE");
      return true;
    }
  );
});

test("openapi merge: two sources with same canonical path and TRACE collide", () => {
  assert.throws(
    () =>
      mergeSchemas([
        {
          source: "services",
          doc: {
            paths: {
              "/api/v1/diagnostics": {
                trace: {
                  responses: {
                    "200": {
                      description: "ok"
                    }
                  }
                }
              }
            }
          }
        },
        {
          source: "legacy-services",
          doc: {
            paths: {
              "/api/v1/services/diagnostics": {
                trace: {
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
      ]),
    (error) => {
      assert.ok(error instanceof OpenApiMergeError);
      assert.equal(error.code, "path_method_collision");
      assert.equal(error.details.method, "TRACE");
      return true;
    }
  );
});

test("openapi merge: trailing-slash route variants receive different operationIds", () => {
  const merged = mergeSchemas([
    {
      source: "orchestrator",
      doc: {
        paths: {
          "/api/v1/orchestrator/product-editor/discover": {
            post: {
              operationId: "discover"
            }
          },
          "/api/v1/orchestrator/product-editor/discover/": {
            post: {
              operationId: "discover"
            }
          }
        }
      }
    }
  ]);

  const firstId = merged.paths["/api/v1/orchestrator/product-editor/discover"].post.operationId;
  const secondId = merged.paths["/api/v1/orchestrator/product-editor/discover/"].post.operationId;
  assert.notEqual(firstId, secondId);
  assert.equal(firstId, "orchestrator_discover");
  assert.equal(secondId, "orchestrator_discover_2");
});

test("openapi merge: identical source operationIds across sources become unique", () => {
  const merged = mergeSchemas([
    {
      source: "backend",
      doc: {
        paths: {
          "/api/v1/auth/me": {
            get: {
              operationId: "fetchUser"
            }
          }
        }
      }
    },
    {
      source: "services",
      doc: {
        paths: {
          "/api/v1/orders/": {
            get: {
              operationId: "fetchUser"
            }
          }
        }
      }
    }
  ]);

  assert.equal(merged.paths["/api/v1/backend/auth/me"].get.operationId, "backend_fetchUser");
  assert.equal(merged.paths["/api/v1/services/orders/"].get.operationId, "services_fetchUser");
});

test("openapi merge: three identical operationIds get deterministic suffixes", () => {
  const merged = mergeSchemas([
    {
      source: "backend",
      doc: {
        paths: {
          "/api/v1/auth/me": {
            get: {
              operationId: "shared"
            }
          },
          "/api/v1/auth/me/details": {
            get: {
              operationId: "shared"
            }
          },
          "/api/v1/auth/me/history": {
            get: {
              operationId: "shared"
            }
          }
        }
      }
    }
  ]);

  const ids = [
    merged.paths["/api/v1/backend/auth/me"].get.operationId,
    merged.paths["/api/v1/backend/auth/me/details"].get.operationId,
    merged.paths["/api/v1/backend/auth/me/history"].get.operationId
  ];

  assert.deepEqual(ids, ["backend_shared", "backend_shared_2", "backend_shared_3"]);
});

test("openapi merge: operationId allocation is deterministic regardless of source order", () => {
  const docs = [
    {
      source: "backend",
      doc: {
        paths: {
          "/api/v1/auth/me": {
            get: {
              operationId: "shared"
            }
          }
        }
      }
    },
    {
      source: "services",
      doc: {
        paths: {
          "/api/v1/orders/": {
            get: {
              operationId: "shared"
            }
          }
        }
      }
    }
  ];

  const forward = mergeSchemas(docs);
  const reversed = mergeSchemas([...docs].reverse());
  assert.equal(forward.paths["/api/v1/backend/auth/me"].get.operationId, reversed.paths["/api/v1/backend/auth/me"].get.operationId);
  assert.equal(forward.paths["/api/v1/services/orders/"].get.operationId, reversed.paths["/api/v1/services/orders/"].get.operationId);
});

test("openapi merge: operation without operationId gets generated ID", () => {
  const merged = mergeSchemas([
    {
      source: "backend",
      doc: {
        paths: {
          "/api/v1/auth/me": {
            get: {
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
  ]);

  assert.equal(merged.paths["/api/v1/backend/auth/me"].get.operationId, "backend_get_api_v1_backend_auth_me");
});

test("openapi merge: webhook, inline callback, component pathItem, component callback and TRACE get unique operationIds", () => {
  const merged = mergeSchemas([
    {
      source: "backend",
      doc: {
        webhooks: {
          hook: {
            post: {
              operationId: "notify"
            }
          }
        },
        components: {
          pathItems: {
            SharedPathItem: {
              trace: {
                operationId: "notify"
              }
            }
          },
          callbacks: {
            SharedCallback: {
              "{$request.body#/callbackUrl}": {
                post: {
                  operationId: "notify"
                }
              }
            }
          }
        },
        paths: {
          "/api/v1/auth/me": {
            get: {
              operationId: "notify",
              callbacks: {
                nested: {
                  "{$request.body#/callbackUrl}": {
                    post: {
                      operationId: "notify"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  ]);

  const ids = [
    merged.webhooks.hook.post.operationId,
    merged.components.pathItems.SharedPathItem.trace.operationId,
    merged.components.callbacks.SharedCallback["{$request.body#/callbackUrl}"].post.operationId,
    merged.paths["/api/v1/backend/auth/me"].get.operationId,
    merged.paths["/api/v1/backend/auth/me"].get.callbacks.nested["{$request.body#/callbackUrl}"].post.operationId
  ];

  assert.equal(new Set(ids).size, ids.length);
});

test("openapi merge: validateOperationIds detects duplicates if allocator is bypassed", () => {
  const merged = mergeSchemas([
    {
      source: "backend",
      doc: {
        paths: {
          "/api/v1/auth/me": {
            get: {
              operationId: "fetchMe"
            }
          },
          "/api/v1/auth/profile": {
            get: {
              operationId: "fetchProfile"
            }
          }
        }
      }
    }
  ]);

  merged.paths["/api/v1/backend/auth/profile"].get.operationId = merged.paths["/api/v1/backend/auth/me"].get.operationId;

  assert.throws(
    () => validateOperationIds(merged),
    (error) => {
      assert.ok(error instanceof OpenApiMergeError);
      assert.equal(error.code, "duplicate_operation_id");
      return true;
    }
  );
});

test("openapi merge: final document publishes canonical public paths only", () => {
  const merged = mergeSchemas([
    {
      source: "backend",
      doc: {
        paths: {
          "/api/v1/auth/login": {
            post: {
              responses: { "200": { description: "ok" } }
            }
          }
        }
      }
    },
    {
      source: "services",
      doc: {
        paths: {
          "/api/v1/uploads/images/": {
            post: {
              responses: { "201": { description: "created" } }
            }
          }
        }
      }
    },
    {
      source: "orchestrator",
      doc: {
        paths: {
          "/api/v1/metrics": {
            get: {
              responses: { "200": { description: "ok" } }
            }
          },
          "/api/v1/orchestrator/jobs": {
            post: {
              responses: { "202": { description: "accepted" } }
            }
          }
        }
      }
    }
  ]);

  const paths = Object.keys(merged.paths);
  assert.deepEqual(paths, [
    "/api/v1/backend/auth/login",
    "/api/v1/services/uploads/images/",
    "/api/v1/orchestrator/metrics",
    "/api/v1/orchestrator/jobs"
  ]);
  assert.equal(paths.some((path) => /^\/api\/v1\/(jv|xl|hood)(?:\/|$)/.test(path)), false);
});
