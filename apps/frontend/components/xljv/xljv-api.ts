import { RubricTreeNode, Site, XLAllSitesResult, XLJVResponse } from "./xljv-search-utils";
import { XLJVProduct } from "./xljv-edit-utils";
import { apiFetch } from "../../lib/api/client";

type TakeNextFreeBody = Record<string, unknown>;
type CreateAndPushBody = Record<string, unknown>;
type SyncByEanBody = Record<string, unknown>;
type BatchApplyBody = Record<string, unknown>;
type UpdateByEanBody = Record<string, unknown>;

function buildQuery(params: Record<string, string>): string {
  const query = Object.entries(params)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? `?${query}` : "";
}

function xljvBasePath(site: Site): string {
  return site === "JV" ? "/api/jv" : "/api/xl";
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
    return {
      detail: `Non-JSON response (HTTP ${response.status})`,
      raw_snippet: snippet
    };
  }
}

async function postJsonWithFallback(
  paths: string[],
  body: Record<string, unknown>
): Promise<{ response: Response; payload: Record<string, unknown> }> {
  let lastResponse: Response | null = null;
  let lastPayload: Record<string, unknown> = {};
  for (const path of paths) {
    const response = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await parseJsonSafe(response);
    if (response.ok) {
      return { response, payload };
    }
    lastResponse = response;
    lastPayload = payload;
  }
  if (!lastResponse) {
    throw new Error("No fallback endpoint responded.");
  }
  return { response: lastResponse, payload: lastPayload };
}

async function postFormDataWithFallback(
  paths: string[],
  formData: FormData,
  params: Record<string, string>
): Promise<{ response: Response; payload: Record<string, unknown> }> {
  let lastResponse: Response | null = null;
  let lastPayload: Record<string, unknown> = {};
  for (const path of paths) {
    const response = await apiFetch(`${path}${buildQuery(params)}`, { method: "POST", body: formData });
    const payload = await parseJsonSafe(response);
    if (response.ok) {
      return { response, payload };
    }
    lastResponse = response;
    lastPayload = payload;
  }
  if (!lastResponse) {
    throw new Error("No fallback endpoint responded.");
  }
  return { response: lastResponse, payload: lastPayload };
}

export async function xljvGetProductByEan(params: {
  ean: string;
  site: Site;
  siteKey?: string;
}): Promise<{ response: Response; payload: XLJVResponse }> {
  const url = `${xljvBasePath(params.site)}/products/by-ean/${encodeURIComponent(params.ean)}${buildQuery({
    site: params.site,
    ...(params.siteKey?.trim() ? { site_key: params.siteKey.trim() } : {})
  })}`;
  const response = await apiFetch(url);
  const payload = (await parseJsonSafe(response)) as XLJVResponse;
  return { response, payload };
}

export async function xljvGetSitesByEan(params: {
  ean: string;
  site: Site;
}): Promise<{ response: Response; payload: XLAllSitesResult & { detail?: string } }> {
  const url = `${xljvBasePath(params.site)}/sites/by-ean/${encodeURIComponent(params.ean)}${buildQuery({
    site: params.site
  })}`;
  const response = await apiFetch(url);
  const payload = (await parseJsonSafe(response)) as XLAllSitesResult & { detail?: string };
  return { response, payload };
}

export async function xljvTakeNextEan(): Promise<{ response: Response; payload: Record<string, unknown> }> {
  return postJsonWithFallback(
    ["/api/services/v1/ean-pool/take-next-free/", "/api/services/ean-pool/take-next-free/"],
    {} satisfies TakeNextFreeBody
  );
}

export async function xljvUploadImages(params: {
  site: Site;
  siteKey?: string;
  ean?: string;
  files: File[];
  imageRole?: "main" | "additional";
}): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const formData = new FormData();
  for (const file of params.files) formData.append("images", file);
  return postFormDataWithFallback(
    ["/api/services/uploads/images"],
    formData,
    {
      ...(params.site ? { site: params.site } : {}),
      ...(params.siteKey?.trim() ? { site_key: params.siteKey.trim() } : {}),
      ...(params.ean?.trim() ? { ean: params.ean.trim() } : {}),
      ...(params.imageRole ? { image_role: params.imageRole } : {})
    }
  );
}

