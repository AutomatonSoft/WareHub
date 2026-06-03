import type { CreateIntakePayload, IntakeDto, IntakesQueryParams } from "./client-api-types";
import { parseError } from "./client-api-shared";

export async function fetchIntakes(
  apiBase: string,
  token: string,
  limit = 100,
  params?: Omit<IntakesQueryParams, "limit">
): Promise<IntakeDto[]> {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  if (typeof params?.offset === "number") {
    query.set("offset", String(params.offset));
  }
  if (params?.search && params.search.trim().length > 0) {
    query.set("search", params.search.trim());
  }
  if (params?.section) {
    query.set("section", params.section);
  }
  if (params?.activity && params.activity !== "all") {
    query.set("activity", params.activity);
  }
  const response = await fetch(`${apiBase}/intakes?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Intakes request failed: HTTP ${response.status}`);
  }
  return (await response.json()) as IntakeDto[];
}

export async function uploadImage(
  apiBase: string,
  token: string,
  file: File,
  kind: "product" | "avatar" = "product"
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${apiBase}/uploads?kind=${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Upload failed: HTTP ${response.status}`));
  }
  const payload = (await response.json()) as { url: string };
  return payload.url;
}

export async function createIntake(
  apiBase: string,
  token: string,
  payload: CreateIntakePayload
): Promise<IntakeDto> {
  const response = await fetch(`${apiBase}/kids/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Create intake failed: HTTP ${response.status}`));
  }
  return (await response.json()) as IntakeDto;
}
