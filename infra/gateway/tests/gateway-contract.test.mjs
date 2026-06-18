import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const composeFile = path.join(__dirname, "docker-compose.gateway.yml");
const composeProject = "warehub_gateway_contract";
const gatewayPort = 18080;

function gatewayBaseUrl() {
  return `http://127.0.0.1:${gatewayPort}`;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      GATEWAY_TEST_PORT: String(gatewayPort)
    },
    ...options
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with code ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
    );
  }

  return result.stdout;
}

function runCommandAllowFailure(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      GATEWAY_TEST_PORT: String(gatewayPort)
    },
    ...options
  });
}

function compose(args) {
  return runCommand("docker", ["compose", "-p", composeProject, "-f", composeFile, ...args]);
}

function composeContainerName(service) {
  return `${composeProject}-${service}-1`;
}

function composeContainerId(service) {
  return inspectContainer(service).Id;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRoute(targetPath, predicate, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await requestJson(targetPath);
      if (predicate(response)) {
        return response;
      }
    } catch {
      // Retry until timeout.
    }
    await sleep(1000);
  }

  throw new Error(`Timed out waiting for route ${targetPath}`);
}

function requestRaw(targetPath, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      `${gatewayBaseUrl()}${targetPath}`,
      {
        method,
        headers
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            rawHeaders: response.rawHeaders,
            text: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    request.on("error", reject);

    if (body !== undefined) {
      request.write(body);
    }

    request.end();
  });
}

async function requestJson(targetPath, options = {}) {
  const response = await requestRaw(targetPath, options);
  return {
    ...response,
    body: response.text ? JSON.parse(response.text) : null
  };
}

function requestJsonFromNodeContainer(service, targetPath, headers = {}, baseUrl = "http://gateway:8080") {
  const script =
    "const http=require('http');" +
    "const url=new URL(process.env.TARGET_PATH, process.env.BASE_URL).toString();" +
    "const headers=JSON.parse(process.env.REQUEST_HEADERS||'{}');" +
    "http.get(url,{headers},res=>{const chunks=[];res.on('data',c=>chunks.push(Buffer.from(c)));res.on('end',()=>{process.stdout.write(JSON.stringify({statusCode:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));});}).on('error',err=>{console.error(err.stack||String(err));process.exit(1);});";

  const output = runCommand("docker", [
    "exec",
    "-e",
    `TARGET_PATH=${targetPath}`,
    "-e",
    `BASE_URL=${baseUrl}`,
    "-e",
    `REQUEST_HEADERS=${JSON.stringify(headers)}`,
    composeContainerName(service),
    "node",
    "-e",
    script
  ]);

  const response = JSON.parse(output);
  return {
    ...response,
    body: response.text ? JSON.parse(response.text) : null
  };
}

function inspectContainer(service) {
  return JSON.parse(runCommand("docker", ["inspect", composeContainerName(service)]))[0];
}

function composeNetwork(container) {
  const networks = Object.entries(container.NetworkSettings.Networks);
  const projectNetwork = networks.find(([name]) => name.startsWith(`${composeProject}_`)) ?? networks[0];

  if (!projectNetwork) {
    throw new Error(`Container ${container.Name} is not attached to a compose network`);
  }

  const [name, details] = projectNetwork;
  if (!details.IPAddress) {
    throw new Error(`Container ${container.Name} has no IPv4 address on ${name}`);
  }

  return {
    name,
    ip: details.IPAddress
  };
}

function headerValues(response, headerName) {
  const values = [];
  const target = headerName.toLowerCase();

  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    if (response.rawHeaders[index].toLowerCase() === target) {
      values.push(response.rawHeaders[index + 1]);
    }
  }

  return values;
}