export async function xljvCreateAndPush(params: {
  site: Site;
  siteKey?: string;
  payload: CreateAndPushBody;
}): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const response = await apiFetch(
    `${xljvBasePath(params.site)}/products/create-and-push${buildQuery({
      site: params.site,
      ...(params.siteKey?.trim() ? { site_key: params.siteKey.trim() } : {})
    })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.payload)
    }
  );
  const payload = await parseJsonSafe(response);
  return { response, payload };
}

export async function xljvSyncByEan(params: {
  ean: string;
  site: Site;
  siteKey?: string;
  requestBody?: SyncByEanBody;
  batch?: boolean;
}): Promise<{ response: Response; text: string }> {
  const url = params.batch
    ? `${xljvBasePath(params.site)}/batch/update-by-ean/${encodeURIComponent(params.ean)}/apply/${buildQuery({})}`
    : `${xljvBasePath(params.site)}/products/sync-by-ean/${encodeURIComponent(params.ean)}${buildQuery({
        site: params.site,
        ...(params.siteKey?.trim() ? { site_key: params.siteKey.trim() } : {})
      })}`;
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params.requestBody ?? {})
  });
  const text = await response.text();
  return { response, text };
}

export async function xljvBatchApplyByEan(params: {
  ean: string;
  site: Site;
  requestBody: BatchApplyBody;
}): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const response = await apiFetch(
    `${xljvBasePath(params.site)}/batch/update-by-ean/${encodeURIComponent(params.ean)}/apply/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.requestBody)
    }
  );
  const payload = await parseJsonSafe(response);
  return { response, payload };
}

export async function xljvLocalByEan(params: {
  ean: string;
  site: Site;
  siteKey?: string;
}): Promise<{ response: Response; payload: XLJVProduct }> {
  const response = await apiFetch(
    `${xljvBasePath(params.site)}/products/local-by-ean/${encodeURIComponent(params.ean)}${buildQuery({
      site: params.site,
      ...(params.siteKey?.trim() ? { site_key: params.siteKey.trim() } : {})
    })}`,
    {}
  );
  const payload = (await parseJsonSafe(response)) as XLJVProduct;
  return { response, payload };
}

export async function xljvUpdateByEan(params: {
  ean: string;
  site: Site;
  siteKey?: string;
  payload: UpdateByEanBody;
}): Promise<{ response: Response; payload: XLJVProduct }> {
  const response = await apiFetch(
    `${xljvBasePath(params.site)}/products/update-by-ean/${encodeURIComponent(params.ean)}${buildQuery({
      site: params.site,
      ...(params.siteKey?.trim() ? { site_key: params.siteKey.trim() } : {})
    })}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.payload)
    }
  );
  const payload = (await parseJsonSafe(response)) as XLJVProduct;
  return { response, payload };
}

export async function xljvGetRubricsTree(params: {
  site: Site;
  siteKey?: string;
  language?: string;
}): Promise<{ response: Response; payload: { items?: RubricTreeNode[]; tree?: RubricTreeNode[]; detail?: string } }> {
  const response = await apiFetch(
    `${xljvBasePath(params.site)}/rubrics/tree${buildQuery({
      site: params.site,
      ...(params.siteKey?.trim() ? { site_key: params.siteKey.trim() } : {}),
      ...(params.language?.trim() ? { language: params.language.trim() } : {})
    })}`
  );
  const payload = (await parseJsonSafe(response)) as { items?: RubricTreeNode[]; tree?: RubricTreeNode[]; detail?: string };
  return { response, payload };
}

export async function xljvGetDeliveryOptions(params: {
  site: Site;
  siteKey?: string;
  language?: string;
}): Promise<{ response: Response; payload: { items?: Array<{ id: number; label: string; is_default?: boolean }>; detail?: string } }> {
  const response = await apiFetch(
    `${xljvBasePath(params.site)}/delivery-options${buildQuery({
      site: params.site,
      ...(params.siteKey?.trim() ? { site_key: params.siteKey.trim() } : {}),
      ...(params.language?.trim() ? { language: params.language.trim() } : {})
    })}`
  );
  const payload = (await parseJsonSafe(response)) as { items?: Array<{ id: number; label: string; is_default?: boolean }>; detail?: string };
  return { response, payload };
}
