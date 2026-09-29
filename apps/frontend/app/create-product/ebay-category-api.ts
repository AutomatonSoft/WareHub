import { apiFetch } from "../../lib/api/client";

export type EbayCategoryNode = {
  category_id: string;
  category_name: string;
  is_leaf: boolean;
  children?: EbayCategoryNode[];
};

export type EbayCategorySuggestion = {
  category?: { categoryId?: string; categoryName?: string };
  categoryTreeNodeAncestors?: Array<{ categoryName?: string }>;
};

async function taxonomyPayload(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await apiFetch(`/api/v1/ebay/taxonomy/${path}/?${params.toString()}`, { method: "GET" });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string"
      ? payload.detail
      : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid eBay taxonomy response.");
  return payload as Record<string, unknown>;
}

export async function fetchEbayCategoryNode(categoryId = ""): Promise<EbayCategoryNode> {
  const params = new URLSearchParams({ marketplace_id: "EBAY_DE" });
  if (categoryId) params.set("category_id", categoryId);
  const payload = await taxonomyPayload("category-tree", params);
  const node = payload.node;
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error("eBay taxonomy response has no category node.");
  return node as EbayCategoryNode;
}

export async function searchEbayCategorySuggestions(query: string): Promise<EbayCategorySuggestion[]> {
  const params = new URLSearchParams({ marketplace_id: "EBAY_DE", q: query });
  const payload = await taxonomyPayload("category-suggestions", params);
  if (!Array.isArray(payload.categorySuggestions)) throw new Error("eBay taxonomy response has no category suggestions.");
  return payload.categorySuggestions as EbayCategorySuggestion[];
}