async function recreateUpstreamWithReservedOldIp(service) {
  const gatewayIdBefore = composeContainerId("gateway");
  const upstreamBefore = inspectContainer(service);
  const upstreamIdBefore = upstreamBefore.Id;
  const oldNetwork = composeNetwork(upstreamBefore);
  const reservationName = `${composeProject}-${service}-ip-reservation`;

  runCommandAllowFailure("docker", ["rm", "-f", reservationName]);
  compose(["rm", "-f", "--stop", service]);

  try {
    runCommand("docker", [
      "run",
      "-d",
      "--name",
      reservationName,
      "--network",
      oldNetwork.name,
      "--ip",
      oldNetwork.ip,
      "node:24-alpine",
      "sh",
      "-c",
      "sleep 120"
    ]);
    compose(["up", "-d", service]);

    const upstreamAfter = inspectContainer(service);
    const newNetwork = composeNetwork(upstreamAfter);

    return {
      gatewayIdBefore,
      upstreamIdBefore,
      upstreamIpBefore: oldNetwork.ip,
      upstreamIdAfter: upstreamAfter.Id,
      upstreamIpAfter: newNetwork.ip
    };
  } finally {
    runCommandAllowFailure("docker", ["rm", "-f", reservationName]);
  }
}

async function websocketHandshake(targetPath, { requestId, protocol } = {}) {
  return new Promise((resolve, reject) => {
    const lines = [
      `GET ${targetPath} HTTP/1.1`,
      "Host: gateway.test",
      "Connection: Upgrade",
      "Upgrade: websocket",
      "Sec-WebSocket-Version: 13",
      "Sec-WebSocket-Key: SGVsbG9XYXJlSHViIQ=="
    ];

    if (requestId) {
      lines.push(`X-Request-ID: ${requestId}`);
    }

    if (protocol) {
      lines.push(`Sec-WebSocket-Protocol: ${protocol}`);
    }

    const socket = net.createConnection({ host: "127.0.0.1", port: gatewayPort }, () => {
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    });

    let data = "";
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      if (data.includes("\r\n\r\n")) {
        socket.end();
      }
    });
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
  });
}

test.before(async () => {
  compose(["down", "--volumes", "--remove-orphans"]);
  compose(["up", "-d", "--build"]);
  await sleep(5000);
});

test.after(() => {
  compose(["down", "--volumes", "--remove-orphans"]);
});

