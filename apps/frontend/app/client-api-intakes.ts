import type { CreateIntakePayload, IntakeDto, IntakesQueryParams } from "./client-api-types";
import { API_V1_ROUTES, buildApiV1Url } from "./api-v1-routes";
import { authorizedFetch, parseError } from "./client-api-shared";
import { readStoredLabel } from "./i18n";

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
  const response = await authorizedFetch(`${buildApiV1Url(apiBase, API_V1_ROUTES.intakes.list)}?${query.toString()}`, {}, { apiBase, token });
  if (!response.ok) {
    throw new Error(`${readStoredLabel("failedLoadIntakes", "Failed to load intakes.")}: HTTP ${response.status}`);
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
  const response = await authorizedFetch(`${buildApiV1Url(apiBase, API_V1_ROUTES.intakes.uploads)}?kind=${kind}`, {
    method: "POST",
    body: form
  }, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `${readStoredLabel("imageUploadFailed", "Image upload failed")}: HTTP ${response.status}`));
  }
  const payload = (await response.json()) as { url: string };
  return payload.url;
}

export async function createIntake(
  apiBase: string,
  token: string,
  payload: CreateIntakePayload
): Promise<IntakeDto> {
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.intakes.list), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `${readStoredLabel("createIntakeFailed", "Failed to create intake.")}: HTTP ${response.status}`));
  }
  return (await response.json()) as IntakeDto;
}
