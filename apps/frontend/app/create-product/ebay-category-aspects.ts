import { apiFetch } from "../../lib/api/client";
import type { EbayCategoryAspect } from "./create-product-model";

export async function fetchEbayCategoryAspects(categoryId: string): Promise<EbayCategoryAspect[]> {
  const params = new URLSearchParams({ marketplace_id: "EBAY_DE", category_id: categoryId });
  const response = await apiFetch(`/api/v1/ebay/taxonomy/category-aspects/?${params.toString()}`, { method: "GET" });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string"
      ? payload.detail
      : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  if (!payload || typeof payload !== "object" || !("aspects" in payload) || !Array.isArray(payload.aspects)) {
    throw new Error("eBay taxonomy response does not contain category aspects.");
  }
  return payload.aspects as EbayCategoryAspect[];
}
