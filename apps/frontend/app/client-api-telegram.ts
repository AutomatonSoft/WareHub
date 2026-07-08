import { apiFetch } from "../lib/api/client";
import { readAuth } from "./client-api-shared";
import { syncDatabaseServiceSession } from "./services-session";
import type { AdminUser, TelegramAccessEntry, TelegramAccessQueryParams } from "./client-api-types";


function buildQuery(params?: TelegramAccessQueryParams): string {
  const query = new URLSearchParams();
  if (params?.search && params.search.trim().length > 0) {
    query.set("search", params.search.trim());
  }
  if (params?.status && params.status !== "all") {
    query.set("status", params.status);
  }
  if (params?.sort) {
    query.set("sort", params.sort);
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}


async function requestServices(path: string, init: RequestInit = {}): Promise<Response> {
  const perform = () =>
    apiFetch(path, {
      method: (init.method as "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | undefined) ?? "GET",
      headers: init.headers,
      body: init.body ?? null,
    });

  let response = await perform();
  if (response.status !== 403) {
    return response;
  }

  const auth = readAuth();
  if (!auth?.token) {
    return response;
  }

  const synced = await syncDatabaseServiceSession(auth.token).catch(() => false);
  if (!synced) {
    return response;
  }
  response = await perform();
  return response;
}


async function parseFailure(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null);
  const detail =
    body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
      ? body.detail
      : fallback;
  return new Error(detail);
}


export async function fetchTelegramAccessEntries(params?: TelegramAccessQueryParams): Promise<TelegramAccessEntry[]> {
  const response = await requestServices(`/api/v1/services/telegram/access/${buildQuery(params)}`);
  if (!response.ok) {
    throw await parseFailure(response, `Telegram access request failed: HTTP ${response.status}`);
  }
  return (await response.json()) as TelegramAccessEntry[];
}


export async function approveTelegramAccess(bindingId: number, matchedUser?: AdminUser | null): Promise<TelegramAccessEntry> {
  const response = await requestServices(`/api/v1/services/telegram/access/${bindingId}/approve/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_user: matchedUser
        ? {
            id: matchedUser.id,
            username: matchedUser.username,
            login: matchedUser.login,
            email: matchedUser.email,
          }
        : null,
    }),
  });
  if (!response.ok) {
    throw await parseFailure(response, `Approve telegram access failed: HTTP ${response.status}`);
  }
  return (await response.json()) as TelegramAccessEntry;
}


export async function revokeTelegramAccess(bindingId: number): Promise<TelegramAccessEntry> {
  const response = await requestServices(`/api/v1/services/telegram/access/${bindingId}/revoke/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await parseFailure(response, `Revoke telegram access failed: HTTP ${response.status}`);
  }
  return (await response.json()) as TelegramAccessEntry;
}
