import { ensureRequestIdHeader } from "./request-id";

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: HeadersInit;
  body?: BodyInit | null;
  cache?: RequestCache;
  credentials?: RequestCredentials;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch(url: string, options: ApiRequestOptions = {}): Promise<Response> {
  return fetch(url, {
    method: options.method ?? "GET",
    headers: ensureRequestIdHeader(options.headers),
    body: options.body,
    cache: options.cache ?? "no-store",
    credentials: options.credentials ?? "include"
  });
}

export async function apiJson<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(url, options);
  if (!response.ok) {
    throw new ApiError(`Request failed: HTTP ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

export async function apiJsonOrNull<T>(url: string, options: ApiRequestOptions = {}): Promise<T | null> {
  try {
    const response = await apiFetch(url, options);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function apiText(url: string, options: ApiRequestOptions = {}): Promise<string> {
  const response = await apiFetch(url, options);
  if (!response.ok) {
    throw new ApiError(`Request failed: HTTP ${response.status}`, response.status);
  }
  return response.text();
}