test("gateway config: static hardening requirements are present", async () => {
  const nginx = await fs.readFile(path.join(repoRoot, "infra/gateway/nginx.conf"), "utf8");
  const dockerfile = await fs.readFile(path.join(repoRoot, "infra/gateway/Dockerfile"), "utf8");
  const template = await fs.readFile(path.join(repoRoot, "infra/gateway/conf.d/default.conf.template"), "utf8");
  const trustedProxy = await fs.readFile(
    path.join(repoRoot, "infra/gateway/docker-entrypoint.d/06-trusted-proxy.sh"),
    "utf8"
  );
  const testCompose = await fs.readFile(path.join(repoRoot, "infra/gateway/tests/docker-compose.gateway.yml"), "utf8");
  const stageCompose = await fs.readFile(path.join(repoRoot, "infra/deploy/stage/docker-compose.yml"), "utf8");
  const prodCompose = await fs.readFile(path.join(repoRoot, "infra/deploy/prod/docker-compose.yml"), "utf8");

  assert.match(nginx, /resolver 127\.0\.0\.11 ipv6=off valid=10s;/);
  assert.match(template, /include \/etc\/nginx\/conf\.d\/trusted-proxy\.conf;/);
  assert.match(nginx, /map \$uri \$gateway_route_class \{/);
  assert.match(nginx, /map \$gateway_route_class \$gateway_deprecation \{/);
  assert.match(nginx, /"route_class":"\$gateway_route_class"/);
  assert.match(nginx, /"uri":"\$uri"/);
  assert.doesNotMatch(nginx, /\$request_uri/);
  assert.match(nginx, /\/api\/v1 legacy;/);
  assert.doesNotMatch(nginx, /\$proxy_forwarded_for/);
  assert.match(template, /Request-level nginx errors can contain the full URI/);
  assert.match(template, /Operational upstream status remains available in the query-free JSON access log/);
  assert.match(template, /error_log \/dev\/stderr crit;/);
  assert.doesNotMatch(template, /\$\{GATEWAY_LOG_LEVEL\}|GATEWAY_LOG_LEVEL/);
  assert.match(template, /add_header X-Request-ID \$proxy_request_id always;/);
  assert.match(template, /add_header Deprecation \$gateway_deprecation always;/);
  assert.match(template, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(template, /proxy_hide_header X-Request-ID;/);
  assert.match(template, /proxy_hide_header Deprecation;/);
  assert.match(template, /location = \/api\/v1 \{/);
  assert.match(template, /location @frontend_502 \{/);
  assert.match(trustedProxy, /real_ip_header X-Real-IP;/);
  assert.match(testCompose, /read_only: true/);
  assert.match(testCompose, /host\.docker\.internal:host-gateway/);

  for (const source of [dockerfile, testCompose, stageCompose, prodCompose]) {
    assert.doesNotMatch(source, /GATEWAY_LOG_LEVEL/);
  }
});

test("frontend canonical routes go to frontend upstream unchanged", async () => {
  const root = await requestJson("/");
  assert.equal(root.body.server, "frontend");
  assert.equal(root.body.url, "/");
  assert.equal(root.headers.deprecation, undefined);

  const login = await requestJson("/login");
  assert.equal(login.body.server, "frontend");
  assert.equal(login.body.url, "/login");
  assert.equal(login.headers.deprecation, undefined);

  const nextAsset = await requestJson("/_next/static/chunks/app.js");
  assert.equal(nextAsset.body.server, "frontend");
  assert.equal(nextAsset.body.url, "/_next/static/chunks/app.js");

  const openapi = await requestJson("/api/v1/docs/openapi");
  assert.equal(openapi.body.server, "frontend");
  assert.equal(openapi.body.url, "/api/v1/docs/openapi");
  assert.equal(openapi.headers.deprecation, undefined);
});

test("backend canonical routing strips only /backend and preserves method, body, query, slash", async () => {
  const health = await requestJson("/api/v1/backend/healthz");
  assert.equal(health.body.server, "backend");
  assert.equal(health.body.url, "/api/v1/healthz");
  assert.equal(health.headers.deprecation, undefined);

  const post = await requestJson("/api/v1/backend/auth/login?source=ui", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ email: "user@example.com" })
  });
  assert.equal(post.body.server, "backend");
  assert.equal(post.body.method, "POST");
  assert.equal(post.body.url, "/api/v1/auth/login?source=ui");
  assert.equal(post.body.body, JSON.stringify({ email: "user@example.com" }));
  assert.equal(post.headers.deprecation, undefined);

  const trailing = await requestJson("/api/v1/backend/orders/");
  assert.equal(trailing.body.url, "/api/v1/orders/");
});

test("legacy backend route keeps deprecation and request id headers", async () => {
  const response = await requestJson("/api/v1/healthz", {
    headers: {
      "x-request-id": "legacy-backend-1"
    }
  });

  assert.equal(response.body.server, "backend");
  assert.equal(response.body.url, "/api/v1/healthz");
  assert.equal(response.headers.deprecation, "true");
  assert.equal(response.headers["x-request-id"], "legacy-backend-1");
});

test("legacy api root routes exactly to backend with deprecation and request id", async () => {
  const response = await requestJson("/api/v1?source=legacy", {
    headers: {
      "x-request-id": "legacy-root-1"
    }
  });

  assert.equal(response.body.server, "backend");
  assert.equal(response.body.url, "/api/v1?source=legacy");
  assert.equal(response.headers.deprecation, "true");
  assert.equal(response.headers["x-request-id"], "legacy-root-1");
});

test("gateway owns canonical response identity headers over upstream conflicts", async () => {
  const response = await requestJson("/api/v1/backend/auth/me", {
    headers: {
      "x-request-id": "canonical-response-owner-1",
      "x-mock-conflicting-identity": "true"
    }
  });

  assert.equal(response.body.server, "backend");
  assert.equal(response.headers["x-request-id"], "canonical-response-owner-1");
  assert.deepEqual(headerValues(response, "x-request-id"), ["canonical-response-owner-1"]);
  assert.equal(response.headers.deprecation, undefined);
  assert.deepEqual(headerValues(response, "deprecation"), []);
  assert.notEqual(response.headers["x-request-id"], "upstream-conflicting-id");
});

test("gateway owns legacy response identity and deprecation headers over upstream conflicts", async () => {
  const response = await requestJson("/api/v1/healthz", {
    headers: {
      "x-request-id": "legacy-response-owner-1",
      "x-mock-conflicting-identity": "true"
    }
  });

  assert.equal(response.body.server, "backend");
  assert.equal(response.headers["x-request-id"], "legacy-response-owner-1");
  assert.deepEqual(headerValues(response, "x-request-id"), ["legacy-response-owner-1"]);
  assert.equal(response.headers.deprecation, "true");
  assert.deepEqual(headerValues(response, "deprecation"), ["true"]);
  assert.notEqual(response.headers["x-request-id"], "upstream-conflicting-id");
  assert.notEqual(response.headers.deprecation, "false");
});

test("legacy backend upload preserves multipart body, query string, deprecation, and request id", async () => {
  const boundary = "gateway-contract-upload";
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="label.txt"',
    "Content-Type: text/plain",
    "",
    "legacy-upload-body",
    `--${boundary}--`,
    ""
  ].join("\r\n");

  const response = await requestJson("/api/v1/uploads?source=mobile", {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "x-request-id": "legacy-upload-1"
    },
    body
  });

  assert.equal(response.body.server, "backend");
  assert.equal(response.body.url, "/api/v1/uploads?source=mobile");
  assert.equal(response.body.body, body);
  assert.equal(response.headers.deprecation, "true");
  assert.equal(response.headers["x-request-id"], "legacy-upload-1");
});

