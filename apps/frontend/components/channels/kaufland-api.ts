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
};
type KauflandDeleteBody = {
  ean: string;
  controller: "jv" | "xl";
};

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
