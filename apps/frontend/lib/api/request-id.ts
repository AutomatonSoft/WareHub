export function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const now = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `req_${now}_${random}`;
}

export function ensureRequestIdHeader(headers?: HeadersInit): Headers {
  const next = new Headers(headers ?? {});
  if (!next.get("x-request-id")) {
    next.set("x-request-id", createRequestId());
  }
  return next;
}