test("canonical and legacy websocket handshakes preserve request id, query string, protocol, and legacy headers", async () => {
  const canonical = await websocketHandshake("/api/v1/backend/intakes/ws?client=mobile", {
    requestId: "ws-canonical-1",
    protocol: "auth.test-token"
  });
  assert.match(canonical, /^HTTP\/1\.1 101 Switching Protocols/m);
  assert.match(canonical, /X-Mock-Path: \/api\/v1\/intakes\/ws\?client=mobile/m);
  assert.match(canonical, /X-Mock-Request-Id: ws-canonical-1/m);
  assert.match(canonical, /Sec-WebSocket-Protocol: auth\.test-token/m);
  assert.doesNotMatch(canonical, /Deprecation: true/m);

  const legacy = await websocketHandshake("/api/v1/intakes/ws?client=mobile", {
    requestId: "ws-legacy-1",
    protocol: "auth.test-token"
  });
  assert.match(legacy, /^HTTP\/1\.1 101 Switching Protocols/m);
  assert.match(legacy, /X-Mock-Path: \/api\/v1\/intakes\/ws\?client=mobile/m);
  assert.match(legacy, /X-Mock-Request-Id: ws-legacy-1/m);
  assert.match(legacy, /Sec-WebSocket-Protocol: auth\.test-token/m);
  assert.match(legacy, /Deprecation: true/m);
  assert.match(legacy, /X-Request-ID: ws-legacy-1/m);
});

test("services canonical routes rewrite to service-owned /api/v1 paths", async () => {
  const generic = await requestJson("/api/v1/services/orders/42?expand=lines");
  assert.equal(generic.body.server, "services");
  assert.equal(generic.body.url, "/api/v1/orders/42?expand=lines");
  assert.equal(generic.headers.deprecation, undefined);

  const upload = await requestJson("/api/v1/services/uploads/images/?site=XL", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ ean: "123" })
  });
  assert.equal(upload.body.url, "/api/v1/uploads/images/?site=XL");
  assert.equal(upload.body.body, JSON.stringify({ ean: "123" }));
});

test("legacy service families route to services without redirects and keep deprecation and request id", async () => {
  const checks = [
    ["/api/v1/jv/products?site=DE", "/api/v1/jv/products?site=DE"],
    ["/api/v1/xl/products/42", "/api/v1/xl/products/42"],
    ["/api/v1/hood/items/by-ean/123", "/api/v1/hood/items/by-ean/123"],
    ["/api/v1/uploads/images?site=XL", "/api/v1/uploads/images?site=XL"]
  ];

  for (const [route, upstreamPath] of checks) {
    const response = await requestJson(route, {
      method: route.includes("/uploads/images") ? "POST" : "GET",
      headers: {
        "x-request-id": `legacy-service-${route}`
      },
      body: route.includes("/uploads/images") ? JSON.stringify({ ean: "123" }) : undefined
    });

    assert.equal(response.body.server, "services");
    assert.equal(response.body.url, upstreamPath);
    assert.equal(response.headers.deprecation, "true");
    assert.ok(response.headers["x-request-id"]);
  }
});

