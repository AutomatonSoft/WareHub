const LOCAL_SERVICES_PROXY_BASE = "/api/v1/services";

function normalizeLocalServicesPath(value: string): string | null {
  const normalized = value.replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }
  if (normalized === "/api/v1/services") {
    return LOCAL_SERVICES_PROXY_BASE;
  }
  if (normalized === "/services") {
    return LOCAL_SERVICES_PROXY_BASE;
  }
  return null;
}

function normalizeLocalServicesHost(value: string): string | null {
  const normalized = value.replace(/\/+$/, "");
  if (
    normalized === "http://localhost:8934" ||
    normalized === "http://127.0.0.1:8934" ||
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

  return (
    normalizeLocalServicesPath(normalized) ??
    normalizeLocalServicesHost(normalized) ??
    normalized
  );
}

