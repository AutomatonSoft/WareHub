import type { ProductEditorDiscoverResponse, ProductEditorGroupId } from "./product-editor-types";

export function buildJvAutoLoadKey(group: "JV" | "XL", ean: string, baselineTargetId?: string | null): string {
  return `${group}:${ean.trim()}::${String(baselineTargetId ?? "").trim()}`;
}

export function createProductEditorDiscoveryLoader(
  fetchDiscovery: (ean: string, group?: ProductEditorGroupId, account?: "jv" | "xl") => Promise<ProductEditorDiscoverResponse>,
) {
  const pending = new Map<string, Promise<ProductEditorDiscoverResponse>>();
  return (ean: string, group?: ProductEditorGroupId, account?: "jv" | "xl"): Promise<ProductEditorDiscoverResponse> => {
    const key = JSON.stringify([ean.trim(), group ?? null, account ?? null]);
    const existing = pending.get(key);
    if (existing) return existing;
    const request = fetchDiscovery(ean.trim(), group, account).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
