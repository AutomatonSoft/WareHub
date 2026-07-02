const LOCAL_SERVICES_PROXY_BASE = "/api/v1/services";

<<<<<<< HEAD
function ensureServicesNamespace(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  if (!normalized) {
    return LOCAL_SERVICES_PROXY_BASE;
  }
  if (/^https?:\/\/[^/]+\/api\/v1\/services(?:\/|$)/i.test(normalized)) {
    return normalized;
  }
  if (/^\/api\/v1\/services(?:\/|$)/i.test(normalized)) {
    return normalized;
  }
  if (/^https?:\/\/[^/]+\/api\/v1(?:\/|$)/i.test(normalized)) {
    return normalized.replace(/\/api\/v1(?:\/.*)?$/i, "/api/v1/services");
  }
  if (/^\/api\/v1(?:\/|$)/i.test(normalized)) {
    return LOCAL_SERVICES_PROXY_BASE;
  }
  return normalized;
}

=======
>>>>>>> origin/main
function normalizeLocalServicesPath(value: string): string | null {
  const normalized = value.replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }
  if (normalized === "/api/v1/services") {
    return LOCAL_SERVICES_PROXY_BASE;
  }
<<<<<<< HEAD
  if (normalized === "/api/v1") {
    return LOCAL_SERVICES_PROXY_BASE;
  }
=======
>>>>>>> origin/main
  if (normalized === "/services") {
    return LOCAL_SERVICES_PROXY_BASE;
  }
  return null;
}

function normalizeLocalServicesHost(value: string): string | null {
  const normalized = value.replace(/\/+$/, "");
  if (
<<<<<<< HEAD
    normalized === "http://localhost:8931" ||
    normalized === "http://127.0.0.1:8931" ||
    normalized === "http://localhost:8934" ||
    normalized === "http://127.0.0.1:8934" ||
    normalized.startsWith("http://localhost:8931/api/v1") ||
    normalized.startsWith("http://127.0.0.1:8931/api/v1") ||
    normalized.startsWith("http://localhost:8932/api/v1") ||
    normalized.startsWith("http://127.0.0.1:8932/api/v1") ||
=======
    normalized === "http://localhost:8934" ||
    normalized === "http://127.0.0.1:8934" ||
>>>>>>> origin/main
    normalized.startsWith("http://localhost:8934/api/v1") ||
    normalized.startsWith("http://127.0.0.1:8934/api/v1")
  ) {
    return LOCAL_SERVICES_PROXY_BASE;
  }
  return null;
}

export function resolveServicesApiBase(rawValue: string | undefined): string {
  const raw = rawValue?.trim() || LOCAL_SERVICES_PROXY_BASE;
  const normalized = raw.replace(/\/+$/, "");

<<<<<<< HEAD
  return ensureServicesNamespace(
=======
  return (
>>>>>>> origin/main
    normalizeLocalServicesPath(normalized) ??
    normalizeLocalServicesHost(normalized) ??
    normalized
  );
}

