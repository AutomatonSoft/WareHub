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
    const message = String(error.message);
    if (message === "create_product_main_ean_empty") {
      return fallbackMessage;
    }
    if (message.startsWith("create_product_jv_source_sites_http:")) {
      const status = message.split(":")[1] || "0";
      return `${fallbackMessage}: HTTP ${status}`;
    }
    if (message.startsWith("create_product_jv_source_product_http:")) {
      const status = message.split(":")[1] || "0";
      return `${fallbackMessage}: HTTP ${status}`;
    }
    return message;
  }
  return fallbackMessage;
}
