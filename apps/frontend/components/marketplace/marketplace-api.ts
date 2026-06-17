export type HealthPayload = {
  ok?: boolean;
  status_code?: number | null;
};
import type { paths } from "../../lib/api/generated/openapi-types";
import { apiFetch } from "../../lib/api/client";

type ServicesKidGetResponse =
  paths["/api/v1/services/kids/{id}"]["get"]["responses"][200]["content"]["application/json"];

export async function checkDatabaseAccess(): Promise<boolean> {
  try {
    const response = await apiFetch("/api/v1/services/kids/0/");
    if (response.ok) {
      await response.json().catch(() => null as ServicesKidGetResponse | null);
    }
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export async function fetchMarketplaceHealth(path: string): Promise<{
  status: "NOT_FOUND" | "DISCONNECTED" | "CONNECTED";
}> {
  try {
    const response = await apiFetch(path);
    if (response.status === 404) return { status: "NOT_FOUND" };
    if (!response.ok) return { status: "DISCONNECTED" };
    const payload = (await response.json().catch(() => null)) as HealthPayload | null;
    const hasInvalidPayloadStatus = payload?.status_code != null && (payload.status_code < 200 || payload.status_code >= 300);
    const hasExplicitFailure = payload?.ok === false;
    return { status: !hasInvalidPayloadStatus && !hasExplicitFailure ? "CONNECTED" : "DISCONNECTED" };
  } catch {
    return { status: "DISCONNECTED" };
  }
}