test("legacy /api/services and /services aliases preserve upstream path, slash behavior, deprecation, and request id", async () => {
  const apiServices = await requestJson("/api/services/jv/products?site=DE", {
    headers: {
      "x-request-id": "api-services-legacy-1"
    }
  });
  assert.equal(apiServices.body.server, "services");
  assert.equal(apiServices.body.url, "/api/v1/jv/products/?site=DE");
  assert.equal(apiServices.headers.deprecation, "true");
  assert.equal(apiServices.headers["x-request-id"], "api-services-legacy-1");

  const bareServices = await requestJson("/services/xl/products/?site=AT", {
    headers: {
      "x-request-id": "services-legacy-1"
    }
  });
  assert.equal(bareServices.body.server, "services");
  assert.equal(bareServices.body.url, "/api/v1/xl/products/?site=AT");
  assert.equal(bareServices.headers.deprecation, "true");
  assert.equal(bareServices.headers["x-request-id"], "services-legacy-1");
});

test("orchestrator canonical routes preserve namespace and own the exact root path", async () => {
  const health = await requestJson("/api/v1/orchestrator/healthz");
  assert.equal(health.body.server, "orchestrator");
  assert.equal(health.body.url, "/api/v1/healthz");
  assert.equal(health.headers.deprecation, undefined);

  const root = await requestJson("/api/v1/orchestrator");
  assert.equal(root.body.server, "orchestrator");
  assert.equal(root.body.url, "/api/v1/orchestrator");

  const rootWithSlash = await requestJson("/api/v1/orchestrator/");
  assert.equal(rootWithSlash.body.server, "orchestrator");
  assert.equal(rootWithSlash.body.url, "/api/v1/orchestrator/");
});

test("host published port real-ip flow preserves public host, client ip, https proto, and 443 fallback", async () => {
  const response = await requestJson("/api/v1/backend/auth/me", {
    headers: {
      host: "stagewarehub.automatonsoft.de",
      "x-real-ip": "198.51.100.20",
      "x-forwarded-for": "1.2.3.4, 198.51.100.20",
      "x-forwarded-proto": "https"
    }
  });

  assert.equal(response.body.headers.host, "stagewarehub.automatonsoft.de");
  assert.equal(response.body.headers["x-real-ip"], "198.51.100.20");
  assert.equal(response.body.headers["x-forwarded-for"], "198.51.100.20");
  assert.equal(response.body.headers["x-forwarded-proto"], "https");
  assert.equal(response.body.headers["x-forwarded-port"], "443");
  assert.equal(response.body.headers["x-forwarded-host"], "stagewarehub.automatonsoft.de");
  assert.doesNotMatch(JSON.stringify(response.body.headers), /1\.2\.3\.4/);
});

test("untrusted internal source cannot spoof real client ip via forwarded headers", async () => {
  const response = requestJsonFromNodeContainer("rogue", "/api/v1/backend/auth/me", {
    Host: "stagewarehub.automatonsoft.de",
    "X-Real-IP": "198.51.100.200",
    "X-Forwarded-For": "198.51.100.200",
    "X-Forwarded-Proto": "https"
  });

  assert.notEqual(response.body.headers["x-real-ip"], "198.51.100.200");
  assert.notEqual(response.body.headers["x-forwarded-for"], "198.51.100.200");
  assert.equal(response.body.headers["x-real-ip"], response.body.headers["x-forwarded-for"]);
  assert.equal(response.body.headers["x-forwarded-proto"], "http");
  assert.equal(response.body.headers["x-forwarded-port"], "80");
});

