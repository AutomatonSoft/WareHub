import { HoodAccount, HoodResponse } from "./hood-search-utils";
import type { paths } from "../../lib/api/generated/openapi-types";
import { apiFetch } from "../../lib/api/client";

type JsonBodyOf<T> = T extends { content: { "application/json": infer B } } ? B : Record<string, unknown>;
type HoodPatchJsonBody = Record<string, unknown> &
  JsonBodyOf<paths["/api/hood/items/by-ean/{ean}/"]["patch"]["requestBody"]>;
type HoodDeleteBody = Record<string, unknown> &
  JsonBodyOf<paths["/api/hood/items/by-ean/{ean}/"]["delete"]["requestBody"]>;

function getHoodApiBase(): string {
  return "/api/hood";
}

function buildHoodByEanUrl(ean: string, account: HoodAccount): string {
  return `${getHoodApiBase()}/items/by-ean/${encodeURIComponent(ean)}/?account=${account}`;
}

function buildHoodByEanFallbackUrls(ean: string, account: HoodAccount): string[] {
  const encodedEan = encodeURIComponent(ean);
  return [
    `/api/hood/items/by-ean/${encodedEan}/?account=${account}`,
    `/api/services/v1/hood/items/by-ean/${encodedEan}/?account=${account}`,
    `/api/services/hood/items/by-ean/${encodedEan}/?account=${account}`
  ];
}

async function parseJsonSafe(response: Response): Promise<HoodResponse> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as HoodResponse;
  } catch {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
    return {
      detail: `Non-JSON response (HTTP ${response.status})`,
      body: snippet,
      status_code: response.status
    };
  }
}

export async function fetchHoodByEan(ean: string, account: HoodAccount): Promise<{ response: Response; payload: HoodResponse }> {
  let last: { response: Response; payload: HoodResponse } | null = null;
  for (const url of buildHoodByEanFallbackUrls(ean, account)) {
    const response = await apiFetch(url);
    const payload = await parseJsonSafe(response);
    if (response.ok) return { response, payload };
    last = { response, payload };
  }
  if (last) return last;
  const response = await apiFetch(buildHoodByEanUrl(ean, account));
  const payload = await parseJsonSafe(response);
  return { response, payload };
}

export async function patchHoodByEan(params: {
  ean: string;
  account: HoodAccount;
  payloadObject: HoodPatchJsonBody;
  changedKeys: string[];
  patchFiles: File[];
  uploadOnly?: boolean;
}): Promise<{ response: Response; payload: unknown }> {
  const requestUrls = buildHoodByEanFallbackUrls(params.ean, params.account).map((url) =>
    params.uploadOnly ? `${url}${url.includes("?") ? "&" : "?"}upload_only=1` : url
  );
  const hasFiles = params.patchFiles.length > 0;

  let response: Response | null = null;
  for (const requestUrl of requestUrls) {
    if (hasFiles) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(params.payloadObject)) {
        if (key === "images" && Array.isArray(value)) {
          formData.append("images", JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
      if (params.changedKeys.length > 0) {
        formData.append("changed_fields", params.changedKeys.join(","));
      }
      for (const file of params.patchFiles) {
        formData.append("images_files", file);
      }

      response = await apiFetch(requestUrl, {
        method: "PATCH",
        body: formData
      });
    } else {
      response = await apiFetch(requestUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...params.payloadObject,
          ...(params.changedKeys.length > 0 ? { changed_fields: params.changedKeys } : {})
        } satisfies HoodPatchJsonBody)
      });
    }

    if (response.ok) break;
  }

  let payload: unknown = null;
  try {
    payload = response ? await response.json() : null;
  } catch {
    payload = null;
  }
  return { response: response as Response, payload };
}

export async function deleteHoodImageByEan(params: {
  ean: string;
  account: HoodAccount;
  url: string;
}): Promise<{ response: Response; payload: HoodResponse }> {
  let last: { response: Response; payload: HoodResponse } | null = null;
  for (const requestUrl of buildHoodByEanFallbackUrls(params.ean, params.account)) {
    const response = await apiFetch(requestUrl, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: params.url } satisfies HoodDeleteBody)
    });

    const payload = await parseJsonSafe(response);
    if (response.ok) return { response, payload };
    last = { response, payload };
  }
  if (last) return last;
  const response = await apiFetch(buildHoodByEanUrl(params.ean, params.account), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url: params.url } satisfies HoodDeleteBody)
  });
  const payload = await parseJsonSafe(response);
  return { response, payload };
}
