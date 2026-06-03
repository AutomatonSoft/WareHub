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
    return error.message;
  }
  return fallbackMessage;
}