test("client supplied forwarded host and port are ignored in favor of normalized public host and proto-derived port", async () => {
  const response = await requestJson("/api/v1/backend/auth/me", {
    headers: {
      host: "stagewarehub.automatonsoft.de",
      "x-real-ip": "198.51.100.20",
      "x-forwarded-for": "198.51.100.20",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-port": "12345"
    }
  });

  assert.equal(response.body.headers.host, "stagewarehub.automatonsoft.de");
  assert.equal(response.body.headers["x-forwarded-host"], "stagewarehub.automatonsoft.de");
  assert.equal(response.body.headers["x-forwarded-port"], "443");
});

test("request ids are preserved or generated and secret-bearing headers are not logged", async () => {
  const explicitRequestId = "req-contract-explicit";
  const authToken = "Bearer contract-token-123";
  const cookieValue = "session=contract-cookie-123";

  const response = await requestJson("/api/v1/healthz", {
    headers: {
      authorization: authToken,
      cookie: cookieValue,
      "x-request-id": explicitRequestId
    }
  });

  assert.equal(response.headers.deprecation, "true");
  assert.equal(response.headers["x-request-id"], explicitRequestId);

  const generated = await requestJson("/api/v1/jv/products?site=DE");
  assert.equal(generated.headers.deprecation, "true");
  assert.ok(generated.headers["x-request-id"]);

  await websocketHandshake("/api/v1/intakes/ws?token=gateway-query-secret", {
    requestId: "ws-log-secret-1",
    protocol: "auth.test-token"
  });

  await sleep(1000);
  const logs = compose(["logs", "--no-color", "gateway"]);
  assert.match(logs, /"route_class":"legacy"/);
  assert.match(logs, /"uri":"\/api\/v1\/intakes\/ws"/);
  assert.doesNotMatch(logs, /gateway-query-secret/);
  assert.doesNotMatch(logs, /contract-token-123/);
  assert.doesNotMatch(logs, /contract-cookie-123/);
});

test("application-generated backend 503 is preserved and not rewritten into gateway JSON", async () => {
  const response = await requestRaw("/api/v1/backend/test/upstream-503");
  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.text), { source: "application" });
});

test("application-generated frontend 503 is preserved without gateway replacement", async () => {
  const response = await requestRaw("/login", {
    headers: {
      "x-mock-response-status": "503"
    }
  });

  assert.equal(response.statusCode, 503);
  assert.ok((response.headers["content-type"] ?? "").includes("application/json"));
  assert.deepEqual(JSON.parse(response.text), {
    source: "application",
    server: "frontend"
  });
});

test("quoted request id does not corrupt safe legacy failure json and keeps headers", async () => {
  compose(["stop", "backend"]);

  const failed = await requestRaw("/api/v1/healthz", {
    headers: {
      "x-request-id": 'request-"quoted'
    }
  });

  assert.ok([502, 503, 504].includes(failed.statusCode));
  assert.equal(failed.headers.deprecation, "true");
  assert.equal(failed.headers["x-request-id"], 'request-"quoted');
  assert.doesNotThrow(() => JSON.parse(failed.text));

  compose(["up", "-d", "--force-recreate", "backend"]);
  await waitForRoute("/api/v1/backend/healthz", (response) => response.statusCode === 200);
});

test("frontend connection failure returns non-json frontend-safe body while api route still returns safe json", async () => {
  compose(["stop", "frontend"]);

  const loginFailed = await requestRaw("/login");
  assert.ok([502, 503, 504].includes(loginFailed.statusCode));
  assert.ok(!(loginFailed.headers["content-type"] ?? "").includes("application/json"));
  assert.doesNotMatch(loginFailed.text, /gateway_upstream_/);
  assert.doesNotMatch(loginFailed.text, /frontend|backend|services|orchestrator|127\.0\.0\.1|8931/);

  const openapiFailed = await requestRaw("/api/v1/docs/openapi");
  assert.ok([502, 503, 504].includes(openapiFailed.statusCode));
  assert.ok((openapiFailed.headers["content-type"] ?? "").includes("application/json"));
  assert.doesNotThrow(() => JSON.parse(openapiFailed.text));

  const health = await requestJson("/gateway/healthz");
  assert.equal(health.statusCode, 200);
  assert.equal(health.body.status, "ok");

  compose(["up", "-d", "--force-recreate", "frontend"]);
  await waitForRoute("/login", (response) => response.statusCode === 200 && response.body.server === "frontend");
});

