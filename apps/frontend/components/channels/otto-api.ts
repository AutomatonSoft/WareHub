import { apiFetch } from "../../lib/api/client";

export type OttoProfile = "jv" | "xl";

type OttoProductBySkuResponse = {
  detail?: unknown;
  product_variations?: unknown;
};

function errorMessage(payload: OttoProductBySkuResponse, status: number): string {
  return typeof payload.detail === "string" && payload.detail.trim()
    ? payload.detail.trim()
    : `OTTO product request failed: HTTP ${status}`;
}

export async function fetchOttoProductBySku(profile: OttoProfile, sku: string): Promise<Record<string, unknown>> {
  const normalizedSku = sku.trim();
  if (!normalizedSku) {
    throw new Error("OTTO SKU is empty.");
  }

  const response = await apiFetch(
    `/api/v1/services/otto/${encodeURIComponent(profile)}/products/by-sku/${encodeURIComponent(normalizedSku)}/`,
  );
  const payload = await response.json() as OttoProductBySkuResponse;
  if (!response.ok) {
    throw new Error(errorMessage(payload, response.status));
  }

  const variation = Array.isArray(payload.product_variations) ? payload.product_variations[0] : null;
  if (!variation || typeof variation !== "object" || Array.isArray(variation)) {
    throw new Error("OTTO product response did not contain a product variation.");
  }

  return variation as Record<string, unknown>;
}
