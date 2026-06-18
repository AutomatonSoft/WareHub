import http from "node:http";

const [name, portValue] = process.argv.slice(2);
const port = Number.parseInt(portValue ?? "", 10);

if (!name || Number.isNaN(port)) {
  throw new Error("Usage: node mock-upstream.mjs <name> <port>");
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (req.url === "/__health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: name }));
    return;
  }

  if (req.url === "/api/v1/test/upstream-503") {
    res.writeHead(503, { "content-type": "application/json", "x-mock-server": name });
    res.end(JSON.stringify({ source: "application" }));
    return;
  }

  if (name === "frontend" && req.url === "/login" && req.headers["x-mock-response-status"] === "503") {
    res.writeHead(503, { "content-type": "application/json", "x-mock-server": name });
    res.end(JSON.stringify({ source: "application", server: name }));
    return;
  }

  const body = Buffer.concat(chunks).toString("utf8");
  const responseHeaders = {
    "content-type": "application/json",
    "x-mock-server": name
  };

  if (req.headers["x-mock-conflicting-identity"] === "true") {
    responseHeaders["x-request-id"] = "upstream-conflicting-id";
    responseHeaders.deprecation = "false";
  }

  res.writeHead(200, responseHeaders);
  res.end(
    JSON.stringify({
      server: name,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body
    })
  );
});

server.on("upgrade", (req, socket) => {
  if (!req.url?.startsWith("/api/v1/intakes/ws")) {
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  const protocol = req.headers["sec-websocket-protocol"];

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `X-Mock-Server: ${name}\r\n` +
      `X-Mock-Path: ${req.url}\r\n` +
      `X-Mock-Request-Id: ${req.headers["x-request-id"] ?? ""}\r\n` +
      `X-Mock-WebSocket-Protocol: ${protocol ?? ""}\r\n` +
      (protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : "") +
      "\r\n"
  );
  socket.end();
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`mock ${name} listening on ${port}\n`);
});