test("read-only gateway runtime is enforced with tmpfs exceptions only", async () => {
  const inspect = inspectContainer("gateway");
  assert.equal(inspect.Config.User, "101");
  assert.equal(inspect.HostConfig.ReadonlyRootfs, true);
  assert.ok(inspect.HostConfig.CapDrop.includes("ALL"));
  assert.ok(inspect.HostConfig.SecurityOpt.includes("no-new-privileges:true"));

  const writeAttempt = runCommandAllowFailure("docker", [
    "exec",
    composeContainerName("gateway"),
    "sh",
    "-lc",
    "echo blocked > /etc/nginx/templates/blocked.txt"
  ]);
  assert.notEqual(writeAttempt.status, 0);

  const health = await requestJson("/gateway/healthz");
  assert.equal(health.statusCode, 200);
});

test("unavailable upstream returns safe legacy gateway error while health stays up", async () => {
  compose(["stop", "backend"]);

  const failed = await requestRaw("/api/v1/healthz");
  assert.ok([502, 503, 504].includes(failed.statusCode));
  assert.equal(failed.headers.deprecation, "true");
  assert.equal(typeof failed.headers["x-request-id"], "string");
  assert.ok(failed.headers["x-request-id"].length > 0);
  assert.doesNotThrow(() => JSON.parse(failed.text));
  assert.doesNotMatch(failed.text, /backend|services|orchestrator|127\.0\.0\.1|8932/);

  const health = await requestJson("/gateway/healthz");
  assert.equal(health.statusCode, 200);

  compose(["up", "-d", "--force-recreate", "backend"]);
  await waitForRoute("/api/v1/backend/healthz", (response) => response.statusCode === 200);
});

test("upstream connection failure does not write query secrets to gateway logs", async () => {
  const secret = "gateway-error-log-secret-927451";

  await waitForRoute("/api/v1/backend/healthz", (response) => {
    return response.statusCode === 200 && response.body.server === "backend";
  });
  compose(["stop", "backend"]);

  try {
    const failed = await requestRaw(`/api/v1/intakes/ws?token=${secret}`);
    assert.ok([502, 503, 504].includes(failed.statusCode));
    assert.doesNotThrow(() => JSON.parse(failed.text));

    const health = await requestJson("/gateway/healthz");
    assert.equal(health.statusCode, 200);

    await sleep(1000);
    const logs = compose(["logs", "--no-color", "gateway"]);
    assert.doesNotMatch(logs, new RegExp(secret));
    assert.match(logs, /"uri":"\/api\/v1\/intakes\/ws"/);
  } finally {
    compose(["up", "-d", "--force-recreate", "backend"]);
    await waitForRoute("/api/v1/backend/healthz", (response) => response.statusCode === 200);
  }
});

test("gateway survives backend recreate without restart and re-resolves docker dns", async () => {
  const recreation = await recreateUpstreamWithReservedOldIp("backend");

  const response = await waitForRoute("/api/v1/backend/healthz", (candidate) => {
    return candidate.statusCode === 200 && candidate.body.server === "backend";
  });

  const gatewayIdAfter = composeContainerId("gateway");
  assert.equal(gatewayIdAfter, recreation.gatewayIdBefore);
  assert.notEqual(recreation.upstreamIdAfter, recreation.upstreamIdBefore);
  assert.notEqual(recreation.upstreamIpAfter, recreation.upstreamIpBefore);
  assert.equal(response.body.url, "/api/v1/healthz");
});

test("gateway survives services recreate without restart and re-resolves docker dns", async () => {
  const recreation = await recreateUpstreamWithReservedOldIp("services");

  const response = await waitForRoute("/api/v1/services/orders/", (candidate) => {
    return candidate.statusCode === 200 && candidate.body.server === "services";
  });

  const gatewayIdAfter = composeContainerId("gateway");
  assert.equal(gatewayIdAfter, recreation.gatewayIdBefore);
  assert.notEqual(recreation.upstreamIdAfter, recreation.upstreamIdBefore);
  assert.notEqual(recreation.upstreamIpAfter, recreation.upstreamIpBefore);
  assert.equal(response.body.url, "/api/v1/orders/");
});
