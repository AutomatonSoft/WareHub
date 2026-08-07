import type { paths } from "../../lib/api/generated/openapi-types";
import { apiFetch } from "../../lib/api/client";

export type KauflandSite = "jv" | "xl";

export type KauflandResponse = {
  detail?: string;
  [key: string]: unknown;
};

type JsonBodyOf<T> = T extends { content: { "application/json": infer B } } ? B : Record<string, unknown>;
type KauflandChangeBody = JsonBodyOf<paths["/api/v1/services/kaufland/products/ean/change"]["post"]["requestBody"]>;
export type KauflandWriteBody = {
  ean: string;
  controller: "jv" | "xl";
  category?: string[];
  title?: string;
  mpn?: string;
  short_description?: string[];
  description?: string;
  picture?: string[];
  manufacturer?: string;
  product_dimensions?: string;
  colour?: string;
  length?: string;
  width?: string;
  height?: string;
  material?: string;
  storefront?: string;
  product_safety_contact?: Record<string, unknown>[];
  category_detail?: Record<string, unknown>[];
  material_composition?: string;
  abnehmbarer_bezug?: string;
  parts_of_animal_origin?: string;
  price?: number;
  unit_id?: number;
  picture_urls?: string[];
  size?: string;
  color?: string;
  delivery?: number;
};
type KauflandDeleteBody = {
  ean: string;
  controller: "jv" | "xl";
};

export async function uploadKauflandImages(params: {
  ean: string;
  files?: File[];
  sourceUrls?: string[];
}): Promise<string[]> {
  const formData = new FormData();
  for (const file of params.files ?? []) {
    formData.append("images", file);
  }
  const sourceUrls = Array.from(new Set((params.sourceUrls ?? [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
  if (sourceUrls.length > 0) {
    formData.append("source_urls", JSON.stringify(sourceUrls));
  }
  const query = new URLSearchParams({ site: "KAUFLAND", ean: params.ean.trim() });
  const response = await apiFetch(`/api/v1/uploads/images/?${query.toString()}`, {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json().catch(() => ({}))) as { uploaded_image_urls?: unknown; detail?: unknown };
  if (!response.ok) {
    throw new Error(String(payload.detail || `Kaufland image upload failed: HTTP ${response.status}`));
  }
  const urls = Array.isArray(payload.uploaded_image_urls)
    ? payload.uploaded_image_urls.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (urls.length === 0) {
    throw new Error("Kaufland image upload completed without image URLs.");
  }
  return urls;
}

export async function fetchKauflandByEan(params: {
  ean: string;
  site: KauflandSite;
}): Promise<{ response: Response; payload: KauflandResponse }> {
  const response = await apiFetch(
    `/api/v1/services/kaufland/${encodeURIComponent(params.ean)}/${encodeURIComponent(params.site)}/`,
    {}
  );

  const payload = (await response.json().catch(() => ({}))) as KauflandResponse;
  return { response, payload };
}

export async function changeKauflandByEan(payload: KauflandChangeBody): Promise<{
  response: Response;
  rawText: string;
  parsed: unknown;
}> {
  const response = await apiFetch("/api/v1/services/kaufland/products/ean/change/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const rawText = await response.text();
  let parsed: unknown = rawText;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = rawText;
    }
  } else {
    parsed = { detail: "empty response body" };
  }

  return { response, rawText, parsed };
}

export async function deleteKauflandByEan(payload: KauflandDeleteBody): Promise<{
  response: Response;
  rawText: string;
  parsed: unknown;
}> {
  const response = await apiFetch("/api/v1/services/kaufland/products/delete/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const rawText = await response.text();
  let parsed: unknown = rawText;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = rawText;
    }
  } else {
    parsed = { detail: "empty response body" };
  }

  return { response, rawText, parsed };
}

export async function createKauflandByEan(payload: KauflandWriteBody): Promise<{
  response: Response;
  rawText: string;
  parsed: unknown;
}> {
  const response = await apiFetch("/api/v1/services/kaufland/products/create/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const rawText = await response.text();
  let parsed: unknown = rawText;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = rawText;
    }
  } else {
    parsed = { detail: "empty response body" };
  }

  return { response, rawText, parsed };
}
