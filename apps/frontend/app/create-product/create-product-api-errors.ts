import { ApiError } from "../../lib/api/client";

export function formatCreateProductApiError(status: number, errorText: string, fallbackPrefix: string): string {
  const suffix = errorText.trim() ? ` - ${errorText.trim()}` : "";
  return `${fallbackPrefix} HTTP ${status}${suffix}`;
}

export function extractErrorTextFromBody(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string") {
    return record.message;
  }
  if (typeof record.code === "string") {
    return record.code;
  }
  return "";
}

export function normalizeCreateProductRuntimeError(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    if (error.message === "create_product_main_ean_empty") {
      return fallbackMessage;
    }
    if (error.message.startsWith("create_product_jv_source_sites_http:")) {
      const status = error.message.split(":")[1] || "0";
      return `${fallbackMessage}: HTTP ${status}`;
    }
    if (error.message.startsWith("create_product_jv_source_product_http:")) {
      const status = error.message.split(":")[1] || "0";
      return `${fallbackMessage}: HTTP ${status}`;
    }
    return error.message;
  }
  return fallbackMessage;
}
