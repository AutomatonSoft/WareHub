"use client";

import { apiFetch } from "../lib/api/client";

export async function syncDatabaseServiceSession(token: string): Promise<boolean> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return false;
  }

  const response = await apiFetch("/api/services/v1/dev/session/sync/", {
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
