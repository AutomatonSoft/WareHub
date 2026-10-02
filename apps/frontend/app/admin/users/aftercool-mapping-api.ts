import { apiFetch } from "../../../lib/api/client";
import { syncDatabaseServiceSession } from "../../services-session";

export type MappingState = {
  configured: boolean;
  missing: string[];
  csrf_token?: string;
  job: {
    job_id: string | null;
    status: "idle" | "queued" | "running" | "completed" | "failed";
    phase: string;
    error: string | null;
    recovering: boolean;
    updated_at: string | null;
    jv_loaded: number;
    xl_loaded: number;
    mapped: number;
    jv_complete: boolean;
    xl_complete: boolean;
  } | null;
};

export async function requestAftercoolMapping(token: string, start = false): Promise<MappingState> {
  if (!await syncDatabaseServiceSession(token)) {
    throw new Error("Session synchronization failed.");
  }
  const url = "/api/v1/jv/gallery-mapping/";
  let headers: HeadersInit | undefined;
  if (start) {
    const statusResponse = await apiFetch(url);
    const statusBody = await statusResponse.json();
    if (!statusResponse.ok || !statusBody.csrf_token) throw new Error("Unable to prepare secure mapping request.");
    headers = { "X-CSRFToken": statusBody.csrf_token };
  }
  const response = await apiFetch(url, { method: start ? "POST" : "GET", headers });
  const body = await response.json();
  if (!response.ok && !(response.status === 409 && body.job)) {
    throw new Error(body.message ?? `HTTP ${response.status}`);
  }
  return body as MappingState;
}
