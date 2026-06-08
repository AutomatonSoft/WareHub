export function formatCreateProductApiError(status, errorText, fallbackPrefix) {
  const suffix = String(errorText || "").trim() ? ` - ${String(errorText || "").trim()}` : "";
  return `${fallbackPrefix} HTTP ${status}${suffix}`;
}

export function extractErrorTextFromBody(body) {
  if (!body || typeof body !== "object") {
    return "";
  }
  if (typeof body.message === "string") {
    return body.message;
  }
  if (typeof body.code === "string") {
    return body.code;
  }
  return "";
}

export function normalizeCreateProductRuntimeError(error, fallbackMessage) {
  if (error && typeof error.message === "string" && String(error.message).trim()) {
    return String(error.message);
  }
  return fallbackMessage;
}
