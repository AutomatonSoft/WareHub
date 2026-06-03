import type { paths } from "../../lib/api/generated/openapi-types";
import { apiFetch } from "../../lib/api/client";

export type KauflandSite = "jv" | "xl";

export type KauflandResponse = {
  detail?: string;
  [key: string]: unknown;
};

type JsonBodyOf<T> = T extends { content: { "application/json": infer B } } ? B : Record<string, unknown>;
type KauflandChangeBody = JsonBodyOf<paths["/api/services/kaufland/products/ean/change/"]["post"]["requestBody"]>;
type KauflandCreateBody = {
  ean: string;
  controller: "jv" | "xl";
  title?: string;
  description: string;
  picture: unknown;
  price: number;
  size: string;
  color: string;
  material: string;
  delivery: string;
  height: string;
  length: string;
  width: string;
  picture_urls?: string[];
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
    `/api/services/v1/kaufland/${encodeURIComponent(params.ean)}/${encodeURIComponent(params.site)}/`,
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
  const response = await apiFetch("/api/services/kaufland/products/ean/change/", {
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
  const response = await apiFetch("/api/services/kaufland/products/delete/", {
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

export async function createKauflandByEan(payload: KauflandCreateBody): Promise<{
  response: Response;
  rawText: string;
  parsed: unknown;
}> {
  const response = await apiFetch("/api/services/kaufland/products/create/", {
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

export type { KauflandCreateBody };
