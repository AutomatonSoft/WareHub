"use client";

import { apiFetch } from "../lib/api/client";
import { bootstrapAuthSession, getAccessToken, DEFAULT_API_BASE } from "./client-api-shared";

export async function syncDatabaseServiceSession(token: string): Promise<boolean> {
  const normalizedToken =
    token.trim() ||
    getAccessToken() ||
    (await bootstrapAuthSession(process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE))?.token ||
    "";
  if (!normalizedToken) {
    return false;
  }

  const response = await apiFetch("/api/v1/services/dev/session/sync/", {
    method: "GET",
    headers: { Authorization: `Bearer ${normalizedToken}` }
  });

  if (response.ok) {
    return true;
  }

  if (response.status === 404) {
    return false;
  }

  return false;
}
